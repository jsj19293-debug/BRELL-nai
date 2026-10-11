// 애니메이션 WebP 묶기 점검: node --experimental-strip-types scripts/check-webp-anim.mjs
import assert from 'node:assert/strict'
import { buildAnimatedWebp, extractWebpImageData, fitRect, sizeForRatio, slideshowSize } from '../src/lib/webp-anim.ts'

const ascii = text => [...text].map(char => char.charCodeAt(0))
const le32 = value => [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255]
const chunk = (name, payload) => [...ascii(name), ...le32(payload.length), ...payload, ...(payload.length & 1 ? [0] : [])]
const webp = chunks => { const body = chunks.flat(); return new Uint8Array([...ascii('RIFF'), ...le32(4 + body.length), ...ascii('WEBP'), ...body]) }
const text = (bytes, offset) => String.fromCharCode(...bytes.slice(offset, offset + 4))
const u24 = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
const u32 = (bytes, offset) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0

// 한 장짜리 WebP 세 종류: 손실(VP8), 투명도 있는 손실(VP8X + ALPH + VP8), 무손실(VP8L)
const lossy = webp([chunk('VP8 ', [1, 2, 3, 4, 5])])                       // 홀수 길이 → 채움 바이트
const withAlpha = webp([chunk('VP8X', new Array(10).fill(0)), chunk('ICCP', [9, 9]), chunk('ALPH', [7, 7]), chunk('VP8 ', [1, 2, 3, 4]), chunk('EXIF', [8, 8, 8])])
const lossless = webp([chunk('VP8L', [0x2f, 0, 0, 0, 0x10, 5])])           // 머리말의 투명도 비트 켜짐
const losslessOpaque = webp([chunk('VP8L', [0x2f, 0, 0, 0, 0x00, 5])])

assert.deepEqual([...extractWebpImageData(lossy).data], chunk('VP8 ', [1, 2, 3, 4, 5]))
assert.equal(extractWebpImageData(lossy).hasAlpha, false)
// 메타데이터(ICCP · EXIF)와 VP8X 는 빠지고 ALPH + VP8 만 남는다
assert.deepEqual([...extractWebpImageData(withAlpha).data], [...chunk('ALPH', [7, 7]), ...chunk('VP8 ', [1, 2, 3, 4])])
assert.equal(extractWebpImageData(withAlpha).hasAlpha, true)
assert.equal(extractWebpImageData(lossless).hasAlpha, true)
assert.equal(extractWebpImageData(losslessOpaque).hasAlpha, false)
assert.throws(() => extractWebpImageData(new Uint8Array([1, 2, 3])))
assert.throws(() => extractWebpImageData(webp([chunk('EXIF', [1, 2])])))
assert.throws(() => extractWebpImageData(webp([chunk('ANIM', [0, 0, 0, 0, 0, 0])])))

// 묶은 파일의 구조
const out = buildAnimatedWebp([{ bytes: lossy, durationMs: 1500 }, { bytes: withAlpha, durationMs: 250.4 }], 832, 1216)
assert.equal(text(out, 0), 'RIFF')
assert.equal(u32(out, 4), out.length - 8)
assert.equal(text(out, 8), 'WEBP')
assert.equal(out.length % 2, 0)
assert.equal(text(out, 12), 'VP8X')
assert.equal(u32(out, 16), 10)
assert.equal(out[20], 0x02 | 0x10)                    // 애니메이션 + 투명도
assert.equal(u24(out, 24), 831)
assert.equal(u24(out, 27), 1215)
assert.equal(text(out, 30), 'ANIM')
assert.equal(u32(out, 34), 6)
assert.deepEqual([...out.slice(38, 44)], [0, 0, 0, 0, 0, 0])   // 배경 0, 무한 반복
// 첫 프레임
let offset = 44
assert.equal(text(out, offset), 'ANMF')
const firstSize = u32(out, offset + 4)
assert.equal(firstSize, 16 + chunk('VP8 ', [1, 2, 3, 4, 5]).length)
assert.equal(u24(out, offset + 8), 0)
assert.equal(u24(out, offset + 11), 0)
assert.equal(u24(out, offset + 14), 831)
assert.equal(u24(out, offset + 17), 1215)
assert.equal(u24(out, offset + 20), 1500)
assert.equal(out[offset + 23], 0x02)
assert.equal(text(out, offset + 24), 'VP8 ')
// 둘째 프레임
offset += 8 + firstSize
assert.equal(text(out, offset), 'ANMF')
assert.equal(u24(out, offset + 20), 250)
assert.equal(text(out, offset + 24), 'ALPH')
assert.equal(offset + 8 + u32(out, offset + 4), out.length)
// 투명도가 없으면 표시도 없다, 반복 횟수
const opaque = buildAnimatedWebp([{ bytes: lossy, durationMs: 0 }], 2, 2, 3)
assert.equal(opaque[20], 0x02)
assert.equal(opaque[42], 3)
assert.equal(u24(opaque, 44 + 20), 1)                // 0초는 1ms 로
assert.throws(() => buildAnimatedWebp([], 10, 10))
assert.throws(() => buildAnimatedWebp([{ bytes: lossy, durationMs: 100 }], 0, 10))
assert.throws(() => buildAnimatedWebp([{ bytes: lossy, durationMs: 100 }], 20000, 10))

