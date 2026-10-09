/** 검열 탭: 폴더의 이미지를 한 장씩 넘기며 검수하고, 칠한 것은 하위 폴더에 따로 저장한다. */
export const CENSOR_FOLDER_NAME = '검열본'

export type CensorStatus = 'none' | 'viewed' | 'censored'
export type CensorBrushMode = 'pen' | 'blur' | 'eraser'
export type CensorBrushShape = 'round' | 'square'

export interface CensorBrush {
    mode: CensorBrushMode
    shape: CensorBrushShape
    size: number
    color: string
    opacity: number
    blurAmount: number
}

/** 수동검열(덧그리기) 창의 기본값과 같다. */
export const DEFAULT_CENSOR_BRUSH: CensorBrush = { mode: 'pen', shape: 'round', size: 48, color: '#000000', opacity: 100, blurAmount: 12 }

export function clampBrush(brush: Partial<CensorBrush> | undefined): CensorBrush {
    const merged = { ...DEFAULT_CENSOR_BRUSH, ...(brush ?? {}) }
    const number = (value: unknown, min: number, max: number, fallback: number) => {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
    }
    return {
        mode: merged.mode === 'blur' || merged.mode === 'eraser' ? merged.mode : 'pen',
        shape: merged.shape === 'square' ? 'square' : 'round',
        size: number(merged.size, 4, 240, DEFAULT_CENSOR_BRUSH.size),
        color: /^#[0-9a-f]{6}$/i.test(String(merged.color)) ? merged.color : DEFAULT_CENSOR_BRUSH.color,
        opacity: number(merged.opacity, 5, 100, DEFAULT_CENSOR_BRUSH.opacity),
        blurAmount: number(merged.blurAmount, 2, 30, DEFAULT_CENSOR_BRUSH.blurAmount),
    }
}

/** 검열본을 저장할 형식: 원본과 같은 확장자를 유지한다 (모르는 형식은 PNG). */
export function censorOutput(fileName: string): { name: string; mime: 'image/png' | 'image/webp' | 'image/jpeg' } {
    const match = /\.([a-z0-9]+)$/i.exec(fileName)
    const extension = match ? match[1].toLowerCase() : ''
    if (extension === 'webp') return { name: fileName, mime: 'image/webp' }
    if (extension === 'jpg' || extension === 'jpeg') return { name: fileName, mime: 'image/jpeg' }
    if (extension === 'png') return { name: fileName, mime: 'image/png' }
    return { name: `${match ? fileName.slice(0, match.index) : fileName}.png`, mime: 'image/png' }
}

/** 검열본이 있으면 붉은색(검열함), 넘겨 보기만 했으면 파란색(확인함) */
export function censorStatus(fileName: string, censoredNames: ReadonlySet<string>, viewedNames: ReadonlySet<string>): CensorStatus {
    if (censoredNames.has(censorOutput(fileName).name.toLowerCase())) return 'censored'
    return viewedNames.has(fileName.toLowerCase()) ? 'viewed' : 'none'
}

/** 파일 이름을 사람 눈에 맞는 순서로 (2 < 10) */
export function sortByName<T extends { name: string }>(files: readonly T[]): T[] {
    return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
}

/** < > 로 넘길 때의 다음 위치. 끝에서는 더 가지 않는다 (null). */
export function stepIndex(index: number, delta: number, total: number): number | null {
    const next = index + delta
    return next < 0 || next >= total ? null : next
}

/** 검수 키: , < ← 는 이전, . > → 는 다음 */
export function reviewKeyDelta(key: string): -1 | 1 | 0 {
    if (key === ',' || key === '<' || key === 'ArrowLeft') return -1
    if (key === '.' || key === '>' || key === 'ArrowRight') return 1
    return 0
}

export function summarizeCensor(names: readonly string[], censoredNames: ReadonlySet<string>, viewedNames: ReadonlySet<string>) {
    let censored = 0
    let viewed = 0
    for (const name of names) {
        const status = censorStatus(name, censoredNames, viewedNames)
        if (status === 'censored') censored += 1
        else if (status === 'viewed') viewed += 1
    }
    return { total: names.length, censored, viewed, remaining: names.length - censored - viewed }
}
