// 검열 탭 규칙 점검: node --experimental-strip-types scripts/check-censor-review.mjs
import assert from 'node:assert/strict'
import {
    CENSOR_FOLDER_NAME, DEFAULT_CENSOR_BRUSH, censorOutput, censorStatus, clampBrush, reviewKeyDelta, sortByName, stepIndex, summarizeCensor,
} from '../src/lib/censor-review.ts'

assert.equal(CENSOR_FOLDER_NAME, '검열본')

// 검열본은 원본과 같은 이름 · 같은 형식으로 저장한다
assert.deepEqual(censorOutput('001.webp'), { name: '001.webp', mime: 'image/webp' })
assert.deepEqual(censorOutput('A_12.PNG'), { name: 'A_12.PNG', mime: 'image/png' })
assert.deepEqual(censorOutput('x.jpeg'), { name: 'x.jpeg', mime: 'image/jpeg' })
assert.deepEqual(censorOutput('x.bmp'), { name: 'x.png', mime: 'image/png' })
assert.deepEqual(censorOutput('noext'), { name: 'noext.png', mime: 'image/png' })

// 상태: 검열본이 있으면 붉은색, 넘겨 보기만 했으면 파란색
const censored = new Set(['001.webp', 'x.png'])
const viewed = new Set(['001.webp', '002.webp'])
assert.equal(censorStatus('001.webp', censored, viewed), 'censored')
assert.equal(censorStatus('002.WEBP', censored, viewed), 'viewed')
assert.equal(censorStatus('003.webp', censored, viewed), 'none')
assert.equal(censorStatus('x.bmp', censored, viewed), 'censored')
assert.deepEqual(summarizeCensor(['001.webp', '002.webp', '003.webp', '004.webp'], censored, viewed), { total: 4, censored: 1, viewed: 1, remaining: 2 })

// 순서와 넘기기
assert.deepEqual(sortByName([{ name: '10.webp' }, { name: '2.webp' }, { name: '1.webp' }]).map(file => file.name), ['1.webp', '2.webp', '10.webp'])
assert.equal(stepIndex(0, 1, 3), 1)
assert.equal(stepIndex(2, 1, 3), null)
assert.equal(stepIndex(0, -1, 3), null)
assert.equal(stepIndex(0, 1, 0), null)
for (const key of [',', '<', 'ArrowLeft']) assert.equal(reviewKeyDelta(key), -1)
for (const key of ['.', '>', 'ArrowRight']) assert.equal(reviewKeyDelta(key), 1)
for (const key of ['a', 'Enter', ' ', 'ArrowUp']) assert.equal(reviewKeyDelta(key), 0)

// 브러시 설정은 수동검열 창과 같은 범위
assert.deepEqual(clampBrush(undefined), DEFAULT_CENSOR_BRUSH)
assert.deepEqual(clampBrush({ mode: 'blur', shape: 'square', size: 999, color: 'red', opacity: 0, blurAmount: 100 }),
    { mode: 'blur', shape: 'square', size: 240, color: '#000000', opacity: 5, blurAmount: 30 })
assert.equal(clampBrush({ mode: 'weird', size: 'abc' }).mode, 'pen')
assert.equal(clampBrush({ size: 'abc' }).size, 48)
assert.equal(clampBrush({ color: '#FF00aa' }).color, '#FF00aa')

console.log('Censor review checks passed.')