// 출력 크기
const first = { width: 832, height: 1216 }
assert.deepEqual(slideshowSize(first, 0, 0), { width: 832, height: 1216 })
assert.deepEqual(slideshowSize(first, 416, 0), { width: 416, height: 608 })
assert.deepEqual(slideshowSize(first, 0, 608), { width: 416, height: 608 })
assert.deepEqual(slideshowSize(first, 500, 500), { width: 500, height: 500 })
assert.deepEqual(slideshowSize(first, -5, NaN), { width: 832, height: 1216 })
assert.deepEqual(slideshowSize(first, 99999, 1), { width: 16382, height: 2 })
// 비율 버튼: 바베 1:1, 에덴 2:3, 젠잇 3:4 — 첫 사진 안에 들어가는 가장 큰 크기
assert.deepEqual(sizeForRatio(first, 1, 1), { width: 832, height: 832 })
assert.deepEqual(sizeForRatio(first, 2, 3), { width: 811, height: 1216 })
assert.deepEqual(sizeForRatio(first, 3, 4), { width: 832, height: 1109 })
assert.deepEqual(sizeForRatio({ width: 1216, height: 832 }, 2, 3), { width: 555, height: 832 })
// 그리기 위치
assert.deepEqual(fitRect({ width: 100, height: 200 }, { width: 100, height: 100 }, 'cover'), { x: 0, y: -50, width: 100, height: 200 })
assert.deepEqual(fitRect({ width: 100, height: 200 }, { width: 100, height: 100 }, 'contain'), { x: 25, y: 0, width: 50, height: 100 })

console.log('Animated WebP checks passed.')

// 파일 도구의 경로 · 목록 처리
{
    const { clampSeconds, commonParent, fileNameOf, isImageName, moveItem, relativeDir, stripOutputName } = await import('../src/lib/file-tools.ts')
    assert.equal(fileNameOf('C:\\a\\b\\1.png'), '1.png')
    assert.equal(fileNameOf('/home/me/2.webp'), '2.webp')
    assert.equal(isImageName('a.PNG') && isImageName('a.jpeg') && isImageName('a.webp'), true)
    assert.equal(isImageName('a.txt') || isImageName('png'), false)
    assert.equal(commonParent(['C:\\a\\b\\1.png', 'C:\\a\\b\\2.png']), 'C:\\a\\b')
    assert.equal(commonParent(['C:\\a\\b\\1.png', 'C:\\a\\c\\d\\2.png']), 'C:\\a')
    assert.equal(commonParent(['C:\\a\\1.png', 'D:\\a\\1.png']), '')
    assert.equal(commonParent(['/home/me/x/1.png', '/home/me/y/2.png']), '/home/me')
    assert.equal(commonParent([]), '')
    assert.equal(relativeDir('C:\\a\\b\\c\\1.png', 'C:\\a'), 'b/c')
    assert.equal(relativeDir('C:\\a\\1.png', 'C:\\a'), '')
    assert.equal(relativeDir('C:\\A\\b\\1.png', 'c:\\a\\'), 'b')
    assert.equal(relativeDir('D:\\x\\1.png', 'C:\\a'), '')
    assert.equal(stripOutputName('1 - 기본_1.png', 'webp'), '1 - 기본_1.webp')
    assert.equal(stripOutputName('a.b.jpeg', 'jpg'), 'a.b.jpg')
    assert.equal(stripOutputName('noext', 'png'), 'noext.png')
    assert.equal(clampSeconds('', 1.5), 1.5)
    assert.equal(clampSeconds('3', 1.5), 3)
    assert.equal(clampSeconds('0', 1.5), 1.5)
    assert.equal(clampSeconds('abc', 1.5), 1.5)
    assert.equal(clampSeconds('9999', 1.5), 600)
    assert.equal(clampSeconds('0.01', 1.5), 0.05)
    assert.equal(clampSeconds('', 0), 1)
    assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a'])
    assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b'])
    assert.deepEqual(moveItem(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c'])
    assert.deepEqual(moveItem(['a', 'b', 'c'], 5, 0), ['a', 'b', 'c'])
    console.log('File tool checks passed.')
}
