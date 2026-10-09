/**
 * 캐릭터 에셋 뽑기: 고른 작품(씬 프리셋)의 씬 전체를 캐릭터 이름으로 통째로 복제해 "캐릭터씬" 프리셋을 만든다.
 * 복제본은 그 캐릭터 하나로만 생성되고, 레퍼런스는 만들 때 고른 것만 쓴다.
 */

export interface CharacterAssetInfo {
    /** 원본 작품(프리셋) id */
    parentPresetId: string
    characterPromptId: string
    characterName: string
    /** 이 캐릭터씬에서 쓸 캐릭터 레퍼런스 이미지 id. 비어 있으면 레퍼런스 없이 뽑는다. */
    referenceIds: string[]
}

export interface AssetScene {
    id: string
    name: string
    queueCount: number
    images: unknown[]
    folderPath?: string
    createdAt: number
    multiCharacterSlots?: Array<{ position?: { x: number; y: number } }>
}

export interface AssetPreset<Scene extends AssetScene = AssetScene> {
    id: string
    name: string
    scenes: Scene[]
    createdAt: number
    characterAsset?: CharacterAssetInfo
}

export interface AssetCharacter {
    id: string
    name: string
}

export interface CharacterAssetPlan<Preset> {
    presets: Preset[]
    created: Preset[]
    /** 이미 캐릭터씬이 있어서 건너뛴 캐릭터 이름 */
    skipped: string[]
}

export const CHARACTER_ASSET_MAX_QUEUE = 20

export function clampAssetQueueCount(value: unknown): number {
    const number = Math.floor(Number(value))
    if (!Number.isFinite(number)) return 1
    return Math.min(CHARACTER_ASSET_MAX_QUEUE, Math.max(0, number))
}

/** 이름이 비어 있는 캐릭터에 붙일 이름 */
export function assetCharacterName(name: string | undefined, index: number): string {
    return name?.trim() || `캐릭터 ${index + 1}`
}

/** 캐릭터씬에서 고르면 그 원본 작품을, 아니면 그 작품 자신을 돌려준다. */
export function resolveAssetSource<Preset extends AssetPreset>(presets: readonly Preset[], presetId: string): Preset | null {
    const preset = presets.find(candidate => candidate.id === presetId)
    if (!preset) return null
    if (!preset.characterAsset) return preset
    return presets.find(candidate => candidate.id === preset.characterAsset!.parentPresetId) ?? preset
}

function uniqueName(base: string, taken: Set<string>): string {
    let name = base
    let index = 2
    while (taken.has(name.toLocaleLowerCase())) name = `${base} (${index++})`
    taken.add(name.toLocaleLowerCase())
    return name
}

/**
 * 고른 캐릭터 × 고른 작품마다, 그 작품의 씬 전체를 복제한 "캐릭터씬" 프리셋을 만든다.
 * - 이름은 "캐릭터 이름 - 작품 이름" (예: 릭 - A, 릭 - B)
 * - 씬의 프롬프트·해상도 등은 그대로, 이미지는 비우고 저장 폴더는 새로 잡히게 한다.
 * - 같은 캐릭터의 캐릭터씬끼리 모이도록, 그 캐릭터의 마지막 캐릭터씬 뒤(없으면 목록 끝)에 넣는다.
 * - 같은 캐릭터 + 같은 작품의 캐릭터씬이 이미 있으면 다시 만들지 않는다.
 */
export function planCharacterAssetPresets<Scene extends AssetScene, Preset extends AssetPreset<Scene>>(
    presets: readonly Preset[],
    sourcePresetIds: readonly string[],
    characters: readonly AssetCharacter[],
    options: { referenceIds: readonly string[]; queueCount: number; now: number },
    makeId: (index: number) => string,
): CharacterAssetPlan<Preset> {
    // 캐릭터씬을 골랐으면 그 원본 작품으로 바꾸고, 겹치는 것은 한 번만.
    const sources: Preset[] = []
    for (const presetId of sourcePresetIds) {
        const source = resolveAssetSource(presets, presetId)
        if (source && !source.characterAsset && !sources.some(item => item.id === source.id)) sources.push(source)
    }

    const next = [...presets]
    const takenNames = new Set(presets.map(preset => preset.name.toLocaleLowerCase()))
    const queueCount = clampAssetQueueCount(options.queueCount)
    const referenceIds = [...new Set(options.referenceIds)]
    const created: Preset[] = []
    const skipped: string[] = []
    const seen = new Set<string>()

    characters.forEach((character, index) => {
        if (seen.has(character.id)) return
        seen.add(character.id)
        const characterName = assetCharacterName(character.name, index)
        for (const source of sources) {
            const exists = next.some(preset =>
                preset.characterAsset?.characterPromptId === character.id && preset.characterAsset.parentPresetId === source.id)
            if (exists) {
                skipped.push(`${characterName} - ${source.name}`)
                continue
            }
            const presetId = makeId(created.length)
            const preset = {
                ...source,
                id: presetId,
                name: uniqueName(`${characterName} - ${source.name}`, takenNames),
                createdAt: options.now,
                characterAsset: { parentPresetId: source.id, characterPromptId: character.id, characterName, referenceIds: [...referenceIds] },
                scenes: source.scenes.map((scene, sceneIndex) => ({
                    ...scene,
                    id: `${presetId}-scene-${sceneIndex}`,
                    images: [],
                    queueCount,
                    folderPath: undefined,
                    multiCharacterSlots: scene.multiCharacterSlots?.map(slot => ({
                        ...slot,
                        position: slot.position ? { ...slot.position } : undefined,
                    })),
                    createdAt: options.now,
                })),
            } as Preset
            created.push(preset)
            let last = -1
            next.forEach((item, position) => {
                if (item.characterAsset?.characterPromptId === character.id) last = position
            })
            next.splice(last >= 0 ? last + 1 : next.length, 0, preset)
        }
    })

    return { presets: next, created, skipped }
}

/**
 * 생성할 때 쓸 캐릭터와 레퍼런스. 캐릭터씬이 아니거나 기능이 꺼져 있으면 null (평소대로 생성).
 * 지워진 캐릭터·레퍼런스는 빼고 돌려준다. 캐릭터가 지워졌으면 null을 돌려 평소 선택을 따른다.
 */
export function resolveCharacterAssetOverride(
    preset: Pick<AssetPreset, 'characterAsset'> | null | undefined,
    enabled: boolean,
    characterIds: readonly string[],
    referenceIds: readonly string[],
): { characterPromptIds: string[]; characterReferenceIds: string[] } | null {
    const asset = preset?.characterAsset
    if (!enabled || !asset) return null
    if (!characterIds.includes(asset.characterPromptId)) return null
    return {
        characterPromptIds: [asset.characterPromptId],
        characterReferenceIds: asset.referenceIds.filter(id => referenceIds.includes(id)),
    }
}
