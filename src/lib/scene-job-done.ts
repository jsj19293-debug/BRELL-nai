/**
 * 씬 모드 "작업완료하기": 작품 폴더에 쌓인 결과물을 지정한 보관 폴더로 모으고, 다음 작업을 위해 작품 폴더를 비운다.
 * (저장소를 불러오지 않는 순수 함수만 둔다.)
 */
import type { FolderMove } from '@/lib/storage-migration'

const normalize = (path: string) => path.replace(/\//g, '\\').replace(/\\+$/, '').toLocaleLowerCase()

/** child 가 parent 와 같거나 그 안에 있는지 (대소문자 · 구분자 무시) */
export function isInside(child: string, parent: string): boolean {
    const a = normalize(child)
    const b = normalize(parent)
    return a === b || a.startsWith(b + '\\')
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

export type JobDonePlan =
    | { ok: true; moves: FolderMove[] }
    | { ok: false; reason: 'destination-inside-work' | 'work-inside-destination' }

/** 옮길 목록: 작품 폴더 통째로 → <보관 폴더>/<이번 작업 폴더>. 서로 안에 들어 있으면 거절한다. */
export function planJobDone(presetFolder: string, jobFolder: string): JobDonePlan {
    if (isInside(jobFolder, presetFolder)) return { ok: false, reason: 'destination-inside-work' }
    if (isInside(presetFolder, jobFolder)) return { ok: false, reason: 'work-inside-destination' }
    return { ok: true, moves: [{ sourcePath: presetFolder, destinationPath: jobFolder }] }
}
