/**
 * 씬 모드 "레퍼런스 → i2i" 자동 싸이클의 순수 로직.
 *
 * 1단계: 평소대로(캐릭터 레퍼런스 켠 상태로) 예약된 씬을 모두 생성한다.
 * 2단계: 1단계에서 나온 이미지마다, 레퍼런스를 빼고 그 이미지를 원본으로 한 i2i를 한 장씩 생성한다.
 * 두 단계의 결과는 모두 같은 씬에 남는다. 2단계가 끝나면 싸이클이 끝난다.
 */

export const SCENE_I2I_DEFAULT_STRENGTH = 0.58
export const SCENE_I2I_MIN_STRENGTH = 0.01
export const SCENE_I2I_MAX_STRENGTH = 0.99

/** 변화 강도를 0.01~0.99, 소수 둘째 자리로 맞춘다. 숫자가 아니면 기본값. */
export function clampSceneI2iStrength(value: unknown): number {
    const number = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(number)) return SCENE_I2I_DEFAULT_STRENGTH
    return Math.round(Math.min(SCENE_I2I_MAX_STRENGTH, Math.max(SCENE_I2I_MIN_STRENGTH, number)) * 100) / 100
}

export function clampSceneI2iNoise(value: unknown): number {
    const number = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(number)) return 0
    return Math.round(Math.min(0.99, Math.max(0, number)) * 100) / 100
}

/** 1단계에서 저장된 이미지 한 장. 2단계는 이 기록으로 같은 조건을 다시 만든다. */
export interface FirstPassRecord<Entry = unknown> {
    sceneId: string
    /** 저장된 파일의 전체 경로 */
    path: string
    seed: number
    /** 그 이미지에 쓰인 캐릭터 프롬프트 (랜덤 캐릭터·순환 큐를 써도 2단계가 같은 캐릭터를 쓰게 한다) */
    /** 없으면(= 이미 있던 이미지를 I2I로 변형) 그 씬이 평소 쓰는 캐릭터를 쓴다 */
    characterPromptIds?: string[]
    /** 캐릭터 순환 큐로 생성했다면 그때의 항목 */
    sequenceEntry: Entry | null
}

export interface SecondPassStep<Scene, Entry = unknown> {
    scene: Scene
    record: FirstPassRecord<Entry>
}

/**
 * 2단계에서 생성할 목록. 1단계가 만든 순서를 그대로 따르고,
 * 그 사이에 지워진 씬의 기록은 건너뛴다. 같은 파일이 두 번 기록됐으면 한 번만 쓴다.
 */
export function planSecondPass<Scene extends { id: string }, Entry>(
    records: readonly FirstPassRecord<Entry>[],
    scenes: readonly Scene[],
): SecondPassStep<Scene, Entry>[] {
    const byId = new Map(scenes.map(scene => [scene.id, scene]))
    const seenPaths = new Set<string>()
    const steps: SecondPassStep<Scene, Entry>[] = []
    for (const record of records) {
        const scene = byId.get(record.sceneId)
        if (!scene || !record.path || seenPaths.has(record.path)) continue
        seenPaths.add(record.path)
        steps.push({ scene, record })
    }
    return steps
}

/** 파일 확장자로 data URL의 MIME을 정한다 (씬 이미지는 png 또는 webp로 저장된다). */
export function imageMimeForPath(path: string): 'image/png' | 'image/webp' | 'image/jpeg' {
    const extension = path.split('.').pop()?.toLowerCase()
    if (extension === 'webp') return 'image/webp'
    if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
    return 'image/png'
}

/** 바이트를 base64 data URL로. 큰 이미지에서 인자 개수 한도를 넘지 않게 나눠서 변환한다. */
export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
    let binary = ''
    const chunk = 0x8000
    for (let offset = 0; offset < bytes.length; offset += chunk) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
    }
    return `data:${mime};base64,${btoa(binary)}`
}

/**
 * "I2I로 변형": 씬마다 가장 최근 이미지 한 장을 고른다 (이미지가 없는 씬은 빠진다). 씬 순서 그대로.
 */
export function latestImagePerScene<Image extends { url: string; timestamp: number }>(
    scenes: ReadonlyArray<{ id: string; images: readonly Image[] }>,
): Array<{ sceneId: string; path: string }> {
    const picks: Array<{ sceneId: string; path: string }> = []
    for (const scene of scenes) {
        let latest: Image | null = null
        for (const image of scene.images) {
            // 아직 파일로 저장되지 않은 미리보기(data:)는 쓰지 않는다.
            if (image.url.startsWith('data:')) continue
            if (!latest || image.timestamp >= latest.timestamp) latest = image
        }
        if (latest) picks.push({ sceneId: scene.id, path: latest.url })
    }
    return picks
}

export type SceneI2iCyclePhase = 'idle' | 'first' | 'second'

export interface SceneI2iCycleState<Entry = unknown> {
    sessionId: number | null
    enabled: boolean
    phase: SceneI2iCyclePhase
    records: FirstPassRecord<Entry>[]
}

export const idleCycleState = <Entry>(): SceneI2iCycleState<Entry> => ({
    sessionId: null,
    enabled: false,
    phase: 'idle',
    records: [],
})

/**
 * 생성 세션이 시작될 때 한 번 정한다. 켜져 있는지는 시작 시점의 설정을 따른다:
 * 도중에 스위치를 바꿔도 진행 중인 싸이클은 그대로 간다.
 */
export function beginCycle<Entry>(
    state: SceneI2iCycleState<Entry>,
    sessionId: number,
    enabled: boolean,
): SceneI2iCycleState<Entry> {
    if (state.sessionId === sessionId) return state
    return { sessionId, enabled, phase: enabled ? 'first' : 'idle', records: [] }
}

/** 1단계 이미지 기록. 다른 세션이거나 싸이클이 꺼져 있거나 이미 2단계면 기록하지 않는다. */
export function recordFirstPass<Entry>(
    state: SceneI2iCycleState<Entry>,
    sessionId: number,
    record: FirstPassRecord<Entry>,
): SceneI2iCycleState<Entry> {
    if (state.sessionId !== sessionId || !state.enabled || state.phase !== 'first') return state
    return { ...state, records: [...state.records, record] }
}

/** 예약이 다 끝났을 때 2단계로 넘어갈지. */
export function shouldRunSecondPass<Entry>(state: SceneI2iCycleState<Entry>, sessionId: number): boolean {
    return state.sessionId === sessionId && state.enabled && state.phase === 'first' && state.records.length > 0
}
