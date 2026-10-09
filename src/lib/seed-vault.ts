/** 시드 보관함: 마음에 든 이미지의 시드를 작은 미리보기와 함께 모아 둔다. */
export interface SeedVaultEntry {
    id: string
    seed: number
    /** 작은 미리보기 (data URL) */
    thumbnail?: string
    /** 원본 이미지 파일 위치 (있을 때만) */
    imagePath?: string
    prompt?: string
    model?: string
    width?: number
    height?: number
    memo?: string
    createdAt: number
}

export const MAX_SEED = 4294967295
export const MAX_SEED_ENTRIES = 500

/** 입력한 글자를 시드 숫자로 바꾼다. 쓸 수 없는 값이면 null. */
export function parseSeedInput(text: string): number | null {
    const cleaned = text.trim().replace(/[,\s]/g, '')
    if (!/^\d+$/.test(cleaned)) return null
    const value = Number(cleaned)
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SEED) return null
    return value
}

/** 새 항목을 맨 앞에 넣는다. 같은 시드 + 같은 이미지가 이미 있으면 그 항목을 맨 앞으로 올리기만 한다. */
export function addSeedEntry(entries: SeedVaultEntry[], entry: SeedVaultEntry): { entries: SeedVaultEntry[]; duplicate: boolean } {
    const existing = entries.find(item => item.seed === entry.seed && (item.imagePath || '') === (entry.imagePath || '') && (item.prompt || '') === (entry.prompt || ''))
    if (existing) {
        return { entries: [existing, ...entries.filter(item => item !== existing)], duplicate: true }
    }
    return { entries: [entry, ...entries].slice(0, MAX_SEED_ENTRIES), duplicate: false }
}

/** 검색어로 걸러 낸다 (시드 숫자, 프롬프트, 메모). */
export function filterSeedEntries(entries: SeedVaultEntry[], query: string): SeedVaultEntry[] {
    const needle = query.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter(entry =>
        String(entry.seed).includes(needle)
        || (entry.prompt || '').toLowerCase().includes(needle)
        || (entry.memo || '').toLowerCase().includes(needle))
}
