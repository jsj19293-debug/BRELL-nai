/**
 * 예약(대형) 씬 생성: 여러 캐릭터 × 씬 묶음을 한 번에 예약해 차례로 자동 생성한다.
 * 캐릭터마다 레퍼런스를 쓸지 따로 정하고, 레퍼런스를 쓰는 캐릭터는 i2i가 반드시 뒤따른다.
 *
 * 저장 위치 (씬이 원래 저장되는 폴더 아래 — NAIS_Scene 또는 Nightmare_Scene):
 *   예약대형/<캐릭터>_레퍼/<씬 이름>/   레퍼런스로 뽑은 원본
 *   예약대형/<캐릭터>_I2I/<씬 이름>/    그 원본으로 돌린 i2i
 *   예약대형/<캐릭터>/<씬 이름>/        레퍼런스 없이 뽑은 것
 * 씬 묶음을 여러 개 골라도 묶음 폴더는 만들지 않는다. 씬 이름이 겹칠 때만 "(2)"를 붙인다.
 */
import type { AssetPreset, AssetScene, CharacterAssetInfo } from './character-asset-presets.ts'
import { assetCharacterName, resolveAssetSource } from './character-asset-presets.ts'

export const RESERVATION_ROOT_FOLDER = '예약대형'
export const RESERVATION_REFERENCE_SUFFIX = '_레퍼'
export const RESERVATION_I2I_SUFFIX = '_I2I'
export const RESERVATION_NAME_PREFIX = '[예약] '

export type ReservationSeedMode = 'fixed' | 'random'

export interface ReservationCharacter {
    id: string
    name: string
    /** 이 캐릭터에 쓸 레퍼런스 이미지 id. 비어 있으면 레퍼런스 없이 뽑는다 (i2i도 하지 않는다). */
    referenceIds: string[]
}

export interface ReservationRequest {
    characters: readonly ReservationCharacter[]
    presetIds: readonly string[]
    /** 묶음마다 앞에서부터 몇 번째 씬까지 뽑을지. null이면 전부. */
    sceneLimit: number | null
    /** 레퍼런스 없는 캐릭터의 시드 방식 */
    seedMode: ReservationSeedMode
    /** 레퍼런스 캐릭터의 원본(레퍼) 생성에 쓸 시드 방식. 지정하지 않으면 seedMode와 같다. */
    referenceSeedMode?: ReservationSeedMode
    /** 레퍼런스 캐릭터의 i2i에 쓸 시드 방식 */
    i2iSeedMode: ReservationSeedMode
    /** 고정일 때 쓸 시드 */
    fixedSeed: number
    /** 씬이 저장되는 폴더(NAIS_Scene 또는 Nightmare_Scene)의 전체 경로 */
    sceneBasePath: string
}

export interface ReservationJob {
    presetId: string
    characterName: string
    setName: string
    usesReference: boolean
    /** 이번에 생성할 씬 수 (이미 다 뽑은 씬은 빼고) */
    scenes: number
    /** 이번에 생성될 이미지 수 (레퍼런스 사용 시 씬당 2장) */
    images: number
    resumed: boolean
}

export interface ReservationPlan<Preset> {
    presets: Preset[]
    /** 실행 순서대로 */
    jobs: ReservationJob[]
}

const safeName = (name: string, fallback: string) =>
    name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/, '') || fallback

const separatorOf = (path: string) => (path.includes('\\') ? '\\' : '/')
const joinPath = (base: string, ...parts: string[]) => {
    const separator = separatorOf(base)
    return [base.replace(/[\\/]+$/, ''), ...parts].join(separator)
}
const lastSegment = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || ''

export function clampSceneLimit(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null
    const number = Math.floor(Number(value))
    if (!Number.isFinite(number) || number <= 0) return null
    return number
}

export function clampSeed(value: unknown): number {
    const number = Math.floor(Number(value))
    if (!Number.isFinite(number) || number <= 0) return 0
    return Math.min(4294967295, number)
}

/** 씬 한 개에 필요한 이미지 수 */
const neededImages = (asset: Pick<CharacterAssetInfo, 'i2iCycle'>) => (asset.i2iCycle ? 2 : 1)

/** i2i 이미지를 저장할 폴더: <I2I 폴더>/<씬 폴더 이름> */
export function reservationI2iFolder(asset: CharacterAssetInfo | undefined, sceneFolderPath: string | undefined): string | null {
    if (!asset?.reservation || !asset.i2iFolderRoot || !sceneFolderPath) return null
    const name = lastSegment(sceneFolderPath)
    return name ? joinPath(asset.i2iFolderRoot, name) : null
}

/**
 * 예약 프리셋이 정한 시드. 고정이면 그 값, 풀기면 'random', 예약 프리셋이 아니면 null (평소 설정을 따른다).
 * pass가 'i2i'면 i2i용 설정(i2iSeedMode)을 본다.
 */
