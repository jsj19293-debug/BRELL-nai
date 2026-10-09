/**
 * 프롬프트 관리: 작품별 세계관 · 로어북 · 메모의 데이터 규칙.
 * 화면과 저장소 없이 검사할 수 있도록 순수 함수로만 둔다.
 */

export const WORLD_MAX_CHARS = 10_000
export const LORE_CONTENT_MAX_CHARS = 500
export const LORE_TITLE_MAX_CHARS = 60
export const LORE_KEYWORDS_MAX_CHARS = 200
export const LORE_MAX_ENTRIES = 150
export const MEMO_MAX_CHARS = 5_000
export const MEMO_TITLE_MAX_CHARS = 60
export const MEMO_MAX_COUNT = 100
export const PROJECT_NAME_MAX_CHARS = 40
export const PROJECT_MAX_COUNT = 100
export const IMAGES_MAX_PER_ITEM = 12

export interface LoreEntry {
    id: string
    title: string
    content: string
    /** 쉼표로 나눈 키워드 (입력한 그대로 보관) */
    keywords: string
    images: string[]
    updatedAt: number
}

export interface MemoNote {
    id: string
    title: string
    content: string
    images: string[]
    updatedAt: number
}

export interface PromptProject {
    id: string
    name: string
    world: string
    worldImages: string[]
    lore: LoreEntry[]
    memos: MemoNote[]
    createdAt: number
    updatedAt: number
}

/** 글자 수: 한글 한 글자, 이모지 하나, 공백과 줄바꿈도 각각 1자로 센다. */
export function countChars(text: string): number {
    let count = 0
    for (const _ of text) count++
    return count
}

/** 한도를 넘는 뒷부분을 잘라낸다 (이모지 같은 글자를 반으로 자르지 않는다). */
export function clampChars(text: string, max: number): string {
    if (text.length <= max) return text
    let result = ''
    let count = 0
    for (const char of text) {
        if (count >= max) break
        result += char
        count++
    }
    return result
}

/** "마법, 왕국 ,, 마법" → ["마법", "왕국"] (빈 것과 중복 제거, 대소문자 구분 없이) */
export function parseKeywords(keywords: string): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const part of keywords.split(/[,，\n]/)) {
        const keyword = part.trim()
        const key = keyword.toLocaleLowerCase()
        if (!keyword || seen.has(key)) continue
        seen.add(key)
        result.push(keyword)
    }
    return result
}

/** 이미지 경로 목록에 새 경로를 더한다: 중복(대소문자·구분자 무시)은 빼고 최대 개수까지만. */
export function addImages(current: readonly string[], added: readonly string[], max = IMAGES_MAX_PER_ITEM): string[] {
    const key = (path: string) => path.trim().replace(/\\/g, '/').toLocaleLowerCase()
    const seen = new Set(current.map(key))
    const result = [...current]
    for (const path of added) {
        if (result.length >= max) break
        if (!path.trim() || seen.has(key(path))) continue
        seen.add(key(path))
        result.push(path.trim())
    }
    return result
}

export function isImagePath(path: string): boolean {
    return /\.(png|webp|jpe?g|gif|avif)$/i.test(path.trim())
}

export function createProject(id: string, name: string, now: number): PromptProject {
    return {
        id,
        name: clampChars(name.trim(), PROJECT_NAME_MAX_CHARS) || '새 작품',
        world: '',
        worldImages: [],
        lore: [],
        memos: [],
        createdAt: now,
        updatedAt: now,
    }
}

export function canAddLore(project: Pick<PromptProject, 'lore'>): boolean {
    return project.lore.length < LORE_MAX_ENTRIES
}

export function canAddMemo(project: Pick<PromptProject, 'memos'>): boolean {
    return project.memos.length < MEMO_MAX_COUNT
}

export function normalizeLore(entry: LoreEntry): LoreEntry {
    return {
        ...entry,
        title: clampChars(entry.title, LORE_TITLE_MAX_CHARS),
        content: clampChars(entry.content, LORE_CONTENT_MAX_CHARS),
        keywords: clampChars(entry.keywords, LORE_KEYWORDS_MAX_CHARS),
        images: entry.images.slice(0, IMAGES_MAX_PER_ITEM),
    }
}

