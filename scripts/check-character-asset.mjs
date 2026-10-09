// 캐릭터 에셋 뽑기(캐릭터씬 프리셋 복제)와 프롬프트 관리 JSON 저장 검사.
import assert from 'node:assert/strict'
import {
    assetCharacterName, clampAssetQueueCount, planCharacterAssetPresets, resolveAssetSource, resolveCharacterAssetOverride,
} from '../src/lib/character-asset-presets.ts'

const scene = (id, name, extra = {}) => ({ id, name, scenePrompt: `${name} prompt`, queueCount: 3, images: [{ id: 'i', url: 'x.png' }], folderPath: `C:\\s\\${name}`, createdAt: 1, width: 832, ...extra })
const presets = [
    { id: 'scene-default', name: '기본', scenes: [], createdAt: 0 },
    { id: 'A', name: 'A', scenes: [scene('a1', '씬1'), scene('a2', '씬2', { multiCharacterSlots: [{ id: 'm', position: { x: 0.2, y: 0.4 } }] })], createdAt: 1 },
    { id: 'B', name: 'B', scenes: [scene('b1', '씬가')], createdAt: 2 },
]
const makeId = index => `new-${index}`
const options = { referenceIds: ['ref1', 'ref1', 'ref2'], queueCount: 1, now: 500 }

{
    // 릭으로 A와 B를 고르면 "릭 - A", "릭 - B"가 생긴다
    const plan = planCharacterAssetPresets(presets, ['A', 'B', 'A'], [{ id: 'rick', name: '릭' }], options, makeId)
    assert.deepEqual(plan.skipped, [])
    assert.deepEqual(plan.presets.map(preset => preset.name), ['기본', 'A', 'B', '릭 - A', '릭 - B'])
    const rickA = plan.created[0]
    assert.deepEqual(rickA.characterAsset, { parentPresetId: 'A', characterPromptId: 'rick', characterName: '릭', referenceIds: ['ref1', 'ref2'] })
    // 씬 전체가 복제되고: 프롬프트·해상도는 그대로, 이미지는 비고, 폴더는 새로 잡히고, 대기 장수는 고른 값
    assert.deepEqual(rickA.scenes.map(item => [item.id, item.name, item.scenePrompt, item.width, item.images.length, item.queueCount, item.folderPath]), [
        ['new-0-scene-0', '씬1', '씬1 prompt', 832, 0, 1, undefined],
        ['new-0-scene-1', '씬2', '씬2 prompt', 832, 0, 1, undefined],
    ])
    assert.deepEqual(plan.created[1].scenes.map(item => item.name), ['씬가'])
    // 원본은 그대로이고, 복제본을 고쳐도 원본이 바뀌지 않는다
    rickA.scenes[1].multiCharacterSlots[0].position.x = 0.9
    assert.equal(presets[1].scenes[1].multiCharacterSlots[0].position.x, 0.2)
    assert.equal(presets[1].scenes[0].images.length, 1)
    assert.equal(presets.length, 3)

    // 다른 캐릭터는 자기 묶음으로 따로 모이고, 릭에 작품을 더하면 릭 묶음 뒤에 붙는다
    const luna = planCharacterAssetPresets(plan.presets, ['A'], [{ id: 'luna', name: '루나' }, { id: 'noname', name: ' ' }], { ...options, referenceIds: [] }, index => `luna-${index}`)
    assert.deepEqual(luna.presets.map(preset => preset.name), ['기본', 'A', 'B', '릭 - A', '릭 - B', '루나 - A', '캐릭터 2 - A'])
    assert.deepEqual(luna.created[0].characterAsset.referenceIds, [])
    const withC = [...luna.presets, { id: 'C', name: 'C', scenes: [scene('c1', '씬다')], createdAt: 3 }]
    const more = planCharacterAssetPresets(withC, ['A', 'C'], [{ id: 'rick', name: '릭' }], options, index => `more-${index}`)
    assert.deepEqual(more.skipped, ['릭 - A'])                       // 이미 있는 것은 다시 만들지 않는다
    assert.deepEqual(more.presets.map(preset => preset.name), ['기본', 'A', 'B', '릭 - A', '릭 - B', '릭 - C', '루나 - A', '캐릭터 2 - A', 'C'])
    // 캐릭터씬을 골라도 그 원본 작품을 복제한다 (복제본의 복제본을 만들지 않는다)
    const fromChild = planCharacterAssetPresets(more.presets, ['new-0'], [{ id: 'mia', name: '미아' }], options, index => `third-${index}`)
    assert.equal(fromChild.created[0].characterAsset.parentPresetId, 'A')
    assert.equal(fromChild.created[0].name, '미아 - A')
    assert.equal(resolveAssetSource(more.presets, 'new-0').id, 'A')
    assert.equal(resolveAssetSource(more.presets, 'nope'), null)
    // 이름이 겹치면 번호를 붙인다
    const clash = planCharacterAssetPresets([...presets, { id: 'x', name: '릭 - A', scenes: [], createdAt: 3 }], ['A'], [{ id: 'rick', name: '릭' }], options, makeId)
    assert.equal(clash.created[0].name, '릭 - A (2)')
    // 없는 작품, 빈 목록
    assert.deepEqual(planCharacterAssetPresets(presets, ['nope'], [{ id: 'a', name: 'a' }], options, makeId).created, [])
    assert.deepEqual(planCharacterAssetPresets(presets, ['A'], [], options, makeId).presets, presets)
    assert.deepEqual(planCharacterAssetPresets(presets, [], [{ id: 'a', name: 'a' }], options, makeId).presets, presets)
}

