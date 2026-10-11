/** 파일 도구(메타데이터 제거 · 슬라이드쇼 WebP)가 쓰는 경로 · 목록 처리 */
export const STRIP_FOLDER_NAME = '메타제거'

const parts = (path: string) => path.split(/[\\/]+/).filter(Boolean)

export const fileNameOf = (path: string) => parts(path).pop() ?? path

export const isImageName = (name: string) => /\.(png|jpe?g|webp)$/i.test(name)

/** 고른 파일들이 함께 들어 있는 가장 안쪽 폴더. 드라이브가 다르면 빈 문자열. */
export function commonParent(paths: readonly string[]): string {
    if (paths.length === 0) return ''
    const separator = paths[0].includes('\\') ? '\\' : '/'
    const leading = paths[0].startsWith('/') ? '/' : ''
    let shared = parts(paths[0]).slice(0, -1)
    for (const path of paths.slice(1)) {
        const folders = parts(path).slice(0, -1)
        let same = 0
        while (same < shared.length && same < folders.length && shared[same].toLowerCase() === folders[same].toLowerCase()) same++
        shared = shared.slice(0, same)
    }
    return shared.length === 0 ? '' : leading + shared.join(separator)
}

/** base 폴더에서 본 파일의 하위 폴더 ("a/b"). 바로 아래 있거나 base 밖이면 빈 문자열. */
export function relativeDir(path: string, base: string): string {
    const folders = parts(path).slice(0, -1)
    const root = parts(base)
    if (root.length === 0 || folders.length < root.length) return ''
    for (let index = 0; index < root.length; index++) {
        if (folders[index].toLowerCase() !== root[index].toLowerCase()) return ''
    }
    return folders.slice(root.length).join('/')
}

/** 저장할 파일 이름: 원래 이름에 새 확장자 */
export function stripOutputName(name: string, extension: string): string {
    const dot = name.lastIndexOf('.')
    return `${dot > 0 ? name.slice(0, dot) : name}.${extension}`
}

/** 표시 시간(초): 비었거나 잘못된 값이면 기본값. 0.05 ~ 600초. */
export function clampSeconds(text: string | number, fallback: number): number {
    const parsed = typeof text === 'number' ? text : text.trim() === '' ? NaN : Number(text)
    const value = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
    return Math.min(600, Math.max(0.05, Number.isFinite(value) && value > 0 ? value : 1))
}

/** 목록에서 한 항목을 다른 자리로 옮긴다. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
    const next = [...list]
    if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
}
