// 씬 덮어씌우기: 하위 폴더 ↔ 씬 짝짓기, 폴더 파일로 이미지 목록 만들기
import assert from 'node:assert/strict'
import { matchSceneFolders, imagesFromFolder, repairForeignScenes, ownFolders } from '../src/lib/scene-overwrite.ts'

const R = 'C:\\N\\운빨좆망겜 (4)'
const f = (name, n = 1) => ({ name, path: `${R}\\${name}`, imageCount: n })
const scenes = [
    { id: 'a', name: '1 기본' }, { id: 'b', name: '2 - 웃음' }, { id: 'c', name: '17-술을 마시는' },
    { id: 'd', name: '3 - 슬픔' }, { id: 'e', name: '없는 씬' }, { id: 'g', name: '10 - 공포' },
]
const folders = [f('1 기본', 3), f('2 - 웃음'), f('17-술을 마시는'), f('3 - 슬픔 (수정)'), f('10 - 공포'), f('1 기본 백업')]
const m = matchSceneFolders(scenes, folders)
assert.deepEqual(m.map(x => [x.sceneNumber, x.folder?.name ?? null, x.by]), [
    [1, '1 기본', 'name'], [2, '2 - 웃음', 'name'], [3, '17-술을 마시는', 'name'],
    [4, '3 - 슬픔 (수정)', 'number'], [5, null, null], [6, '10 - 공포', 'name'],
])
// 같은 번호 폴더가 둘이면 번호로는 짝짓지 않는다
assert.equal(matchSceneFolders([{ id: 'x', name: '7 - 삐침' }], [f('7 a'), f('7 b')])[0].folder, null)
// 대소문자 · 공백 · 못 쓰는 글자 차이는 같은 이름으로 본다
assert.equal(matchSceneFolders([{ id: 'y', name: 'Kiss?  Scene' }], [f('kiss_ scene')])[0].by, 'name')

const files = [
    { path: `${R}\\1 기본\\NAIS_SCENE_1760000000100.png`, name: 'NAIS_SCENE_1760000000100.png', modifiedMs: 5 },
    { path: `${R}\\1 기본\\x.png`, name: 'x.png', modifiedMs: 1760000000300 },
]
const prev = [{ id: 'old', url: `${R}\\1 기본\\NAIS_SCENE_1760000000100.png`, timestamp: 1, isFavorite: true }, { id: 'gone', url: 'D:\\other.png', timestamp: 9, isFavorite: false }]
const images = imagesFromFolder(files, prev, i => `new-${i}`)
assert.deepEqual(images.map(i => [i.id, i.isFavorite]), [['new-1', false], ['old', true]])
// 다른 작품 폴더를 같이 쓰던 씬 바로잡기
const ROOT = 'C:\\N\\Nightmare_Scene', OWN = ROOT + '\\운빨좆망겜 (14) (5)', OTHER = ROOT + '\\운빨좆망겜 (14)'
const rep = repairForeignScenes([
    { id: 'a', folderPath: OTHER + '\\1 기본', images: [{ url: OTHER + '\\1 기본\\x.png' }, { url: OWN + '\\1 기본\\y.png' }, { url: 'D:\\밖\\z.png' }, { url: 'data:image/png;base64,AA' }] },
    { id: 'b', folderPath: OWN + '\\2 - 웃음', images: [{ url: OWN + '\\2 - 웃음\\q.png' }] },
    { id: 'c', images: [] },
], OWN, ROOT)
assert.equal(rep.changed, 1)
assert.equal(rep.scenes[0].folderPath, undefined)
assert.deepEqual(rep.scenes[0].images.map(i => i.url.split('\\').pop()), ['y.png', 'z.png', 'data:image/png;base64,AA'])
assert.equal(rep.scenes[1].folderPath, OWN + '\\2 - 웃음')
// "운빨좆망겜 (14)" 는 "운빨좆망겜 (14) (5)" 의 앞부분이지만 다른 폴더다
assert.deepEqual(ownFolders([OTHER + '\\1 기본', OWN + '\\1 기본', OWN], OWN), [OWN + '\\1 기본', OWN])
assert.deepEqual(repairForeignScenes([{ id: 'z', folderPath: OWN + '\\9', images: [{ url: OWN + '\\9\\a.png' }] }], OWN, ROOT).changed, 0)
console.log('Scene overwrite checks passed.')
