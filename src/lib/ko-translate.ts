/**
 * 프롬프트 칸의 한글 문구 → 영어 자연어. API 키 없이 쓰는 무료 번역(MyMemory)을 부른다.
 * 태그 추천(내장 사전)과 달리 네트워크가 필요하고, 친 문구가 번역 서비스로 전송된다.
 */

export type KoTranslator = (text: string) => Promise<string>

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/
export const KO_TRANSLATE_MAX_LENGTH = 300
const CACHE_LIMIT = 200
const cache = new Map<string, string>()

/** 번역을 물어볼 만한 문구인지: 한글이 두 글자 이상 들어 있고 너무 길지 않다. */
export function shouldTranslate(term: string): boolean {
    const text = term.trim()
    if (text.length < 2 || text.length > KO_TRANSLATE_MAX_LENGTH) return false
    return (text.match(new RegExp(HANGUL.source, 'g')) || []).length >= 2
}

/** 번역 결과를 프롬프트에 넣기 좋게 다듬는다. 쓸 수 없는 결과면 빈 문자열. */
export function cleanTranslation(source: string, translated: unknown): string {
    if (typeof translated !== 'string') return ''
    let text = translated.replace(/\s+/g, ' ').trim()
    // 서비스가 한도 초과 등을 번역문 자리에 적어 보내는 경우
    if (!text || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID (LANGUAGE|EMAIL)|PLEASE SELECT/i.test(text)) return ''
    // 번역되지 않고 한글이 그대로 돌아온 경우
    if (HANGUL.test(text) || text.toLocaleLowerCase() === source.trim().toLocaleLowerCase()) return ''
    text = text.replace(/[.。]+$/, '').trim()
    // 프롬프트는 쉼표로 나누므로 번역문 안의 쉼표 뒤 공백을 고르게 한다.
    text = text.replace(/\s*,\s*/g, ', ')
    // 문장 첫 글자만 대문자인 평범한 문구는 소문자로 (고유명사가 섞인 문장은 그대로 둔다).
    if (text.slice(1) === text.slice(1).toLowerCase()) text = text.toLowerCase()
    return text
}

/** MyMemory 응답(JSON 문자열)에서 번역문을 꺼낸다. */
export function readMyMemoryResponse(source: string, body: string): string {
    let data: { responseStatus?: unknown; responseData?: { translatedText?: unknown } }
    try {
        data = JSON.parse(body)
    } catch {
        return ''
    }
    if (Number(data?.responseStatus) !== 200) return ''
    return cleanTranslation(source, data?.responseData?.translatedText)
}

/**
 * 한글 문구를 영어로 옮긴다. 실패하거나 쓸 수 없는 결과면 빈 문자열을 돌려준다 (입력을 막지 않는다).
 * 같은 문구는 이번 실행 동안 기억해서 다시 묻지 않는다.
 */
export async function translateKoToEn(term: string, request: KoTranslator): Promise<string> {
    const text = term.trim()
    if (!shouldTranslate(text)) return ''
    const cached = cache.get(text)
    if (cached !== undefined) return cached
    let translated = ''
    try {
        translated = readMyMemoryResponse(text, await request(text))
    } catch {
        return ''
    }
    // 실패(빈 결과)는 기억하지 않는다: 일시적인 오류일 수 있다.
    if (translated) {
        cache.set(text, translated)
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
    }
    return translated
}

export function clearKoTranslateCache(): void {
    cache.clear()
}
