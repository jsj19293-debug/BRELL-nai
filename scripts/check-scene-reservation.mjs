// 예약(대형) 씬 생성 계획 검사.
import assert from 'node:assert/strict'
import {
    clampSceneLimit, clampSeed, estimateReservation, hasQueuedScenes, planReservation, reservationI2iFolder, reservationSeed,
} from '../src/lib/scene-reservation.ts'
import { characterAssetProgress, presetWantsI2iCycle, resolveCharacterAssetOverride } from '../src/lib/character-asset-presets.ts'

const scene = (id, name) => ({ id, name, scenePrompt: `${name} prompt`, queueCount: 0, images: [{ id: 'x' }], folderPath: `C:\\old\\${name}`, createdAt: 1 })
const presets = [
    { id: 'A', name: 'A', createdAt: 1, scenes: Array.from({ length: 120 }, (_, i) => scene(`a${i}`, `씬${i + 1}`)) },
    { id: 'B', name: 'B: 외전', createdAt: 2, scenes: [scene('b0', '같은 이름'), scene('b1', '같은 이름'), scene('b2', '끝?')] },
]
const base = 'C:\\Users\\me\\Pictures\\NAIS_Scene'
const makeId = index => `res-${index}`
const request = {
    characters: [{ id: 'rick', name: '릭', referenceIds: ['ref1'] }, { id: 'luna', name: '루나', referenceIds: [] }],
    presetIds: ['A'], sceneLimit: null, seedMode: 'fixed', fixedSeed: 12345, sceneBasePath: base,
}