export function normalizeMemo(memo: MemoNote): MemoNote {
    return {
        ...memo,
        title: clampChars(memo.title, MEMO_TITLE_MAX_CHARS),
        content: clampChars(memo.content, MEMO_MAX_CHARS),
        images: memo.images.slice(0, IMAGES_MAX_PER_ITEM),
    }
}

/** 로어북 검색: 제목 · 내용 · 키워드 어디든 들어 있으면 남긴다. */
export function filterLore(entries: readonly LoreEntry[], query: string): LoreEntry[] {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return [...entries]
    return entries.filter(entry =>
        `${entry.title}\n${entry.keywords}\n${entry.content}`.toLocaleLowerCase().includes(needle))
}

/** 로어북 한 항목을 붙여 넣기 좋은 글로 만든다. */
export function formatLoreEntry(entry: Pick<LoreEntry, 'title' | 'content' | 'keywords'>): string {
    const keywords = parseKeywords(entry.keywords)
    return [
        entry.title.trim() ? `[${entry.title.trim()}]` : '',
        keywords.length ? `키워드: ${keywords.join(', ')}` : '',
        entry.content.trim(),
    ].filter(Boolean).join('\n')
}

/** 작품 전체(세계관 + 로어북)를 한 번에 복사할 글 */
export function formatProject(project: Pick<PromptProject, 'name' | 'world' | 'lore'>): string {
    const lore = project.lore.map(formatLoreEntry).filter(Boolean)
    return [
        `# ${project.name}`,
        project.world.trim() ? `## 세계관\n${project.world.trim()}` : '',
        lore.length ? `## 로어북\n${lore.join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n')
}

/** 로어북 전체의 글자 수 합계 (내용만) */
export function totalLoreChars(entries: readonly LoreEntry[]): number {
    return entries.reduce((sum, entry) => sum + countChars(entry.content), 0)
}

// ---------------------------------------------------------------------------
// 로어북 ↔ txt (메모장)
//
// ---
//
// ## 01 제목
// 내용
//
// ---
//
// ## 02 제목
// 내용
//
// ---
// ---------------------------------------------------------------------------

const LORE_TXT_SEPARATOR = '---'

/** 로어북 전체를 메모장용 글로 만든다. 키워드는 넣지 않는다 (제목과 내용만). */
export function formatLoreTxt(entries: ReadonlyArray<Pick<LoreEntry, 'title' | 'content'>>): string {
    if (entries.length === 0) return ''
    const width = Math.max(2, String(entries.length).length)
    const blocks = entries.map((entry, index) => {
        const number = String(index + 1).padStart(width, '0')
        const title = entry.title.trim() || '제목 없음'
        const content = entry.content.replace(/\r\n?/g, '\n').replace(/\s+$/, '')
        return `## ${number} ${title}${content ? `\n${content}` : ''}`
    })
    return `${LORE_TXT_SEPARATOR}\n\n${blocks.join(`\n\n${LORE_TXT_SEPARATOR}\n\n`)}\n\n${LORE_TXT_SEPARATOR}\n`
}

export interface ParsedLoreTxt {
    entries: Array<{ title: string; content: string }>
    /** 한도(제목 60자, 내용 500자)를 넘어서 잘린 항목 수 */
    truncated: number
}

/**
 * 위 양식의 글을 로어북 항목으로 읽는다. "## 01 제목" 줄이 항목의 시작이고, 그 아래가 내용이다.
 * 제목 앞의 번호는 버린다. "---" 줄은 항목 사이의 구분선으로만 본다.
 */
export function parseLoreTxt(text: string): ParsedLoreTxt {
    const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
    const raw: Array<{ title: string; lines: string[] }> = []
    let current: { title: string; lines: string[] } | null = null

    for (const line of lines) {
        const heading = line.match(/^##\s+(.*)$/)
        if (heading) {
            current = { title: heading[1].replace(/^\d+\s*[.)]?\s+/, '').trim(), lines: [] }
            raw.push(current)
            continue
        }
        if (line.trim() === LORE_TXT_SEPARATOR) {
            // 구분선 뒤에 제목 없이 이어지는 글은 어느 항목에도 넣지 않는다.
            current = null
            continue
        }
        current?.lines.push(line)
    }

    let truncated = 0
    const entries = raw.map(item => {
        const content = item.lines.join('\n').trim()
        const title = clampChars(item.title, LORE_TITLE_MAX_CHARS)
        const clamped = clampChars(content, LORE_CONTENT_MAX_CHARS)
        if (clamped !== content || title !== item.title) truncated++
        return { title, content: clamped }
    })
    return { entries, truncated }
}

