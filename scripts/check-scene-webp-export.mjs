// 씬 WebP 내보내기 이름 짓기와 씬 폴더 새로고침 검사.
import assert from 'node:assert/strict'
import {
    clampExportStart, formatBytes, planSceneWebpExport, previewExportNames, sanitizeExportPrefix,
} from '../src/lib/scene-webp-export.ts'
import { isInsideFolder, pathKey, syncSceneImages, timestampFromFileName } from '../src/lib/scene-folder-sync.ts'
import { pickBlurredImage } from '../src/lib/blur-mode-pick.ts'

const image = (url, timestamp, isFavorite = false) => ({ id: url, url, timestamp, isFavorite })
const scenes = [
    { id: 's1', name: '첫 씬', images: [image('ref1.png', 100), image('i2i1.png', 200)] },
    { id: 's2', name: '빈 씬', images: [] },
    { id: 's3', name: '셋째', images: [image('old.png', 10, true), image('new.png', 20)] },
]

// --- 번호만: 1, 2, 3 … (대표 1장 = 즐겨찾기 우선, 없으면 최신) ---
{
    const plan = planSceneWebpExport(scenes, { prefix: '', start: 1, pad: false, scope: 'representative' })
    assert.deepEqual(plan.entries.map(entry => [entry.fileName, entry.source]), [['1.webp', 'i2i1.png'], ['3.webp', 'old.png']])
    // 이미지가 없는 씬은 번호만 비고, 다음 씬 번호는 밀리지 않는다.
    assert.deepEqual(plan.emptyScenes, ['빈 씬'])
}
// --- 접두어: A1, A2 … ---
{
    const plan = planSceneWebpExport(scenes, { prefix: 'A', start: 1, pad: false, scope: 'representative' })
    assert.deepEqual(plan.entries.map(entry => entry.fileName), ['A1.webp', 'A3.webp'])
}
// --- 전부 내보내기: 오래된 것부터 -1, -2 (레퍼런스 → i2i 순서) ---
{
    const plan = planSceneWebpExport(scenes, { prefix: 'A', start: 1, pad: false, scope: 'all' })
    assert.deepEqual(plan.entries.map(entry => [entry.fileName, entry.source]), [
        ['A1-1.webp', 'ref1.png'], ['A1-2.webp', 'i2i1.png'], ['A3-1.webp', 'old.png'], ['A3-2.webp', 'new.png'],
    ])
    const single = planSceneWebpExport([{ id: 'x', name: 'x', images: [image('a.png', 1)] }], { prefix: 'A', start: 1, pad: false, scope: 'all' })
    assert.deepEqual(single.entries.map(entry => entry.fileName), ['A1.webp'])
}
// --- 시작 번호와 자릿수 맞추기 ---
{
    const many = Array.from({ length: 100 }, (_, index) => ({ id: `s${index}`, name: `씬${index}`, images: [image(`${index}.png`, index)] }))
    const padded = planSceneWebpExport(many, { prefix: 'B', start: 1, pad: true, scope: 'representative' })
    assert.equal(padded.entries[0].fileName, 'B001.webp')
    assert.equal(padded.entries[99].fileName, 'B100.webp')
    const plain = planSceneWebpExport(many, { prefix: '', start: 1, pad: false, scope: 'representative' })
    assert.equal(plain.entries[0].fileName, '1.webp')
    assert.equal(plain.entries[99].fileName, '100.webp')
    const offset = planSceneWebpExport(many.slice(0, 3), { prefix: 'C', start: 11, pad: false, scope: 'representative' })
    assert.deepEqual(offset.entries.map(entry => entry.fileName), ['C11.webp', 'C12.webp', 'C13.webp'])
    assert.equal(new Set(padded.entries.map(entry => entry.fileName)).size, 100)
    assert.equal(previewExportNames(padded.entries), 'B001.webp, B002.webp, B003.webp … B100.webp')
    assert.equal(previewExportNames(offset.entries), 'C11.webp, C12.webp, C13.webp')
    assert.equal(previewExportNames([]), '')
}
assert.equal(sanitizeExportPrefix(' A/B:*? '), 'AB')
assert.equal(sanitizeExportPrefix('..\\evil'), 'evil')
assert.equal(sanitizeExportPrefix('작품_'), '작품_')
assert.equal(clampExportStart('7'), 7)
assert.equal(clampExportStart(-3), 0)
assert.equal(clampExportStart('abc'), 1)
assert.equal(formatBytes(0), '0 MB')
assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB')
assert.equal(formatBytes(250 * 1024 * 1024), '250 MB')
assert.equal(formatBytes(3 * 1024 * 1024 * 1024), '3.00 GB')

