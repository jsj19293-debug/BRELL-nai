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
