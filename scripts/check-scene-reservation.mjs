// 예약(대형) 씬 생성 계획 검사.
import assert from 'node:assert/strict'
import {
    clampSceneLimit, clampSeed, estimateReservation, hasQueuedScenes, planReservation, randomSeed, reservationI2iFolder, reservationSeed, resolveSceneSeed,
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
    characters: [{ id: 'hj', name: '이혜진', referenceIds: ['ref1'] }, { id: 'ms', name: '김민수', referenceIds: [] }],
    presetIds: ['A'], sceneLimit: null, seedMode: 'fixed', i2iSeedMode: 'random', fixedSeed: 12345, sceneBasePath: base,
}

{
    // 씬 수 제한이 없다: 120개 전부
    const plan = planReservation(presets, request, makeId, 500)
    assert.deepEqual(plan.jobs.map(job => [job.characterName, job.setName, job.usesReference, job.scenes, job.images, job.resumed]), [
        ['이혜진', 'A', true, 120, 240, false],     // 레퍼런스 사용 → 씬당 원본 + i2i
        ['김민수', 'A', false, 120, 120, false],
    ])
    assert.deepEqual(plan.presets.map(preset => preset.name), ['A', 'B: 외전', '[예약] 이혜진 - A', '[예약] 김민수 - A'])
    const hj = plan.presets[2]
    const ms = plan.presets[3]
    assert.deepEqual(hj.characterAsset, {
        parentPresetId: 'A', characterPromptId: 'hj', characterName: '이혜진', referenceIds: ['ref1'],
        reservation: true, seedMode: 'fixed', fixedSeed: 12345, i2iCycle: true, i2iSeedMode: 'random',
        i2iFolderRoot: `${base}\\예약대형\\이혜진_I2I`,
    })
    assert.deepEqual(ms.characterAsset, { parentPresetId: 'A', characterPromptId: 'ms', characterName: '김민수', referenceIds: [], reservation: true, seedMode: 'fixed', fixedSeed: 12345 })
    // 폴더: 레퍼런스 캐릭터는 이혜진_레퍼 / 이혜진_I2I, 없는 캐릭터는 김민수
    assert.equal(hj.scenes[0].folderPath, `${base}\\예약대형\\이혜진_레퍼\\씬1`)
    assert.equal(hj.scenes[119].folderPath, `${base}\\예약대형\\이혜진_레퍼\\씬120`)
    assert.equal(ms.scenes[0].folderPath, `${base}\\예약대형\\김민수\\씬1`)
    assert.equal(reservationI2iFolder(hj.characterAsset, hj.scenes[0].folderPath), `${base}\\예약대형\\이혜진_I2I\\씬1`)
    assert.equal(reservationI2iFolder(ms.characterAsset, ms.scenes[0].folderPath), null)
    assert.equal(reservationI2iFolder(undefined, 'x'), null)
    // 씬은 통째로 복제: 프롬프트 유지, 이미지 비움, 1장씩 예약
    assert.deepEqual([hj.scenes[4].name, hj.scenes[4].scenePrompt, hj.scenes[4].images.length, hj.scenes[4].queueCount], ['씬5', '씬5 prompt', 0, 1])
    assert.equal(presets[0].scenes[0].images.length, 1)

    // 생성할 때: 그 캐릭터 + 고른 레퍼런스, 레퍼런스 캐릭터는 싸이클
    assert.deepEqual(resolveCharacterAssetOverride(hj, true, ['hj', 'ms'], ['ref1']), { characterPromptIds: ['hj'], characterReferenceIds: ['ref1'] })
    assert.deepEqual(resolveCharacterAssetOverride(ms, true, ['hj', 'ms'], ['ref1']), { characterPromptIds: ['ms'], characterReferenceIds: [] })
    assert.equal(presetWantsI2iCycle(false, hj, true), true)
    assert.equal(presetWantsI2iCycle(false, ms, true), false)
    // 시드: 레퍼(원본)와 i2i를 따로 고른다
    assert.equal(reservationSeed(hj.characterAsset), 12345)                 // 레퍼만 고정
    assert.equal(reservationSeed(hj.characterAsset, 'i2i'), 'random')
    const combos = (seedMode, i2iSeedMode) => {
        const asset = planReservation(presets, { ...request, seedMode, i2iSeedMode, characters: [request.characters[0]] }, makeId, 1).presets[2].characterAsset
        return [reservationSeed(asset), reservationSeed(asset, 'i2i')]
    }
    assert.deepEqual(combos('fixed', 'fixed'), [12345, 12345])                 // 둘 다 고정
    assert.deepEqual(combos('random', 'fixed'), ['random', 12345])             // i2i만 고정
    assert.deepEqual(combos('random', 'random'), ['random', 'random'])         // 둘 다 랜덤
    // 레퍼런스 없는 캐릭터와 레퍼런스 캐릭터의 시드 방식은 따로 정한다
    const mixed = planReservation(presets, { ...request, seedMode: 'random', referenceSeedMode: 'fixed', i2iSeedMode: 'fixed' }, makeId, 1).presets
    assert.deepEqual([reservationSeed(mixed[2].characterAsset), reservationSeed(mixed[2].characterAsset, 'i2i'), reservationSeed(mixed[3].characterAsset)], [12345, 12345, 'random'])
    // 레퍼런스 없는 캐릭터: 고정이면 그 값, 랜덤이면 씬마다 다른 시드
    assert.equal(reservationSeed(ms.characterAsset), 12345)
    assert.equal(reservationSeed({ ...ms.characterAsset, seedMode: 'random' }), 'random')
    assert.equal(reservationSeed({ ...ms.characterAsset, fixedSeed: 0 }), 'random')
    assert.equal(reservationSeed({ parentPresetId: 'A', characterPromptId: 'x', characterName: 'x', referenceIds: [] }), null)
    assert.equal(reservationSeed(undefined), null)
    const seeds = new Set(Array.from({ length: 50 }, () => randomSeed()))
    assert.ok(seeds.size > 40 && [...seeds].every(seed => Number.isInteger(seed) && seed > 0 && seed <= 4294967295))

    // 이어하기: 다 뽑힌 씬은 빼고, 아직 안 뽑힌 씬만 다시 예약
    const img = n => Array.from({ length: n }, (_, i) => ({ id: String(i) }))
    const progressed = plan.presets.map(preset => preset.id === hj.id
        ? { ...preset, scenes: preset.scenes.map((item, i) => ({ ...item, queueCount: 0, images: img(i < 50 ? 2 : i === 50 ? 1 : 0) })) }
        : preset.id === ms.id ? { ...preset, scenes: preset.scenes.map((item, i) => ({ ...item, queueCount: 0, images: img(i < 100 ? 1 : 0) })) } : preset)
    const resume = planReservation(progressed, request, index => `again-${index}`, 900)
    assert.equal(resume.presets.length, 4)                       // 새로 만들지 않는다
    assert.deepEqual(resume.jobs.map(job => [job.characterName, job.scenes, job.images, job.resumed]), [['이혜진', 69, 138, true], ['김민수', 20, 20, true]])
    const hjAgain = resume.presets.find(preset => preset.id === hj.id)
    assert.equal(hjAgain.scenes.filter(item => item.queueCount > 0).length, 69)
    assert.equal(hjAgain.scenes[50].queueCount, 0)               // 원본만 있는 씬은 다시 뽑지 않는다
    assert.equal(hjAgain.scenes[10].queueCount, 0)
    assert.equal(hjAgain.scenes[51].folderPath, hj.scenes[51].folderPath)
    assert.equal(hasQueuedScenes(hjAgain), true)
    assert.equal(hasQueuedScenes({ scenes: [] }), false)

    // 진행표: 예약만 따로
    const progress = characterAssetProgress(progressed, 'reservation')
    assert.deepEqual(progress.map(group => [group.characterName, group.doneScenes, group.totalScenes]), [['이혜진', 50, 120], ['김민수', 100, 120]])
    assert.equal(progress[0].rows[0].sourceName, 'A')
    assert.equal(progress[0].rows[0].reservation, true)
    assert.deepEqual(characterAssetProgress(progressed, 'asset'), [])

    // 나중에 같은 캐릭터로 다른 묶음을 더 예약해도 같은 캐릭터 폴더에 들어가고, 겹치는 씬 이름에는 번호가 붙는다
    const withSame = [...plan.presets, { id: 'C', name: 'C', createdAt: 3, scenes: [scene('c0', '씬1'), scene('c1', '새 씬')] }]
    const later = planReservation(withSame, { ...request, presetIds: ['C'], characters: [request.characters[0]] }, index => `later-${index}`, 2)
    // 같은 캐릭터의 예약끼리 모인다
    assert.deepEqual(later.presets.map(preset => preset.name), ['A', 'B: 외전', '[예약] 이혜진 - A', '[예약] 이혜진 - C', '[예약] 김민수 - A', 'C'])
    assert.deepEqual(later.presets.find(preset => preset.name === '[예약] 이혜진 - C').scenes.map(item => item.folderPath.split('\\').slice(-2).join('/')), ['이혜진_레퍼/씬1 (2)', '이혜진_레퍼/새 씬'])
}
{
    // 몇 번째 씬까지만 + 묶음 여러 개: 묶음 폴더 없이 캐릭터 폴더에 바로
    const plan = planReservation(presets, { ...request, presetIds: ['A', 'B', 'A'], sceneLimit: 2, seedMode: 'random', i2iSeedMode: 'random', characters: [request.characters[0]] }, makeId, 500)
    assert.deepEqual(plan.jobs.map(job => [job.setName, job.scenes, job.images]), [['A', 2, 4], ['B: 외전', 2, 4]])
    const [onA, onB] = plan.presets.slice(2)
    assert.equal(onA.scenes[1].folderPath, `${base}\\예약대형\\이혜진_레퍼\\씬2`)
    assert.equal(onA.characterAsset.i2iFolderRoot, `${base}\\예약대형\\이혜진_I2I`)
    // 같은 이름의 씬은 폴더가 겹치지 않게 번호를 붙인다
    assert.deepEqual(onB.scenes.map(item => item.folderPath.split('\\').slice(-2).join('/')), ['이혜진_레퍼/같은 이름', '이혜진_레퍼/같은 이름 (2)'])
    assert.equal(onB.name, '[예약] 이혜진 - B: 외전')
    assert.equal(onA.characterAsset.seedMode, 'random')
    assert.equal('fixedSeed' in onA.characterAsset, false)
    // 슬래시 경로(다른 OS)도 같은 구분자로 잇는다
    const unix = planReservation(presets, { ...request, sceneBasePath: '/home/me/Pictures/NAIS_Scene/' }, makeId, 1)
    assert.equal(unix.presets[2].scenes[0].folderPath, '/home/me/Pictures/NAIS_Scene/예약대형/이혜진_레퍼/씬1')
    // 캐릭터 이름에 파일에 못 쓰는 글자가 있으면 바꾼다
    const odd = planReservation(presets, { ...request, characters: [{ id: 'x', name: '릭/Rick?', referenceIds: [] }] }, makeId, 1)
    assert.equal(odd.presets[2].scenes[0].folderPath, `${base}\\예약대형\\릭_Rick_\\씬1`)
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

{
    // 시드 우선순위: I2I 두 번째 장 > 예약대형 설정 > 씬 고정 시드 > 메인 설정
    const fixedRandom = () => 777
    assert.equal(resolveSceneSeed({ mainSeed: 5, reservedSeed: null }), 5)
    assert.equal(resolveSceneSeed({ mainSeed: 5, reservedSeed: null, sceneFixedSeed: 42 }), 42)
    assert.equal(resolveSceneSeed({ mainSeed: 5, reservedSeed: 99, sceneFixedSeed: 42 }), 99)
    assert.equal(resolveSceneSeed({ mainSeed: 5, reservedSeed: 'random', sceneFixedSeed: 42 }, fixedRandom), 777)
    assert.equal(resolveSceneSeed({ mainSeed: 5, reservedSeed: 99, sceneFixedSeed: 42, secondPassSeed: 1234 }), 1234)
    assert.equal(resolveSceneSeed({ mainSeed: 5, reservedSeed: null, sceneFixedSeed: 0 }), 5)
    assert.equal(resolveSceneSeed({ mainSeed: 5, reservedSeed: null, sceneFixedSeed: 42, secondPassSeed: 0 }), 42)
}

console.log('Scene reservation checks passed.')
