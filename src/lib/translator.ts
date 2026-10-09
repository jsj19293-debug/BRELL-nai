/**
 * 통합 프롬프트 번역기: 한국어 → 영어 · 중국어 · 일본어.
 * 엔진은 둘이다.
 *  - DeepL (API 키 필요, 무료 요금제 월 50만 자): 긴 글도 품질이 좋다.
 *  - MyMemory (키 없음): 짧은 글만. 요청 하나가 500바이트까지라 문장 단위로 잘라 보낸다.
 * 네트워크 호출은 밖에서 주입받아서 이 파일은 그대로 검사할 수 있다.
 */
import { cleanTranslation } from './ko-translate.ts'

export type TranslateTarget = 'en' | 'zh' | 'ja'
export type TranslateEngine = 'deepl' | 'free'

export const TRANSLATE_TARGETS: TranslateTarget[] = ['en', 'zh', 'ja']
export const TRANSLATE_TARGET_LABELS: Record<TranslateTarget, string> = { en: '영어', zh: '중국어(간체)', ja: '일본어' }
/** 번역기에 넣을 수 있는 글 길이 (세계관 한도와 같다) */
export const TRANSLATE_MAX_CHARS = 10_000
/** 무료 엔진으로 한 번에 번역할 수 있는 길이: 하루 사용량이 작아서 짧게 막아 둔다. */
export const FREE_ENGINE_MAX_CHARS = 1_000
/** MyMemory는 요청 하나가 UTF-8 500바이트까지 */
export const FREE_ENGINE_CHUNK_BYTES = 450

export const DEEPL_TARGET: Record<TranslateTarget, string> = { en: 'EN-US', zh: 'ZH-HANS', ja: 'JA' }
export const FREE_TARGET: Record<TranslateTarget, string> = { en: 'en', zh: 'zh-CN', ja: 'ja' }

export type TranslateErrorCode = 'NO_KEY' | 'BAD_KEY' | 'QUOTA' | 'TOO_LONG' | 'NETWORK' | 'EMPTY' | 'FAILED'

export class TranslateError extends Error {
    code: TranslateErrorCode
    constructor(code: TranslateErrorCode, message: string = code) {
        super(message)
        this.name = 'TranslateError'
        this.code = code
    }
}

export interface TranslateTransport {
    /** DeepL: 여러 덩어리를 한 번에 보내고 응답 JSON 문자열을 받는다. 실패하면 "HTTP_403" 같은 오류를 던진다. */
    deepl: (apiKey: string, texts: string[], target: string) => Promise<string>
    /** MyMemory: 한 덩어리를 보내고 응답 JSON 문자열을 받는다. */
    free: (text: string, target: string) => Promise<string>
}

const utf8Length = (text: string) => new TextEncoder().encode(text).length

/** DeepL 무료 키는 ":fx"로 끝난다 (서버 주소가 다르다). */
export function isDeeplFreeKey(apiKey: string): boolean {
    return apiKey.trim().endsWith(':fx')
}

export function pickEngine(deeplApiKey: string): TranslateEngine {
    return deeplApiKey.trim() ? 'deepl' : 'free'
}

/**
 * 글을 번역 요청 단위로 나눈다. 줄바꿈은 그대로 살리고(빈 줄 포함), 한 줄이 한도를 넘으면
 * 문장 끝(. ! ? 。 등)에서, 그래도 길면 글자 단위로 자른다.
 * 돌려주는 조각을 그대로 이어 붙이면 원문이 된다.
 */
export function splitForTranslation(text: string, maxBytes: number): string[] {
    const pieces: string[] = []
    const pushLong = (segment: string) => {
        // 문장 단위로 먼저 모으고, 문장 하나가 한도를 넘으면 글자 단위로 자른다.
        const sentences = segment.match(/[^.!?。！？…]+[.!?。！？…]*\s*/g) || [segment]
        let current = ''
        const flush = () => {
            if (current) pieces.push(current)
            current = ''
        }
        for (const sentence of sentences) {
            if (utf8Length(current + sentence) <= maxBytes) {
                current += sentence
                continue
            }
            flush()
            if (utf8Length(sentence) <= maxBytes) {
                current = sentence
                continue
            }
            for (const char of sentence) {
                if (utf8Length(current + char) > maxBytes) flush()
                current += char
            }
        }
        flush()
    }
    // 줄바꿈을 조각으로 남겨서 다시 붙일 때 문단 모양이 유지된다.
    for (const part of text.split(/(\n+)/)) {
        if (!part) continue
        if (/^\n+$/.test(part) || utf8Length(part) <= maxBytes) pieces.push(part)
        else pushLong(part)
    }
    return pieces
}

const isBlank = (piece: string) => !piece.trim()

export function readDeeplResponse(body: string): string[] {
    let data: { translations?: Array<{ text?: unknown }> }
    try {
        data = JSON.parse(body)
    } catch {
        throw new TranslateError('FAILED', 'INVALID_RESPONSE')
    }
    if (!Array.isArray(data?.translations)) throw new TranslateError('FAILED', 'INVALID_RESPONSE')
    return data.translations.map(item => (typeof item?.text === 'string' ? item.text : ''))
}

