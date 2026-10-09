/**
 * 한글 → 단부루 태그 찾기의 순수 로직.
 * - 내장 용어집(ko-tag-glossary.ts)에서 한글 검색어로 태그를 찾고, 영어 태그의 한글 이름을 돌려준다.
 * - AI가 알려준 "한글 검색어 → 태그" 결과를 정리해 캐시에 담을 수 있는 형태로 만든다.
 * 화면·네트워크·저장소에 의존하지 않아서 `npm run check:ko-tags`로 검사한다.
 */
import { KO_TAG_GLOSSARY } from './ko-tag-glossary.ts'

export interface KoTagSuggestion {
    /** 태그 색인의 표기 그대로 (예: "long hair") */
    tag: string
    /** 한글 뜻 (예: "긴 머리") */
    ko: string
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/

export function hasHangul(text: string): boolean {
    return HANGUL.test(text)
}

/** 띄어쓰기와 문장부호 차이를 무시하고 비교한다 ("긴머리" = "긴 머리"). */
export function normalizeKo(text: string): string {
    return text.normalize('NFC').toLowerCase().replace(/[\s_\-.,()'"·]/g, '')
}

interface GlossaryEntry {
    tag: string
    ko: string
    keys: string[]
    order: number
}

const ENTRIES: GlossaryEntry[] = KO_TAG_GLOSSARY.map(([tag, names], order) => ({
    tag,
    ko: names[0],
    keys: names.map(normalizeKo),
    order,
}))
const BY_TAG = new Map(ENTRIES.map(entry => [entry.tag.toLowerCase(), entry.ko]))

/** 영어 태그의 한글 이름. 용어집에 없으면 null. 밑줄 표기(long_hair)도 받는다. */
export function koNameOfTag(tag: string): string | null {
    return BY_TAG.get(tag.trim().toLowerCase().replace(/_/g, ' ')) ?? null
}

/**
 * 한글 검색어로 용어집을 찾는다. 순서: 완전히 같은 이름 → 그 말로 시작하는 이름 → 그 말이 들어간 이름.
 * 같은 단계 안에서는 용어집 순서(자주 쓰는 것이 앞)를 따른다.
 */
export function searchKoGlossary(query: string, limit = 8): KoTagSuggestion[] {
    const key = normalizeKo(query)
    if (!key || !hasHangul(key)) return []
    const ranked: { entry: GlossaryEntry; rank: number }[] = []
    for (const entry of ENTRIES) {
        let rank = 3
        for (const name of entry.keys) {
            const current = name === key ? 0 : name.startsWith(key) ? 1 : name.includes(key) ? 2 : 3
            if (current < rank) rank = current
        }
        // 한 글자 검색어는 "들어간 이름"까지 넓히면 너무 많이 걸린다.
        if (rank < 3 && !(key.length < 2 && rank === 2)) ranked.push({ entry, rank })
    }
    ranked.sort((a, b) => a.rank - b.rank || a.entry.order - b.entry.order)
    return ranked.slice(0, limit).map(({ entry }) => ({ tag: entry.tag, ko: entry.ko }))
}

/** AI 응답 등에서 온 태그 문자열을 색인 표기(소문자, 공백)로 맞춘다. */
export function normalizeTagLabel(tag: string): string {
    return tag.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ')
}

/**
 * AI가 준 텍스트에서 JSON을 꺼낸다. 코드 펜스나 앞뒤 설명이 붙어 와도 첫 JSON 값만 읽는다.
 * 읽지 못하면 null.
 */
export function extractJson(text: string): unknown {
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    try {
        return JSON.parse(trimmed)
    } catch {
        /* 설명이 섞여 있으면 아래에서 괄호 범위를 찾는다 */
    }
    const start = trimmed.search(/[[{]/)
    if (start < 0) return null
    const open = trimmed[start]
    const close = open === '[' ? ']' : '}'
    let depth = 0
    let inString = false
    let escaped = false
    for (let index = start; index < trimmed.length; index++) {
        const char = trimmed[index]
        if (inString) {
            if (escaped) escaped = false
            else if (char === '\\') escaped = true
            else if (char === '"') inString = false
            continue
        }
        if (char === '"') inString = true
        else if (char === open) depth++
        else if (char === close && --depth === 0) {
            try {
                return JSON.parse(trimmed.slice(start, index + 1))
            } catch {
                return null
            }
        }
    }
    return null
}

/** `[{ "tag": "...", "ko": "..." }]` 모양만 받아 정리한다. 중복 태그는 처음 것만 남긴다. */
export function readTagList(value: unknown, limit = 60): KoTagSuggestion[] {
    const list = Array.isArray(value)
        ? value
        : value && typeof value === 'object' && Array.isArray((value as { tags?: unknown }).tags)
            ? (value as { tags: unknown[] }).tags
            : []
    const seen = new Set<string>()
    const result: KoTagSuggestion[] = []
    for (const item of list) {
        const raw = typeof item === 'string'
            ? { tag: item, ko: '' }
            : item && typeof item === 'object'
                ? (item as { tag?: unknown; ko?: unknown })
                : null
        if (!raw || typeof raw.tag !== 'string') continue
        const tag = normalizeTagLabel(raw.tag)
        if (!tag || tag.length > 80 || seen.has(tag)) continue
        seen.add(tag)
        result.push({ tag, ko: typeof raw.ko === 'string' ? raw.ko.trim().slice(0, 40) : '' })
        if (result.length >= limit) break
    }
    return result
}

/**
 * 후보를 "색인에 실제로 있는 태그"로만 거른다. 색인 표기를 결과에 쓰고,
 * 한글 뜻이 비어 있으면 용어집의 이름으로 채운다.
 */
export function keepKnownTags(
    candidates: KoTagSuggestion[],
    known: ReadonlyMap<string, string>,
): KoTagSuggestion[] {
    const seen = new Set<string>()
    const result: KoTagSuggestion[] = []
    for (const candidate of candidates) {
        const label = known.get(normalizeTagLabel(candidate.tag))
        if (!label || seen.has(label)) continue
        seen.add(label)
        result.push({ tag: label, ko: candidate.ko || koNameOfTag(label) || '' })
    }
    return result
}

/** 용어집 결과 뒤에 AI 결과를 붙인다 (같은 태그는 앞의 것을 유지). */
export function mergeSuggestions(first: KoTagSuggestion[], second: KoTagSuggestion[], limit: number): KoTagSuggestion[] {
    const seen = new Set<string>()
    const result: KoTagSuggestion[] = []
    for (const item of [...first, ...second]) {
        const key = item.tag.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        result.push(item)
        if (result.length >= limit) break
    }
    return result
}
