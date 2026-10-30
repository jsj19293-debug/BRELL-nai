/**
 * 씬 모드 "작업완료하기" (저장소를 불러오지 않는 순수 함수만 둔다).
 * 씬마다 가장 최근 1장을 골라 <보관 폴더>/<작품명 날짜 시각>/원본 (그대로) · WebP (EXIF 제거 + 고화질 압축) 로 내보내고,
 * 씬에는 그 1장만 남기고 나머지는 즐겨찾기여도 지운다.
 */
import { clampExportStart, sanitizeExportPrefix } from './scene-webp-export.ts'

export interface JobImage {
    id: string
    url: string
    timestamp: number
    isFavorite: boolean
}

export interface JobScene {
    id: string
    name: string
    images: readonly JobImage[]
}

export interface JobNaming {
    prefix: string
    start: number
    pad: boolean
}

export interface JobExport {
    sceneId: string
    sceneNumber: number
    sceneName: string
    source: string
    /** 확장자 없는 이름 ("12", "A12") */
    baseName: string
    /** 원본 확장자 (".png" 등) */
    originalExtension: string
}

export interface JobTrim {
    sceneId: string
    sceneNumber: number
    sceneName: string
    total: number
    keep: JobImage
    remove: JobImage[]
    favoritesRemoved: number
}

export interface JobPlan {
    exports: JobExport[]
    trims: JobTrim[]
    /** 이미지가 없는 씬 (번호는 비워 둔다) */
    emptyScenes: string[]
    removeCount: number
    favoriteRemoveCount: number
}

/** 씬에서 가장 최근에 뽑은 이미지 (파일로 저장된 것만) */
export function latestImage<T extends JobImage>(images: readonly T[]): T | null {
    let latest: T | null = null
    for (const image of images) {
        if (image.url.startsWith('data:')) continue
        if (!latest || image.timestamp > latest.timestamp) latest = image
    }
    return latest
}

const extensionOf = (path: string) => {
    const match = /\.([a-z0-9]{2,5})$/i.exec(path)
    return match ? `.${match[1].toLowerCase()}` : '.png'
}

/** 번호는 씬 순서를 따른다 (WebP 내보내기와 같은 이름 규칙). 이미지가 없는 씬은 번호만 비운다. */
export function planJob(scenes: readonly JobScene[], naming: JobNaming): JobPlan {
    const prefix = sanitizeExportPrefix(naming.prefix)
    const start = clampExportStart(naming.start)
    const width = naming.pad ? String(start + Math.max(0, scenes.length - 1)).length : 0
    const plan: JobPlan = { exports: [], trims: [], emptyScenes: [], removeCount: 0, favoriteRemoveCount: 0 }
    scenes.forEach((scene, index) => {
        const keep = latestImage(scene.images)
        if (!keep) {
            plan.emptyScenes.push(scene.name)
            return
        }
        const sceneNumber = start + index
        plan.exports.push({
            sceneId: scene.id,
            sceneNumber,
            sceneName: scene.name,
            source: keep.url,
            baseName: `${prefix}${String(sceneNumber).padStart(width, '0')}`,
            originalExtension: extensionOf(keep.url),
        })
        const remove = scene.images.filter(image => image.id !== keep.id)
        if (remove.length > 0) {
            const favoritesRemoved = remove.filter(image => image.isFavorite).length
            plan.trims.push({ sceneId: scene.id, sceneNumber, sceneName: scene.name, total: scene.images.length, keep, remove, favoritesRemoved })
            plan.removeCount += remove.length
            plan.favoriteRemoveCount += favoritesRemoved
        }
    })
    return plan
}

const pad = (value: number) => String(value).padStart(2, '0')

/** 보관 폴더 안에 만들 이번 작업의 폴더 이름: "작품명 2026-10-27 1031" */
export function jobFolderName(presetName: string, date: Date): string {
    const safe = presetName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim() || 'Untitled'
    return `${safe} ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}`
}

/** 이미 있는 이름이면 " (2)", " (3)" … 을 붙인다. */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
    const lower = new Set([...taken].map(name => name.toLocaleLowerCase()))
    if (!lower.has(base.toLocaleLowerCase())) return base
    for (let index = 2; ; index++) {
        const candidate = `${base} (${index})`
        if (!lower.has(candidate.toLocaleLowerCase())) return candidate
    }
}

/** 씬 안 이미지에 붙일 뽑은 시각: 올해면 "10/30 07:12", 다른 해면 "2025/10/30 07:12" */
export function formatShotTime(timestamp: number, now: Date = new Date()): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
    const date = new Date(timestamp)
    const day = `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
    return date.getFullYear() === now.getFullYear() ? `${day} ${time}` : `${date.getFullYear()}/${day} ${time}`
}

export interface SceneClearSummary {
    scenes: number
    images: number
    favorites: number
}

/** "씬 비우기"로 지울 것: 이미지가 있는 씬 수, 이미지 수, 그중 즐겨찾기 수 */
export function summarizeSceneClear(scenes: readonly JobScene[]): SceneClearSummary {
    const summary: SceneClearSummary = { scenes: 0, images: 0, favorites: 0 }
    for (const scene of scenes) {
        if (scene.images.length === 0) continue
        summary.scenes += 1
        summary.images += scene.images.length
        summary.favorites += scene.images.filter(image => image.isFavorite).length
    }
    return summary
}