// --- 씬 폴더 새로고침 ---
assert.equal(pathKey('C:\\Pics\\Scene\\A.PNG'), 'c:/pics/scene/a.png')
assert.equal(isInsideFolder('C:\\Pics\\Scene\\a.png', 'c:/pics/scene/'), true)
assert.equal(isInsideFolder('C:\\Pics\\Scene\\sub\\a.png', 'C:\\Pics\\Scene'), false)
assert.equal(isInsideFolder('C:\\Pics\\Scene2\\a.png', 'C:\\Pics\\Scene'), false)
assert.equal(isInsideFolder('data:image/png;base64,AAAA', 'C:\\Pics\\Scene'), false)
assert.equal(timestampFromFileName('NAIS_SCENE_1760000000000.png'), 1760000000000)
assert.equal(timestampFromFileName('A1.webp'), null)
assert.equal(timestampFromFileName('12345678901234567890.png'), null)

const folder = 'C:\\Pics\\NAIS_Scene\\작품\\씬1'
const file = (name, modifiedMs = 5) => ({ path: `${folder}\\${name}`, name, modifiedMs })
const make = (entry, timestamp, index) => ({ id: `new-${index}`, url: entry.path, timestamp, isFavorite: false })
{
    // 지웠다가 다시 넣은 파일(목록에서 빠져 있음)을 되살리고, 사라진 파일은 뺀다.
    const current = [
        { id: 'a', url: `${folder}\\NAIS_SCENE_1760000000300.png`, timestamp: 1760000000300, isFavorite: true },
        { id: 'gone', url: `${folder}\\NAIS_SCENE_1760000000200.png`, timestamp: 1760000000200, isFavorite: false },
        { id: 'elsewhere', url: 'D:\\other\\x.png', timestamp: 50, isFavorite: false },
        { id: 'inline', url: 'data:image/png;base64,AAAA', timestamp: 40, isFavorite: false },
    ]
    const result = syncSceneImages(current, folder, [
        file('nais_scene_1760000000300.PNG'),           // 대소문자만 다른 같은 파일
        file('NAIS_SCENE_1760000000400.png'),           // 다시 넣은 파일
        file('custom.webp', 1760000000100),             // 이름에 시각이 없으면 수정 시각
    ], make)
    assert.equal(result.added, 2)
    assert.equal(result.removed, 1)
    assert.deepEqual(result.images.map(item => item.id), ['new-1', 'a', 'new-2', 'elsewhere', 'inline'])
    assert.equal(result.images[1].isFavorite, true)   // 즐겨찾기 같은 기존 정보는 그대로
    assert.equal(result.images[0].timestamp, 1760000000400)
    assert.equal(result.images[2].timestamp, 1760000000100)
}
{
    // 바뀐 것이 없으면 순서도 그대로 둔다.
    const current = [
        { id: 'b', url: `${folder}\\b.png`, timestamp: 1, isFavorite: false },
        { id: 'a', url: `${folder}\\a.png`, timestamp: 2, isFavorite: false },
    ]
    const result = syncSceneImages(current, folder, [file('a.png'), file('b.png')], make)
    assert.deepEqual(result, { images: current, added: 0, removed: 0 })
}
{
    // 같은 파일이 두 번 들어가 있으면 하나만 남긴다.
    const current = [
        { id: 'a1', url: `${folder}\\a.png`, timestamp: 2, isFavorite: false },
        { id: 'a2', url: `${folder}/A.png`, timestamp: 1, isFavorite: false },
    ]
    const result = syncSceneImages(current, folder, [file('a.png')], make)
    assert.deepEqual(result.images.map(item => item.id), ['a1'])
}
{
    // 폴더가 비었으면 그 폴더의 이미지는 모두 빠진다.
    const current = [{ id: 'a', url: `${folder}\\a.png`, timestamp: 2, isFavorite: false }]
    assert.deepEqual(syncSceneImages(current, folder, [], make), { images: [], added: 0, removed: 1 })
}