export function reservationSeed(asset: CharacterAssetInfo | undefined, pass: 'first' | 'i2i' = 'first'): number | 'random' | null {
    if (!asset?.reservation) return null
    const mode = pass === 'i2i' ? asset.i2iSeedMode : asset.seedMode
    if (mode === 'fixed' && (asset.fixedSeed ?? 0) > 0) return asset.fixedSeed as number
    return 'random'
}

/**
 * 실제로 쓸 시드를 정한다. 앞선 것이 이긴다:
 *  1) I2I 싸이클 두 번째 장에 넘겨받은 시드
 *  2) 예약대형에서 예약할 때 정한 시드 설정 (고정 값 또는 랜덤) — 씬에 고정한 시드를 무시한다
 *  3) 씬에 고정한 시드 (씬 카드 우클릭 > 시드값 고정)
 *  4) 메인의 시드 설정 (mainSeed)
 */
export function resolveSceneSeed(input: {
    mainSeed: number
    reservedSeed: number | 'random' | null
    sceneFixedSeed?: number
    secondPassSeed?: number
}, random: () => number = randomSeed): number {
    if ((input.secondPassSeed ?? 0) > 0) return input.secondPassSeed as number
    if (input.reservedSeed === 'random') return random()
    if (typeof input.reservedSeed === 'number') return input.reservedSeed
    if ((input.sceneFixedSeed ?? 0) > 0) return input.sceneFixedSeed as number
    return input.mainSeed
}

export function randomSeed(): number {
    return Math.floor(Math.random() * 4294967294) + 1
}

/**
 * 예약 계획을 세운다. 캐릭터 순서 → 씬 묶음 순서대로 작업이 만들어진다.
 * 같은 캐릭터 + 같은 묶음의 예약이 이미 있으면 새로 만들지 않고 이어서 한다:
 * 아직 필요한 장수를 채우지 못한 씬만 다시 예약한다 (폴더와 레퍼런스 설정은 처음 것을 유지).
 */