export function readFreeResponse(source: string, body: string): string {
    let data: { responseStatus?: unknown; responseData?: { translatedText?: unknown }; responseDetails?: unknown }
    try {
        data = JSON.parse(body)
    } catch {
        throw new TranslateError('FAILED', 'INVALID_RESPONSE')
    }
    const text = typeof data?.responseData?.translatedText === 'string' ? data.responseData.translatedText : ''
    if (Number(data?.responseStatus) === 429 || /MYMEMORY WARNING|USED ALL AVAILABLE/i.test(`${text} ${String(data?.responseDetails ?? '')}`)) {
        throw new TranslateError('QUOTA')
    }
    if (Number(data?.responseStatus) !== 200) throw new TranslateError('FAILED', `STATUS_${String(data?.responseStatus)}`)
    // 긴 글에서는 대소문자와 마침표를 건드리지 않는다 (ko-translate의 다듬기는 짧은 프롬프트 문구용).
    const cleaned = text.replace(/[ \t]+/g, ' ').trim()
    if (!cleaned || cleaned === source.trim()) throw new TranslateError('EMPTY')
    return cleaned
}

function toTranslateError(error: unknown): TranslateError {
    if (error instanceof TranslateError) return error
    const message = String((error as { message?: unknown })?.message ?? error)
    if (/HTTP_(401|403)/.test(message)) return new TranslateError('BAD_KEY', message)
    if (/HTTP_(429|456)/.test(message)) return new TranslateError('QUOTA', message)
    if (/HTTP_413/.test(message)) return new TranslateError('TOO_LONG', message)
    if (/NETWORK_ERROR|Failed to fetch|timed? ?out/i.test(message)) return new TranslateError('NETWORK', message)
    return new TranslateError('FAILED', message)
}

export interface TranslateOptions {
    engine: TranslateEngine
    deeplApiKey?: string
    transport: TranslateTransport
}

/** 한국어 글을 한 언어로 옮긴다. 문단(줄바꿈) 모양은 그대로 둔다. */
export async function translateText(text: string, target: TranslateTarget, options: TranslateOptions): Promise<string> {
    const source = text.replace(/\r\n?/g, '\n')
    if (!source.trim()) return ''
    const length = [...source].length
    if (length > TRANSLATE_MAX_CHARS) throw new TranslateError('TOO_LONG')

    try {
        if (options.engine === 'deepl') {
            const apiKey = (options.deeplApiKey || '').trim()
            if (!apiKey) throw new TranslateError('NO_KEY')
            // 줄 단위로 보내면 문단 모양이 그대로 돌아온다. 빈 줄은 보내지 않는다.
            const pieces = source.split(/(\n+)/).filter(piece => piece !== '')
            const toSend = pieces.filter(piece => !isBlank(piece))
            const translated = readDeeplResponse(await options.transport.deepl(apiKey, toSend, DEEPL_TARGET[target]))
            if (translated.length !== toSend.length) throw new TranslateError('FAILED', 'COUNT_MISMATCH')
            let index = 0
            const result = pieces.map(piece => (isBlank(piece) ? piece : translated[index++])).join('')
            if (!result.trim()) throw new TranslateError('EMPTY')
            return result
        }

        if (length > FREE_ENGINE_MAX_CHARS) throw new TranslateError('TOO_LONG')
        const pieces = splitForTranslation(source, FREE_ENGINE_CHUNK_BYTES)
        const result: string[] = []
        // 무료 서비스에 한꺼번에 몰아 보내지 않도록 차례로 보낸다.
        for (const piece of pieces) {
            if (isBlank(piece)) {
                result.push(piece)
                continue
            }
            const trailing = piece.match(/\s*$/)?.[0] ?? ''
            result.push(readFreeResponse(piece, await options.transport.free(piece.trim(), FREE_TARGET[target])) + trailing)
        }
        return result.join('')
    } catch (error) {
        throw toTranslateError(error)
    }
}

/** 프롬프트 칸의 짧은 문구 → 영어 (자동완성의 "영어 자연어로 치환"). 실패하면 빈 문자열. */
export async function translatePhraseToEnglish(phrase: string, options: TranslateOptions): Promise<string> {
    try {
        return cleanTranslation(phrase, await translateText(phrase, 'en', options))
    } catch {
        return ''
    }
}

export function describeTranslateError(error: unknown): string {
    const code = error instanceof TranslateError ? error.code : 'FAILED'
    switch (code) {
        case 'NO_KEY': return 'DeepL API 키가 없습니다.'
        case 'BAD_KEY': return 'DeepL API 키가 맞지 않습니다. 키를 다시 확인하세요.'
        case 'QUOTA': return '번역 사용량 한도를 다 썼습니다. 잠시 뒤(무료 번역은 내일) 다시 시도하세요.'
        case 'TOO_LONG': return `글이 너무 깁니다. 무료 번역은 ${FREE_ENGINE_MAX_CHARS.toLocaleString()}자까지, DeepL 키를 넣으면 ${TRANSLATE_MAX_CHARS.toLocaleString()}자까지 됩니다.`
        case 'NETWORK': return '번역 서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.'
        case 'EMPTY': return '번역 결과가 비어 있습니다.'
        default: return '번역에 실패했습니다.'
    }
}