// --- 블러 모드: 포인터 아래 요소들 중 흐려지는 이미지를 고른다 ---
{
    const element = (tagName, { exempt = false, exemptAncestor = false } = {}) => ({
        tagName,
        hasAttribute: name => exempt && name === 'data-no-blur',
        closest: () => (exemptAncestor ? {} : null),
    })
    const overlay = element('BUTTON')
    const picture = element('IMG')
    assert.equal(pickBlurredImage([overlay, element('DIV'), picture, element('IMG')]), picture)
    assert.equal(pickBlurredImage([overlay, element('DIV')]), null)
    assert.equal(pickBlurredImage([element('IMG', { exempt: true }), picture]), picture)
    assert.equal(pickBlurredImage([element('IMG', { exemptAncestor: true })]), null)
}

console.log('Scene WebP export checks passed: naming, numbering, folder refresh, blur pick.')

// --- 한글 문구 → 영어 번역 ---
{
    const { cleanTranslation, clearKoTranslateCache, readMyMemoryResponse, shouldTranslate, translateKoToEn } = await import('../src/lib/ko-translate.ts')
    assert.equal(shouldTranslate('아름다운 야경'), true)
    assert.equal(shouldTranslate('가'), false)
    assert.equal(shouldTranslate('long hair'), false)
    assert.equal(shouldTranslate('a 가'), false)
    assert.equal(shouldTranslate('가'.repeat(301)), false)

    assert.equal(cleanTranslation('아름다운 야경', 'Beautiful night view.'), 'beautiful night view')
    assert.equal(cleanTranslation('x', 'Night view of Seoul'), 'Night view of Seoul')
    assert.equal(cleanTranslation('x', '  rain ,wet  street  '), 'rain, wet street')
    assert.equal(cleanTranslation('아름다운 야경', '아름다운 야경'), '')
    assert.equal(cleanTranslation('x', 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY.'), '')
    assert.equal(cleanTranslation('x', null), '')

    const ok = JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'Beautiful night view' } })
    assert.equal(readMyMemoryResponse('아름다운 야경', ok), 'beautiful night view')
    assert.equal(readMyMemoryResponse('x', JSON.stringify({ responseStatus: 429, responseData: { translatedText: 'whatever' } })), '')
    assert.equal(readMyMemoryResponse('x', JSON.stringify({ responseStatus: '200', responseData: { translatedText: 'Rain' } })), 'rain')
    assert.equal(readMyMemoryResponse('x', '<html>'), '')

    clearKoTranslateCache()
    let calls = 0
    const request = async text => { calls++; assert.equal(text, '아름다운 야경'); return ok }
    assert.equal(await translateKoToEn(' 아름다운 야경 ', request), 'beautiful night view')
    assert.equal(await translateKoToEn('아름다운 야경', request), 'beautiful night view')
    assert.equal(calls, 1)                                  // 같은 문구는 다시 묻지 않는다
    assert.equal(await translateKoToEn('hello', request), '')
    assert.equal(calls, 1)                                  // 한글이 아니면 묻지 않는다
    let failures = 0
    const failing = async () => { failures++; throw new Error('NETWORK_ERROR') }
    assert.equal(await translateKoToEn('비 오는 밤', failing), '')
    assert.equal(await translateKoToEn('비 오는 밤', failing), '')
    assert.equal(failures, 2)                               // 실패는 기억하지 않는다
    console.log('Korean translate checks passed.')
}
