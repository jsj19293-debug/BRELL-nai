/**
 * 후처리(말풍선 공방) 템플릿 · 씬 자동 적용에 쓰는 순수 함수.
 */

/** 후처리 결과를 담는 하위 폴더 이름 (씬 폴더 · 검열 폴더 안) */
export const POSTPROCESS_FOLDER_NAME = '후처리'

export interface TemplateSize {
    width: number
    height: number
}

/** 템플릿과 그림의 가로세로 비율이 거의 같은지 (같으면 크기가 달라도 맞춰 그린다) */
export function sameAspect(a: TemplateSize, b: TemplateSize, tolerance = 0.02): boolean {
    if (!a.width || !a.height || !b.width || !b.height) return true
    const ra = a.width / a.height
    const rb = b.width / b.height
    return Math.abs(ra - rb) / rb <= tolerance
}

/** 원본 파일 이름 → 후처리 결과 이름 (항상 PNG): "NAIS_SCENE_1.webp" → "NAIS_SCENE_1.png" */
export function postprocessFileName(fileName: string): string {
    const stem = fileName.replace(/\.[a-z0-9]{2,5}$/i, '')
    return `${stem || 'image'}.png`
}

/** 경로에서 폴더와 파일 이름 나누기 (\ 와 / 둘 다) */
export function splitPath(path: string): { folder: string; name: string } {
    const index = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
    return index < 0 ? { folder: '', name: path } : { folder: path.slice(0, index), name: path.slice(index + 1) }
}

/** 템플릿 이름: 비우면 "템플릿 N", 이미 있으면 " (2)" … */
export function uniqueTemplateName(name: string, taken: readonly string[]): string {
    const base = name.trim().slice(0, 40) || `템플릿 ${taken.length + 1}`
    const lower = new Set(taken.map(item => item.toLocaleLowerCase()))
    if (!lower.has(base.toLocaleLowerCase())) return base
    for (let index = 2; ; index++) {
        const candidate = `${base} (${index})`
        if (!lower.has(candidate.toLocaleLowerCase())) return candidate
    }
}
