// NAIS → Nightmare 저장 형식(NAIS 호환) 검사.
import assert from 'node:assert/strict'
import { STORAGE_NAMES, isScenePath, planNaisToNightmare, remapMovedPath, storageNames } from '../src/lib/storage-names.ts'

assert.equal(storageNames(undefined).scene, 'NAIS_Scene')          // 버튼을 누르기 전에는 예전 형식 그대로
assert.equal(storageNames('nais').filePrefix, 'NAIS')
assert.deepEqual(storageNames('nightmare'), { scene: 'Nightmare_Scene', output: 'Nightmare_Output', library: 'Nightmare_Library', exif: 'Nightmare_EXIF', filePrefix: 'Nightmare' })
assert.equal(isScenePath('C:\\Pics\\NAIS_Scene\\a\\b.png'), true)
assert.equal(isScenePath('C:\\Pics\\Nightmare_Scene\\a\\b.png'), true)
assert.equal(isScenePath('C:\\Pics\\NAIS_Output\\b.png'), false)

const pictures = 'C:\\Users\\me\\Pictures'
const defaults = { savePath: 'NAIS_Output', useAbsolutePath: false, libraryPath: 'NAIS_Library', useAbsoluteLibraryPath: false, exifAutoSavePath: 'NAIS_EXIF' }
{
    // 기본 설정: 사진 폴더의 네 폴더를 모두 옮기고 설정 값도 새 이름으로
    const plan = planNaisToNightmare(defaults, pictures)
    assert.deepEqual(plan.moves.map(move => [move.kind, move.sourcePath, move.destinationPath]), [
        ['scene', `${pictures}\\NAIS_Scene`, `${pictures}\\Nightmare_Scene`],
        ['output', `${pictures}\\NAIS_Output`, `${pictures}\\Nightmare_Output`],
        ['library', `${pictures}\\NAIS_Library`, `${pictures}\\Nightmare_Library`],
        ['exif', `${pictures}\\NAIS_EXIF`, `${pictures}\\Nightmare_EXIF`],
    ])
    assert.deepEqual(plan.settings, { savePath: 'Nightmare_Output', libraryPath: 'Nightmare_Library', exifAutoSavePath: 'Nightmare_EXIF' })
    // 설정이 비어 있어도 기본 이름으로 본다
    assert.deepEqual(planNaisToNightmare({ ...defaults, savePath: '', libraryPath: ' ', exifAutoSavePath: '' }, pictures).settings, plan.settings)
}
{
    // 저장 위치를 직접 지정한 경우: 그 폴더는 그대로 두고 안의 씬 폴더만. 사진 폴더에 남은 예전 씬도 같이.
    const plan = planNaisToNightmare({ ...defaults, savePath: 'D:\\AI\\out\\', useAbsolutePath: true, libraryPath: 'E:\\Lib', useAbsoluteLibraryPath: true, exifAutoSavePath: 'D:\\clean' }, pictures)
    assert.deepEqual(plan.moves.map(move => [move.kind, move.sourcePath, move.destinationPath]), [
        ['scene', 'D:\\AI\\out\\NAIS_Scene', 'D:\\AI\\out\\Nightmare_Scene'],
        ['scene', `${pictures}\\NAIS_Scene`, `${pictures}\\Nightmare_Scene`],
    ])
    assert.deepEqual(plan.settings, {})
    // 직접 바꾼 이름(기본 이름이 아님)은 건드리지 않는다
    const custom = planNaisToNightmare({ ...defaults, savePath: 'MyOutput', libraryPath: 'MyLib', exifAutoSavePath: 'MyExif' }, pictures)
    assert.deepEqual(custom.moves.map(move => move.kind), ['scene'])
    assert.deepEqual(custom.settings, {})
}
{
    const moves = planNaisToNightmare(defaults, pictures).moves
    assert.equal(remapMovedPath(`${pictures}\\NAIS_Scene\\작품\\씬1\\NAIS_SCENE_1.png`, moves), `${pictures}\\Nightmare_Scene\\작품\\씬1\\NAIS_SCENE_1.png`)
    assert.equal(remapMovedPath('c:/users/me/pictures/nais_scene/작품/a.png', moves), `${pictures}\\Nightmare_Scene/작품/a.png`)
    assert.equal(remapMovedPath(`${pictures}\\NAIS_Scene`, moves), `${pictures}\\Nightmare_Scene`)
    assert.equal(remapMovedPath(`${pictures}\\NAIS_Scene2\\a.png`, moves), `${pictures}\\NAIS_Scene2\\a.png`)   // 이름이 비슷한 다른 폴더
    assert.equal(remapMovedPath('D:\\other\\a.png', moves), 'D:\\other\\a.png')
    assert.equal(remapMovedPath('data:image/png;base64,AAAA', moves), 'data:image/png;base64,AAAA')
    assert.equal(remapMovedPath(`${pictures}\\NAIS_Library\\x\\y.webp`, moves), `${pictures}\\Nightmare_Library\\x\\y.webp`)
}
assert.equal(STORAGE_NAMES.nais.output, 'NAIS_Output')

console.log('Storage naming (NAIS compatibility) checks passed.')