/** txt 파일 이름: 작품 이름에서 파일에 못 쓰는 글자를 뺀다. */
export function loreTxtFileName(projectName: string): string {
    const safe = projectName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().replace(/[. ]+$/, '')
    return `${safe || '로어북'}_로어북.txt`
}

// ---------------------------------------------------------------------------
// 전체 JSON 저장 · 불러오기 (모든 작품의 세계관 · 로어북 · 키워드 · 메모 · 이미지 경로)
// ---------------------------------------------------------------------------

export const NOTES_JSON_KIND = 'nais2-rell-prompt-notes'

export function exportNotesJson(projects: readonly PromptProject[], now: number): string {
    return JSON.stringify({ kind: NOTES_JSON_KIND, version: 1, exportedAt: now, projects }, null, 2)
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
const images = (value: unknown) =>
    (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()) : []).slice(0, IMAGES_MAX_PER_ITEM)
const stamp = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

/**
 * 저장한 JSON을 읽는다. 손으로 고친 파일도 받아들이도록 빠진 칸은 채우고 한도를 넘는 것은 자른다.
 * 형식이 다르면 INVALID_JSON / NOT_PROMPT_NOTES 오류를 던진다.
 */
export function parseNotesJson(json: string): PromptProject[] {
    let data: { kind?: unknown; projects?: unknown }
    try {
        data = JSON.parse(json.replace(/^\uFEFF/, ''))
    } catch {
        throw new Error('INVALID_JSON')
    }
    if (!data || data.kind !== NOTES_JSON_KIND || !Array.isArray(data.projects)) throw new Error('NOT_PROMPT_NOTES')

    const now = Date.now()
    let counter = 0
    const freshId = () => `import-${now.toString(36)}-${(counter++).toString(36)}`
    const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [])

    return list(data.projects).slice(0, PROJECT_MAX_COUNT).map(raw => ({
        id: text(raw.id) || freshId(),
        name: clampChars(text(raw.name).trim(), PROJECT_NAME_MAX_CHARS) || '새 작품',
        world: clampChars(text(raw.world), WORLD_MAX_CHARS),
        worldImages: images(raw.worldImages),
        lore: list(raw.lore).slice(0, LORE_MAX_ENTRIES).map(entry => normalizeLore({
            id: text(entry.id) || freshId(),
            title: text(entry.title),
            content: text(entry.content),
            keywords: text(entry.keywords),
            images: images(entry.images),
            updatedAt: stamp(entry.updatedAt, now),
        })),
        memos: list(raw.memos).slice(0, MEMO_MAX_COUNT).map(memo => normalizeMemo({
            id: text(memo.id) || freshId(),
            title: text(memo.title),
            content: text(memo.content),
            images: images(memo.images),
            updatedAt: stamp(memo.updatedAt, now),
        })),
        createdAt: stamp(raw.createdAt, now),
        updatedAt: stamp(raw.updatedAt, now),
    }))
}

/**
 * 불러온 작품들을 지금 목록 뒤에 더한다. 있던 작품은 건드리지 않는다:
 * id가 겹치면 새 id를 주고, 이름이 겹치면 "(2)"를 붙인다. 최대 개수를 넘는 것은 넣지 않는다.
 */
export function mergeImportedProjects(
    current: readonly PromptProject[],
    imported: readonly PromptProject[],
    max: number,
    makeId: () => string,
): { projects: PromptProject[]; added: number } {
    const ids = new Set(current.map(project => project.id))
    const names = new Set(current.map(project => project.name.toLocaleLowerCase()))
    const projects = [...current]
    let added = 0
    for (const project of imported) {
        if (projects.length >= max) break
        let id = project.id
        while (ids.has(id)) id = makeId()
        ids.add(id)
        let name = project.name
        for (let index = 2; names.has(name.toLocaleLowerCase()); index++) name = `${project.name} (${index})`
        names.add(name.toLocaleLowerCase())
        projects.push({ ...project, id, name })
        added++
    }
    return { projects, added }
}
