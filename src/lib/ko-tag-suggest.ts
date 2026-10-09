/**
 * 프롬프트 칸의 한글 → 태그 추천. 내장 용어집 결과를 바로 보여주고, AI 키가 있으면 AI 결과를 덧붙인다.
 * 어느 쪽이든 앱의 태그 색인에 실제로 있는 태그만 남긴다. AI 결과는 기기에 저장해 같은 말은 다시 묻지 않는다.
 */
import { lookupTags, type TagSearchResult } from '@/lib/tag-search-client'
import { useSettingsStore } from '@/stores/settings-store'
import { DEFAULT_AI_MODEL, suggestTagsForTerm, type AiConfig, type AiProvider } from '@/services/ai-tag-service'
import { keepKnownTags, normalizeKo, searchKoGlossary, type KoTagSuggestion } from '@/lib/ko-tags'

export interface KoTagMatch extends KoTagSuggestion {
    count: number
    type: string
    source: 'glossary' | 'ai'
}

const CACHE_KEY = 'nais2-forge-ko-tag-cache-v1'
const CACHE_LIMIT = 600
let cache: Map<string, KoTagSuggestion[]> | null = null

function loadCache(): Map<string, KoTagSuggestion[]> {
    if (cache) return cache
    cache = new Map()
    try {
        const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')
        if (Array.isArray(saved)) {
            for (const entry of saved) {
                if (Array.isArray(entry) && typeof entry[0] === 'string' && Array.isArray(entry[1])) cache.set(entry[0], entry[1])
            }
        }
    } catch {
        /* 저장소를 못 쓰면 이번 실행 동안만 기억한다 */
    }
    return cache
}

function remember(key: string, tags: KoTagSuggestion[]): void {
    const store = loadCache()
    store.delete(key)
    store.set(key, tags)
    while (store.size > CACHE_LIMIT) store.delete(store.keys().next().value as string)
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify([...store.entries()]))
    } catch {
        /* 용량 초과 등은 무시한다 */
    }
}

export function clearKoTagCache(): void {
    cache = new Map()
    try {
        localStorage.removeItem(CACHE_KEY)
    } catch {
        /* ignore */
    }
}

/** 지금 설정으로 쓸 AI 연결. 고른 제공사의 키가 없으면 null. */
export function currentAiConfig(provider?: AiProvider): AiConfig | null {
    const state = useSettingsStore.getState()
    const chosen = provider ?? state.aiTagProvider
    const apiKey = chosen === 'claude' ? state.anthropicApiKey : chosen === 'openai' ? state.openaiApiKey : state.geminiApiKey
    if (!apiKey.trim()) return null
    return { provider: chosen, apiKey, model: state.aiTagModels?.[chosen] || DEFAULT_AI_MODEL[chosen] }
}

async function withIndexInfo(candidates: KoTagSuggestion[], source: KoTagMatch['source']): Promise<KoTagMatch[]> {
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
        return { ...candidate, count: tag.count, type: tag.type, source }
    })
}

/** 내장 용어집에서 바로 찾는다 (네트워크 없음). */
export function glossaryMatches(term: string, limit: number): Promise<KoTagMatch[]> {
    return withIndexInfo(searchKoGlossary(term, limit), 'glossary')
}

/** AI에게 물어본 결과. 키가 없거나 꺼져 있으면 빈 배열, 실패해도 빈 배열 (자동완성을 막지 않는다). */
export async function aiMatches(term: string, signal?: AbortSignal): Promise<KoTagMatch[]> {
    if (!useSettingsStore.getState().koTagAiSuggestEnabled) return []
    const config = currentAiConfig()
    const key = normalizeKo(term)
    if (!config || key.length < 2) return []
    const cached = loadCache().get(key)
    if (cached) return withIndexInfo(cached, 'ai')
    try {
        const tags = await suggestTagsForTerm(term, config, { signal })
        const matches = await withIndexInfo(tags, 'ai')
        // 색인에 있는 것만 기억한다. 하나도 없었다는 사실도 기억해서 같은 말로 다시 묻지 않는다.
        remember(key, matches.map(({ tag, ko }) => ({ tag, ko })))
        return matches
    } catch {
        return []
    }
}
