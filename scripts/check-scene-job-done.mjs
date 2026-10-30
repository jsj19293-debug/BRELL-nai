// "작업완료하기": 씬마다 최신 1장 내보내기 + 나머지 정리 계획, 이름 규칙, 뽑은 시각 표시
import assert from 'node:assert/strict'
import * as lib from '../src/lib/scene-job-done.ts'

const img = (id, t, fav = false, url = `C:\\s\\${id}.png`) => ({ id, url, timestamp: t, isFavorite: fav })
const scenes = [
    { id: 'a', name: '1 기본', images: [img('a1', 100), img('a2', 300, true), img('a3', 200)] },
    { id: 'b', name: '2 - 웃음', images: [] },
    { id: 'c', name: '3 - 슬픔', images: [img('c1', 50, true)] },
    { id: 'd', name: '4 - 놀람', images: [img('d1', 10, true), img('d2', 20, false, 'C:\\s\\d2.webp'), img('dx', 999, false, 'data:image/png;base64,AA')] },
]
const plan = lib.planJob(scenes, { prefix: '', start: 1, pad: false })
assert.deepEqual(plan.exports.map(e => [e.sceneNumber, e.baseName, e.source, e.originalExtension]), [
    [1, '1', 'C:\\s\\a2.png', '.png'], [3, '3', 'C:\\s\\c1.png', '.png'], [4, '4', 'C:\\s\\d2.webp', '.webp'],
])
assert.deepEqual(plan.emptyScenes, ['2 - 웃음'])
// 최신 1장만 남기고 즐겨찾기여도 지운다 (데이터 주소 이미지는 남길 대상이 아니라 지울 목록에 든다)
assert.deepEqual(plan.trims.map(t => [t.sceneNumber, t.total, t.keep.id, t.remove.map(r => r.id).sort(), t.favoritesRemoved]), [
    [1, 3, 'a2', ['a1', 'a3'], 0], [4, 3, 'd2', ['d1', 'dx'], 1],
])
assert.equal(plan.removeCount, 4)
assert.equal(plan.favoriteRemoveCount, 1)
assert.deepEqual(lib.planJob(scenes, { prefix: 'A', start: 9, pad: true }).exports.map(e => e.baseName), ['A09', 'A11', 'A12'])
assert.equal(lib.latestImage([]), null)
assert.equal(lib.jobFolderName('운빨/좆망겜', new Date(2026, 9, 27, 10, 31)), '운빨_좆망겜 2026-10-27 1031')
assert.equal(lib.uniqueName('A', new Set(['a', 'A (2)'])), 'A (3)')
assert.equal(lib.formatShotTime(new Date(2026, 9, 30, 7, 5).getTime(), new Date(2026, 11, 1)), '10/30 07:05')
assert.equal(lib.formatShotTime(new Date(2025, 0, 2, 23, 59).getTime(), new Date(2026, 0, 1)), '2025/01/02 23:59')
assert.equal(lib.formatShotTime(0), '')
assert.deepEqual(lib.summarizeSceneClear(scenes), { scenes: 3, images: 7, favorites: 3 })
console.log('Scene job-done checks passed.')
