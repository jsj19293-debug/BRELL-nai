/** 프롬프트 탭의 웹 분할 화면에서 쓰는 주소 처리 */
export interface WebQuickLink {
    name: string
    url: string
}

export const WEB_QUICK_LINKS: WebQuickLink[] = [
    { name: 'Danbooru', url: 'https://danbooru.donmai.us' },
    { name: 'NovelAI', url: 'https://novelai.net/image' },
    { name: '구글 번역', url: 'https://translate.google.co.kr/?sl=ko&tl=en&op=translate' },
    { name: 'DeepL', url: 'https://www.deepl.com/translator' },
    { name: 'Google', url: 'https://www.google.com' },
]

export const WEB_DEFAULT_URL = WEB_QUICK_LINKS[0].url

/**
 * 주소창에 넣은 글자를 열 수 있는 주소로 바꾼다.
 * 주소처럼 보이면 https:// 를 붙이고, 아니면 구글 검색으로 보낸다. http(s) 가 아닌 주소는 열지 않는다(null).
 */
export function normalizeWebAddress(input: string): string | null {
    const text = input.trim()
    if (!text) return null
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^\s/:]+:\d+(\/|$)/.test(text)) {
        if (!/^https?:\/\//i.test(text)) return null
        try { return new URL(text).toString() } catch { return null }
    }
    const looksLikeHost = !/\s/.test(text) && /^[^\s/]+\.[^\s/.]{2,}(:\d+)?(\/.*)?$/.test(text)
    if (looksLikeHost || /^localhost(:\d+)?(\/.*)?$/i.test(text)) {
        try { return new URL(`https://${text}`).toString() } catch { return null }
    }
    return `https://www.google.com/search?q=${encodeURIComponent(text)}`
}