export function planReservation<Scene extends AssetScene, Preset extends AssetPreset<Scene>>(
    presets: readonly Preset[],
    request: ReservationRequest,
    makeId: (index: number) => string,
    now: number,
): ReservationPlan<Preset> {
    const sources: Preset[] = []
    for (const presetId of request.presetIds) {
        const source = resolveAssetSource(presets, presetId)
        if (source && !source.characterAsset && !sources.some(item => item.id === source.id)) sources.push(source)
    }
    const limit = clampSceneLimit(request.sceneLimit)
    const next = [...presets]
    const takenNames = new Set(presets.map(preset => preset.name.toLocaleLowerCase()))
    const jobs: ReservationJob[] = []
    const seen = new Set<string>()
    let created = 0

    request.characters.forEach((character, index) => {
        if (seen.has(character.id)) return
        seen.add(character.id)
        const characterName = assetCharacterName(character.name, index)
        const referenceIds = [...new Set(character.referenceIds)]
        const usesReference = referenceIds.length > 0
        const characterFolderName = safeName(characterName, '캐릭터')
        const rootFolder = joinPath(request.sceneBasePath, RESERVATION_ROOT_FOLDER)
        const firstPassRoot = joinPath(rootFolder, usesReference ? `${characterFolderName}${RESERVATION_REFERENCE_SUFFIX}` : characterFolderName)
        const i2iRoot = joinPath(rootFolder, `${characterFolderName}${RESERVATION_I2I_SUFFIX}`)
        // 이 캐릭터 폴더에 이미 있는 씬 폴더 이름 (이전 예약 포함): 다른 묶음의 같은 이름 씬과 섞이지 않게 한다.
        const takenFolders = new Set<string>()
        for (const preset of next) {
            if (!preset.characterAsset?.reservation || preset.characterAsset.characterPromptId !== character.id) continue
            for (const scene of preset.scenes) {
                if (scene.folderPath) takenFolders.add(lastSegment(scene.folderPath).toLocaleLowerCase())
            }
        }

        for (const source of sources) {
            const existingIndex = next.findIndex(preset =>
                preset.characterAsset?.reservation
                && preset.characterAsset.characterPromptId === character.id
                && preset.characterAsset.parentPresetId === source.id)

            if (existingIndex >= 0) {
                // 이어하기: 덜 뽑힌 씬만 다시 예약한다.
                const existing = next[existingIndex]
                const needed = neededImages(existing.characterAsset!)
                let scenes = 0
                let images = 0
                const updatedScenes = existing.scenes.map((scene, sceneIndex) => {
                    const inRange = limit === null || sceneIndex < limit
                    const missing = Math.max(0, needed - scene.images.length)
                    if (!inRange || missing === 0) return { ...scene, queueCount: 0 }
                    scenes++
                    images += missing
                    // 레퍼런스 원본이 이미 있으면 다시 뽑지 않는다 (그 씬은 원본 없이 i2i만 따로 돌릴 수 없어 건너뛴다).
                    return { ...scene, queueCount: scene.images.length === 0 ? 1 : 0 }
                })
                // 원본만 있고 i2i가 없는 씬은 이번 실행에서 채울 수 없으므로 세지 않는다.
                const runnable = updatedScenes.filter(scene => scene.queueCount > 0).length
                next[existingIndex] = { ...existing, scenes: updatedScenes }
                jobs.push({
                    presetId: existing.id,
                    characterName: existing.characterAsset!.characterName,
                    setName: source.name,
                    usesReference: !!existing.characterAsset!.i2iCycle,
                    scenes: runnable,
                    images: runnable * needed,
                    resumed: true,
                })
                void scenes
                void images
                continue
            }

            const firstPassSeedMode = usesReference ? (request.referenceSeedMode ?? request.seedMode) : request.seedMode
            const presetId = makeId(created++)
            const picked = limit === null ? source.scenes : source.scenes.slice(0, limit)
            const scenes = picked.map((scene, sceneIndex) => {
                const base = safeName(scene.name, `씬 ${sceneIndex + 1}`)
                let folderName = base
                for (let suffix = 2; takenFolders.has(folderName.toLocaleLowerCase()); suffix++) folderName = `${base} (${suffix})`
                takenFolders.add(folderName.toLocaleLowerCase())
                return {
                    ...scene,
                    id: `${presetId}-scene-${sceneIndex}`,
                    images: [],
                    queueCount: 1,
                    folderPath: joinPath(firstPassRoot, folderName),
                    multiCharacterSlots: scene.multiCharacterSlots?.map(slot => ({
                        ...slot,
                        position: slot.position ? { ...slot.position } : undefined,
                    })),
                    createdAt: now,
                }
            })
            let name = `${RESERVATION_NAME_PREFIX}${characterName} - ${source.name}`
            for (let suffix = 2; takenNames.has(name.toLocaleLowerCase()); suffix++) name = `${RESERVATION_NAME_PREFIX}${characterName} - ${source.name} (${suffix})`
            takenNames.add(name.toLocaleLowerCase())

            const preset = {
                ...source,
                id: presetId,
                name,
                createdAt: now,
                scenes,
                characterAsset: {
                    parentPresetId: source.id,
                    characterPromptId: character.id,
                    characterName,
                    referenceIds,
                    reservation: true,
                    seedMode: firstPassSeedMode,
                    ...(firstPassSeedMode === 'fixed' || (usesReference && request.i2iSeedMode === 'fixed') ? { fixedSeed: clampSeed(request.fixedSeed) } : {}),
                    ...(usesReference ? { i2iCycle: true, i2iSeedMode: request.i2iSeedMode, i2iFolderRoot: i2iRoot } : {}),
                },
            } as Preset
            // 같은 캐릭터의 예약끼리 모이게 넣는다.
            let last = -1
            next.forEach((item, position) => {
                if (item.characterAsset?.reservation && item.characterAsset.characterPromptId === character.id) last = position
            })
            next.splice(last >= 0 ? last + 1 : next.length, 0, preset)
            jobs.push({
                presetId,
                characterName,
                setName: source.name,
                usesReference,
                scenes: scenes.length,
                images: scenes.length * (usesReference ? 2 : 1),
                resumed: false,
            })
        }
    })

    return { presets: next, jobs }
}

/** 화면 요약용: 요청대로 하면 몇 장이 생성되는지 (새로 만드는 경우 기준). */
export function estimateReservation<Preset extends AssetPreset>(
    presets: readonly Preset[],
    request: Pick<ReservationRequest, 'characters' | 'presetIds' | 'sceneLimit'>,
): { jobs: number; scenes: number; images: number } {
    const limit = clampSceneLimit(request.sceneLimit)
    const sources = [...new Set(request.presetIds)]
        .map(id => resolveAssetSource(presets, id))
        .filter((preset): preset is Preset => !!preset && !preset.characterAsset)
    const perSet = sources.reduce((sum, source) => sum + (limit === null ? source.scenes.length : Math.min(limit, source.scenes.length)), 0)
    let scenes = 0
    let images = 0
    for (const character of request.characters) {
        scenes += perSet
        images += perSet * (character.referenceIds.length > 0 ? 2 : 1)
    }
    return { jobs: request.characters.length * sources.length, scenes, images }
}

/** 아직 예약(대기)이 남아 있는지 */
export function hasQueuedScenes(preset: Pick<AssetPreset, 'scenes'> | null | undefined): boolean {
    return !!preset?.scenes.some(scene => scene.queueCount > 0)
}
