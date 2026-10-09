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
    /** 이 캐릭터씬을 생성할 때 레퍼런스 → i2i 싸이클을 함께 돌린다 (씬 모드의 싸이클 스위치와 상관없이) */
    i2iCycle?: boolean
    /** 예약(대형) 생성으로 만든 프리셋 */
    reservation?: boolean
    /** 예약: 시드를 고정할지 풀지 */
    seedMode?: 'fixed' | 'random'
    fixedSeed?: number
    /** 예약: i2i 이미지를 저장할 폴더 (이 아래에 씬 이름 폴더가 생긴다) */
    i2iFolderRoot?: string
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
    options: { referenceIds: readonly string[]; queueCount: number; now: number; i2iCycle?: boolean },
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
                characterAsset: {
                    parentPresetId: source.id,
                    characterPromptId: character.id,
                    characterName,
                    referenceIds: [...referenceIds],
                    ...(options.i2iCycle ? { i2iCycle: true } : {}),
                },
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

const safeFolderName = (name: string, fallback: string) =>
    name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/, '') || fallback

export interface CharacterExportTarget<Preset> {
    preset: Preset
    /** 캐릭터 폴더 아래에 만들 폴더 이름 (원본 작품 이름) */
    folderName: string
}

/** 캐릭터 폴더 이름 (예: "릭") */
export function characterExportFolderName(asset: Pick<CharacterAssetInfo, 'characterName'>): string {
    return safeFolderName(asset.characterName, '캐릭터')
}

/**
 * 한 캐릭터의 캐릭터씬들을 한 번에 내보낼 때의 목록: "릭 - A", "릭 - B" → 릭/A, 릭/B.
 * 폴더 이름은 원본 작품 이름이고, 원본이 지워졌으면 캐릭터씬 이름에서 "캐릭터 - "를 뗀 것을 쓴다.
 */
export function characterExportTargets<Preset extends AssetPreset>(
    presets: readonly Preset[],
    characterPromptId: string,
): CharacterExportTarget<Preset>[] {
    const taken = new Set<string>()
    return presets
        .filter(preset => preset.characterAsset?.characterPromptId === characterPromptId)
        .map(preset => {
            const asset = preset.characterAsset!
            const parent = presets.find(candidate => candidate.id === asset.parentPresetId)
            const prefix = `${asset.characterName} - `
            const base = safeFolderName(parent?.name ?? (preset.name.startsWith(prefix) ? preset.name.slice(prefix.length) : preset.name), '작품')
            let folderName = base
            for (let index = 2; taken.has(folderName.toLocaleLowerCase()); index++) folderName = `${base} (${index})`
            taken.add(folderName.toLocaleLowerCase())
            return { preset, folderName }
        })
}

/** 이 프리셋을 생성할 때 i2i 싸이클을 돌릴지: 씬 모드의 스위치가 켜져 있거나, 캐릭터씬에 싸이클이 예약돼 있을 때. */
export function presetWantsI2iCycle(
    globalEnabled: boolean,
    preset: Pick<AssetPreset, 'characterAsset'> | null | undefined,
    characterAssetsEnabled: boolean,
): boolean {
    return globalEnabled || (characterAssetsEnabled && !!preset?.characterAsset?.i2iCycle)
}

// ---------------------------------------------------------------------------
// 캐릭터씬 진행표
// ---------------------------------------------------------------------------

export interface CharacterProgressRow {
    presetId: string
    presetName: string
    /** 원본 작품 이름 (예: A) */
    sourceName: string
    totalScenes: number
    /** 필요한 장수를 채운 씬 수 (싸이클이면 레퍼런스 1장 + i2i 1장 = 2장) */
    doneScenes: number
    images: number
    /** 아직 예약돼 있는 장수 */
    queued: number
    i2iCycle: boolean
    reservation: boolean
}

export interface CharacterProgressGroup {
    characterPromptId: string
    characterName: string
    rows: CharacterProgressRow[]
    totalScenes: number
    doneScenes: number
    images: number
    queued: number
}

/** 캐릭터별로 캐릭터씬들의 진행 상황을 모은다 (목록에 나오는 순서 그대로). */
export function characterAssetProgress<Preset extends AssetPreset>(
    presets: readonly Preset[],
    kind: 'all' | 'asset' | 'reservation' = 'all',
): CharacterProgressGroup[] {
    const groups = new Map<string, CharacterProgressGroup>()
    for (const preset of presets) {
        const asset = preset.characterAsset
        if (!asset) continue
        if (kind === 'asset' && asset.reservation) continue
        if (kind === 'reservation' && !asset.reservation) continue
        const needed = asset.i2iCycle ? 2 : 1
        const prefix = `${asset.characterName} - `
        const parent = presets.find(candidate => candidate.id === asset.parentPresetId)
        const row: CharacterProgressRow = {
            presetId: preset.id,
            presetName: preset.name,
            sourceName: parent?.name ?? (() => {
                const bare = preset.name.replace(/^\[예약\]\s*/, '')
                return bare.startsWith(prefix) ? bare.slice(prefix.length) : bare
            })(),
            totalScenes: preset.scenes.length,
            doneScenes: preset.scenes.filter(scene => scene.images.length >= needed).length,
            images: preset.scenes.reduce((sum, scene) => sum + scene.images.length, 0),
            queued: preset.scenes.reduce((sum, scene) => sum + Math.max(0, scene.queueCount), 0),
            i2iCycle: !!asset.i2iCycle,
            reservation: !!asset.reservation,
        }
        let group = groups.get(asset.characterPromptId)
        if (!group) {
            group = { characterPromptId: asset.characterPromptId, characterName: asset.characterName, rows: [], totalScenes: 0, doneScenes: 0, images: 0, queued: 0 }
            groups.set(asset.characterPromptId, group)
        }
        group.rows.push(row)
        group.totalScenes += row.totalScenes
        group.doneScenes += row.doneScenes
        group.images += row.images
        group.queued += row.queued
    }
    return [...groups.values()]
}

export function progressPercent(done: number, total: number): number {
    return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
}
