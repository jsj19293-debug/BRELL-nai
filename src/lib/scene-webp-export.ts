/**
 * 씬 모드 → WebP 폴더 내보내기에서 쓸 파일 이름 짓기.
 * 씬 순서대로 1, 2, 3 … 또는 접두어를 붙여 A1, A2, A3 … 으로 이름을 붙인다.
 */

export interface ExportSceneImage {
    url: string
    timestamp: number
    isFavorite: boolean
}

export interface ExportScene {
    id: string
    name: string
    images: readonly ExportSceneImage[]
}

/** 씬마다 어떤 이미지를 내보낼지: 대표 1장(즐겨찾기 우선, 없으면 최신) 또는 전부 */
export type SceneWebpImageScope = 'representative' | 'all'

export interface SceneWebpNameOptions {
    /** 번호 앞에 붙일 글자. 비우면 번호만 쓴다. */
    prefix: string
    /** 첫 씬의 번호 */
    start: number
    /** 자릿수 맞추기 (1 → 001) */
    pad: boolean
    scope: SceneWebpImageScope
}

export interface SceneWebpEntry {
    source: string
    fileName: string
    sceneId: string
    sceneName: string
}

export interface SceneWebpPlan {
    entries: SceneWebpEntry[]
    /** 이미지가 없어서 건너뛴 씬 이름 */
    emptyScenes: string[]
}

/** 파일 이름에 못 쓰는 글자를 뺀 접두어 */
export function sanitizeExportPrefix(prefix: string): string {
    return prefix.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/^\.+/, '').trim().slice(0, 40)
}

export function clampExportStart(value: unknown): number {
    const number = Math.floor(Number(value))
    if (!Number.isFinite(number)) return 1
    return Math.min(999_999, Math.max(0, number))
}

function representativeOf(images: readonly ExportSceneImage[]): ExportSceneImage | null {
    let newest: ExportSceneImage | null = null
    let newestFavorite: ExportSceneImage | null = null
    for (const image of images) {
        if (!newest || image.timestamp > newest.timestamp) newest = image
        if (image.isFavorite && (!newestFavorite || image.timestamp > newestFavorite.timestamp)) newestFavorite = image
    }
    return newestFavorite || newest
}

/**
 * 씬 순서대로 내보낼 파일 목록을 만든다. 번호는 씬의 순서를 따르므로 이미지가 없는 씬은
 * 번호만 비고 다음 씬 번호는 밀리지 않는다 (5번째 씬은 언제나 5번).
 * 씬의 이미지를 전부 내보낼 때는 오래된 것부터 A1-1, A1-2 … 로 붙인다.
 */
export function planSceneWebpExport(scenes: readonly ExportScene[], options: SceneWebpNameOptions): SceneWebpPlan {
    const prefix = sanitizeExportPrefix(options.prefix)
    const start = clampExportStart(options.start)
    const width = options.pad ? String(start + Math.max(0, scenes.length - 1)).length : 0
    const entries: SceneWebpEntry[] = []
    const emptyScenes: string[] = []

    scenes.forEach((scene, index) => {
        const base = `${prefix}${String(start + index).padStart(width, '0')}`
        const images = options.scope === 'all'
            ? [...scene.images].sort((a, b) => a.timestamp - b.timestamp)
            : [representativeOf(scene.images)].filter((image): image is ExportSceneImage => image !== null)
        if (images.length === 0) {
            emptyScenes.push(scene.name)
            return
        }
        images.forEach((image, imageIndex) => {
            const name = images.length > 1 ? `${base}-${imageIndex + 1}` : base
            entries.push({ source: image.url, fileName: `${name}.webp`, sceneId: scene.id, sceneName: scene.name })
        })
    })

    return { entries, emptyScenes }
}

/** 화면에 보여줄 이름 미리보기: "A1.webp, A2.webp … A90.webp" */
export function previewExportNames(entries: readonly SceneWebpEntry[]): string {
    if (entries.length === 0) return ''
    const names = entries.map(entry => entry.fileName)
    if (names.length <= 4) return names.join(', ')
    return `${names[0]}, ${names[1]}, ${names[2]} … ${names[names.length - 1]}`
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB'
    const megabytes = bytes / (1024 * 1024)
    if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(2)} GB`
    return megabytes >= 10 ? `${megabytes.toFixed(0)} MB` : `${megabytes.toFixed(1)} MB`
}