{
    // 씬 수 제한이 없다: 120개 전부
    const plan = planReservation(presets, request, makeId, 500)
    assert.deepEqual(plan.jobs.map(job => [job.characterName, job.setName, job.usesReference, job.scenes, job.images, job.resumed]), [
        ['릭', 'A', true, 120, 240, false],     // 레퍼런스 사용 → 씬당 원본 + i2i
        ['루나', 'A', false, 120, 120, false],
    ])
    assert.deepEqual(plan.presets.map(preset => preset.name), ['A', 'B: 외전', '[예약] 릭 - A', '[예약] 루나 - A'])
    const rick = plan.presets[2]
    const luna = plan.presets[3]
    assert.deepEqual(rick.characterAsset, {
        parentPresetId: 'A', characterPromptId: 'rick', characterName: '릭', referenceIds: ['ref1'],
        reservation: true, seedMode: 'fixed', fixedSeed: 12345, i2iCycle: true,
        i2iFolderRoot: `${base}\\예약캐릭터\\릭\\I2I`,
    })
    assert.deepEqual(luna.characterAsset, { parentPresetId: 'A', characterPromptId: 'luna', characterName: '루나', referenceIds: [], reservation: true, seedMode: 'fixed', fixedSeed: 12345 })
    // 폴더: 레퍼런스 캐릭터는 레퍼원본/<씬>, 없는 캐릭터는 바로 <씬>
    assert.equal(rick.scenes[0].folderPath, `${base}\\예약캐릭터\\릭\\레퍼원본\\씬1`)
    assert.equal(rick.scenes[119].folderPath, `${base}\\예약캐릭터\\릭\\레퍼원본\\씬120`)
    assert.equal(luna.scenes[0].folderPath, `${base}\\예약캐릭터\\루나\\씬1`)
    assert.equal(reservationI2iFolder(rick.characterAsset, rick.scenes[0].folderPath), `${base}\\예약캐릭터\\릭\\I2I\\씬1`)
    assert.equal(reservationI2iFolder(luna.characterAsset, luna.scenes[0].folderPath), null)
    assert.equal(reservationI2iFolder(undefined, 'x'), null)
    // 씬은 통째로 복제: 프롬프트 유지, 이미지 비움, 1장씩 예약
    assert.deepEqual([rick.scenes[4].name, rick.scenes[4].scenePrompt, rick.scenes[4].images.length, rick.scenes[4].queueCount], ['씬5', '씬5 prompt', 0, 1])
    assert.equal(presets[0].scenes[0].images.length, 1)

    // 생성할 때: 그 캐릭터 + 고른 레퍼런스, 레퍼런스 캐릭터는 싸이클, 시드는 고정값
    assert.deepEqual(resolveCharacterAssetOverride(rick, true, ['rick', 'luna'], ['ref1']), { characterPromptIds: ['rick'], characterReferenceIds: ['ref1'] })
    assert.deepEqual(resolveCharacterAssetOverride(luna, true, ['rick', 'luna'], ['ref1']), { characterPromptIds: ['luna'], characterReferenceIds: [] })
    assert.equal(presetWantsI2iCycle(false, rick, true), true)
    assert.equal(presetWantsI2iCycle(false, luna, true), false)
    assert.equal(reservationSeed(rick.characterAsset), 12345)
    assert.equal(reservationSeed({ ...rick.characterAsset, seedMode: 'random' }), 'random')
    assert.equal(reservationSeed({ ...rick.characterAsset, fixedSeed: 0 }), 'random')
    assert.equal(reservationSeed({ parentPresetId: 'A', characterPromptId: 'x', characterName: 'x', referenceIds: [] }), null)
    assert.equal(reservationSeed(undefined), null)

    // 이어하기: 다 뽑힌 씬은 빼고, 아직 안 뽑힌 씬만 다시 예약
    const img = n => Array.from({ length: n }, (_, i) => ({ id: String(i) }))
    const progressed = plan.presets.map(preset => preset.id === rick.id
        ? { ...preset, scenes: preset.scenes.map((item, i) => ({ ...item, queueCount: 0, images: img(i < 50 ? 2 : i === 50 ? 1 : 0) })) }
        : preset.id === luna.id ? { ...preset, scenes: preset.scenes.map((item, i) => ({ ...item, queueCount: 0, images: img(i < 100 ? 1 : 0) })) } : preset)
    const resume = planReservation(progressed, request, index => `again-${index}`, 900)
    assert.equal(resume.presets.length, 4)                       // 새로 만들지 않는다
    assert.deepEqual(resume.jobs.map(job => [job.characterName, job.scenes, job.images, job.resumed]), [['릭', 69, 138, true], ['루나', 20, 20, true]])
    const rickAgain = resume.presets.find(preset => preset.id === rick.id)
    assert.equal(rickAgain.scenes.filter(item => item.queueCount > 0).length, 69)
    assert.equal(rickAgain.scenes[50].queueCount, 0)             // 원본만 있는 씬은 다시 뽑지 않는다
    assert.equal(rickAgain.scenes[10].queueCount, 0)
    assert.equal(rickAgain.scenes[51].folderPath, rick.scenes[51].folderPath)
    assert.equal(hasQueuedScenes(rickAgain), true)
    assert.equal(hasQueuedScenes({ scenes: [] }), false)

    // 진행표: 예약만 따로
    const progress = characterAssetProgress(progressed, 'reservation')
    assert.deepEqual(progress.map(group => [group.characterName, group.doneScenes, group.totalScenes]), [['릭', 50, 120], ['루나', 100, 120]])
    assert.equal(progress[0].rows[0].sourceName, 'A')
    assert.equal(progress[0].rows[0].reservation, true)
    assert.deepEqual(characterAssetProgress(progressed, 'asset'), [])
}
{
    // 몇 번째 씬까지만 + 묶음 여러 개 → 캐릭터 아래에 묶음 이름 폴더, 시드 풀기
    const plan = planReservation(presets, { ...request, presetIds: ['A', 'B', 'A'], sceneLimit: 2, seedMode: 'random', characters: [request.characters[0]] }, makeId, 500)
    assert.deepEqual(plan.jobs.map(job => [job.setName, job.scenes, job.images]), [['A', 2, 4], ['B: 외전', 2, 4]])
    const [onA, onB] = plan.presets.slice(2)
    assert.equal(onA.scenes[1].folderPath, `${base}\\예약캐릭터\\릭\\A\\레퍼원본\\씬2`)
    assert.equal(onA.characterAsset.i2iFolderRoot, `${base}\\예약캐릭터\\릭\\A\\I2I`)
    // 파일에 못 쓰는 글자는 바꾸고, 같은 이름의 씬은 폴더가 겹치지 않게 번호를 붙인다
    assert.deepEqual(onB.scenes.map(item => item.folderPath.split('\\').slice(-3).join('/')), ['B_ 외전/레퍼원본/같은 이름', 'B_ 외전/레퍼원본/같은 이름 (2)'])
    assert.equal(onB.name, '[예약] 릭 - B: 외전')
    assert.equal(onA.characterAsset.seedMode, 'random')
    assert.equal('fixedSeed' in onA.characterAsset, false)
    assert.equal(reservationSeed(onA.characterAsset), 'random')
    // 슬래시 경로(다른 OS)도 같은 구분자로 잇는다
    const unix = planReservation(presets, { ...request, sceneBasePath: '/home/me/Pictures/NAIS_Scene/' }, makeId, 1)
    assert.equal(unix.presets[2].scenes[0].folderPath, '/home/me/Pictures/NAIS_Scene/예약캐릭터/릭/레퍼원본/씬1')
}
{
    assert.deepEqual(estimateReservation(presets, { ...request, presetIds: ['A', 'B'] }), { jobs: 4, scenes: 246, images: 369 })
    assert.deepEqual(estimateReservation(presets, { ...request, presetIds: ['A', 'B'], sceneLimit: 2 }), { jobs: 4, scenes: 8, images: 12 })
    assert.deepEqual(estimateReservation(presets, { ...request, presetIds: [] }), { jobs: 0, scenes: 0, images: 0 })
    assert.equal(clampSceneLimit(''), null)
    assert.equal(clampSceneLimit(0), null)
    assert.equal(clampSceneLimit('150'), 150)       // 100개를 넘어도 된다
    assert.equal(clampSceneLimit('abc'), null)
    assert.equal(clampSeed('42'), 42)
    assert.equal(clampSeed(-1), 0)
    assert.equal(clampSeed(99999999999), 4294967295)
    // 고른 것이 없으면 아무것도 만들지 않는다
    assert.deepEqual(planReservation(presets, { ...request, characters: [] }, makeId, 1).jobs, [])
    assert.deepEqual(planReservation(presets, { ...request, presetIds: ['nope'] }, makeId, 1).jobs, [])
}

console.log('Scene reservation checks passed.')