assert.equal(assetCharacterName(' 릭 ', 0), '릭')
assert.equal(assetCharacterName(undefined, 2), '캐릭터 3')
assert.equal(clampAssetQueueCount('3'), 3)
assert.equal(clampAssetQueueCount(-1), 0)
assert.equal(clampAssetQueueCount(999), 20)
assert.equal(clampAssetQueueCount('x'), 1)

// --- 생성할 때: 캐릭터씬이면 그 캐릭터와 고른 레퍼런스만 쓴다 ---
{
    const preset = { characterAsset: { parentPresetId: 'garden', characterPromptId: 'rick', characterName: '릭', referenceIds: ['ref1', 'gone'] } }
    assert.deepEqual(resolveCharacterAssetOverride(preset, true, ['rick', 'luna'], ['ref1', 'ref2']), { characterPromptIds: ['rick'], characterReferenceIds: ['ref1'] })
    assert.deepEqual(resolveCharacterAssetOverride({ characterAsset: { ...preset.characterAsset, referenceIds: [] } }, true, ['rick'], ['ref1']), { characterPromptIds: ['rick'], characterReferenceIds: [] })
    assert.equal(resolveCharacterAssetOverride(preset, false, ['rick'], ['ref1']), null)     // 설정에서 끔
    assert.equal(resolveCharacterAssetOverride(preset, true, ['luna'], ['ref1']), null)      // 캐릭터가 지워짐
    assert.equal(resolveCharacterAssetOverride({}, true, ['rick'], []), null)                // 보통 작품
    assert.equal(resolveCharacterAssetOverride(null, true, ['rick'], []), null)
}

// --- 프롬프트 관리 JSON 저장 · 불러오기 ---
{
    const { exportNotesJson, mergeImportedProjects, parseNotesJson } = await import('../src/lib/prompt-notes.ts')
    const projects = [{
        id: 'p1', name: '무림', world: '세계관 글', worldImages: ['C:\\a.png'], createdAt: 1, updatedAt: 2,
        lore: [{ id: 'l1', title: '일반모드', content: '내용', keywords: '1, !일반모드', images: ['C:\\b.png'], updatedAt: 3 }],
        memos: [{ id: 'm1', title: '메모', content: '할 일', images: [], updatedAt: 4 }],
    }]
    const json = exportNotesJson(projects, 1000)
    const data = JSON.parse(json)
    assert.equal(data.kind, 'nais2-rell-prompt-notes')
    assert.equal(data.version, 1)
    assert.equal(data.exportedAt, 1000)
    // 모든 항목이 그대로 들어간다 (키워드, 이미지 경로, 메모 포함)
    assert.deepEqual(data.projects, projects)
    assert.deepEqual(parseNotesJson(json), projects)

    // 손으로 고친 파일: 빠진 칸은 채우고, 한도를 넘는 것은 자르고, 엉뚱한 것은 버린다
    const messy = parseNotesJson(JSON.stringify({ kind: 'nais2-rell-prompt-notes', version: 1, projects: [
        { name: '이름만' },
        { id: 'p2', name: 'x'.repeat(100), world: '가'.repeat(12000), lore: Array.from({ length: 200 }, (_, i) => ({ title: `t${i}`, content: '내'.repeat(600), keywords: 5 })), memos: 'nope', worldImages: [1, 'C:\\ok.png'] },
        'garbage', null,
    ] }))
    assert.equal(messy.length, 2)
    assert.equal(messy[0].name, '이름만')
    assert.ok(messy[0].id)
    assert.deepEqual([messy[0].world, messy[0].lore, messy[0].memos, messy[0].worldImages], ['', [], [], []])
    assert.equal(messy[1].name.length, 40)
    assert.equal(messy[1].world.length, 10000)
    assert.equal(messy[1].lore.length, 150)
    assert.equal(messy[1].lore[0].content.length, 500)
    assert.equal(messy[1].lore[0].keywords, '')
    assert.ok(messy[1].lore[0].id)
    assert.deepEqual(messy[1].worldImages, ['C:\\ok.png'])
    assert.equal(new Set(messy[1].lore.map(entry => entry.id)).size, 150)
    assert.throws(() => parseNotesJson('{"kind":"other"}'), /NOT_PROMPT_NOTES/)
    assert.throws(() => parseNotesJson('not json'), /INVALID_JSON/)

    // 불러오기는 지금 있는 작품을 덮어쓰지 않고 뒤에 더한다 (id가 겹치면 새 id, 이름이 겹치면 번호)
    let counter = 0
    const merged = mergeImportedProjects(projects, parseNotesJson(json), 100, () => `fresh-${counter++}`)
    assert.equal(merged.added, 1)
    assert.deepEqual(merged.projects.map(project => [project.id, project.name]), [['p1', '무림'], ['fresh-0', '무림 (2)']])
    assert.equal(merged.projects[1].lore[0].keywords, '1, !일반모드')
    const capped = mergeImportedProjects(Array.from({ length: 99 }, (_, i) => ({ ...projects[0], id: `e${i}`, name: `e${i}` })), [projects[0], { ...projects[0], id: 'q', name: 'q' }], 100, () => `fresh-${counter++}`)
    assert.equal(capped.added, 1)
    assert.equal(capped.projects.length, 100)
}

console.log('Character asset and notes JSON checks passed.')
