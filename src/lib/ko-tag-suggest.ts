/**
 * 프롬프트 칸의 한글 → 태그 추천. 내장 용어집에서 찾고, 앱의 태그 색인에 실제로 있는 태그만 남긴다.
 */
import { lookupTags, type TagSearchResult } from '@/lib/tag-search-client'
import { keepKnownTags, searchKoGlossary, type KoTagSuggestion } from '@/lib/ko-tags'

export interface KoTagMatch extends KoTagSuggestion {
    count: number
    type: string
}

async function withIndexInfo(candidates: KoTagSuggestion[]): Promise<KoTagMatch[]> {
    if (!candidates.length) return []
    let found: TagSearchResult[]
    try {
        found = await lookupTags(candidates.map(candidate => candidate.tag))
    } catch {
        return []
    }
    const info = new Map(found.map(tag => [tag.label.toLowerCase(), tag]))
    const known = new Map(found.map(tag => [tag.label.toLowerCase(), tag.label]))
    return keepKnownTags(candidates, known).map(candidate => {
        const tag = info.get(candidate.tag.toLowerCase())!
        return { ...candidate, count: tag.count, type: tag.type }
    })
}

/** 내장 용어집에서 바로 찾는다 (네트워크 없음). */
export function glossaryMatches(term: string, limit: number): Promise<KoTagMatch[]> {
    return withIndexInfo(searchKoGlossary(term, limit))
}
