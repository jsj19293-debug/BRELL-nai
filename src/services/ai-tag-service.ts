/**
 * 한글(또는 다른 언어) 설명을 단부루 태그로 바꿔 주는 AI 연결.
 * Gemini · Claude · GPT를 같은 모양으로 부르고, 응답은 JSON으로 받아 `src/lib/ko-tags.ts`가 정리한다.
 * 요청·응답 변환(buildAiRequest, readAiText)은 네트워크 없이 검사할 수 있게 분리했다.
 */
import { extractJson, readTagList, type KoTagSuggestion } from '../lib/ko-tags.ts'

export type AiProvider = 'gemini' | 'claude' | 'openai'

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
    gemini: 'Gemini',
    claude: 'Claude',
    openai: 'GPT',
}

/** 고를 수 있는 모델. 목록에 없는 모델은 설정에서 직접 입력한다 (모델 이름은 제공사가 자주 바꾼다). */
export const AI_MODELS: Record<AiProvider, { id: string; name: string }[]> = {
    gemini: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)' },
        { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)' },
    ],
    claude: [
        { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
        { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
        { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
    ],
    openai: [
        { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
        { id: 'gpt-5.4', name: 'GPT-5.4' },
        { id: 'gpt-5.5', name: 'GPT-5.5' },
    ],
}

export const DEFAULT_AI_MODEL: Record<AiProvider, string> = {
    gemini: 'gemini-2.5-flash',
    claude: 'claude-haiku-4-5-20251001',
    openai: 'gpt-5.4-mini',
}

export interface AiConfig {
    provider: AiProvider
    apiKey: string
    model: string
}

export interface AiUsage {
    promptTokens: number
    outputTokens: number
    totalTokens: number
}

export type AiErrorCode = 'NO_KEY' | 'AUTH' | 'CREDIT' | 'RATE' | 'MODEL' | 'BAD_REQUEST' | 'SERVER' | 'NETWORK' | 'TIMEOUT' | 'EMPTY'

export class AiError extends Error {
    code: AiErrorCode
    status: number | null
    detail: string
    constructor(code: AiErrorCode, status: number | null = null, detail = '') {
        super(detail ? `${code}: ${detail}` : code)
        this.name = 'AiError'
        this.code = code
        this.status = status
        this.detail = detail
    }
}

export function aiErrorCode(status: number, message = ''): AiErrorCode {
    if (status === 401 || status === 403) return 'AUTH'
    if (status === 402 || /credit balance|billing|insufficient_quota|exceeded your current quota/i.test(message)) return 'CREDIT'
    if (status === 429) return 'RATE'
    if (status === 404 || /model.*(not found|does not exist|not supported)|unknown model/i.test(message)) return 'MODEL'
    if (status >= 500) return 'SERVER'
    return 'BAD_REQUEST'
}

export interface AiPrompt {
    system: string
    user: string
    maxTokens?: number
}

/** 제공사별 HTTP 요청. 키는 헤더(또는 Gemini의 쿼리)로만 보낸다. */
export function buildAiRequest(config: AiConfig, prompt: AiPrompt): { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } } {
    const model = config.model.trim() || DEFAULT_AI_MODEL[config.provider]
    const key = config.apiKey.trim()
    const maxTokens = prompt.maxTokens ?? 1500
    if (config.provider === 'claude') {
        return {
            url: 'https://api.anthropic.com/v1/messages',
            init: {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                    // 데스크톱 앱의 웹뷰에서 직접 부른다. 키는 사용자의 PC에만 저장된다.
                    'anthropic-dangerous-direct-browser-access': 'true',
                },
                body: JSON.stringify({
                    model,
                    max_tokens: maxTokens,
                    system: prompt.system,
                    messages: [{ role: 'user', content: prompt.user }],
                }),
            },
        }
    }
    if (config.provider === 'openai') {
        return {
            url: 'https://api.openai.com/v1/chat/completions',
            init: {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
                // 모델마다 받는 옵션이 달라서(추론 모델은 temperature·max_tokens를 거절한다) 공통 옵션만 보낸다.
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: prompt.system },
                        { role: 'user', content: prompt.user },
                    ],
                    response_format: { type: 'json_object' },
                }),
            },
        }
    }
    return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        init: {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: prompt.system }] },
                contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
                generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
            }),
        },
    }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** 제공사 응답에서 글과 토큰 사용량을 꺼낸다. */
export function readAiText(provider: AiProvider, data: any): { text: string; usage: AiUsage | null } {
    if (provider === 'claude') {
        const text = Array.isArray(data?.content)
            ? data.content.filter((part: any) => part?.type === 'text' && typeof part.text === 'string').map((part: any) => part.text).join('')
            : ''
        const input = Number(data?.usage?.input_tokens) || 0
        const output = Number(data?.usage?.output_tokens) || 0
        return { text, usage: data?.usage ? { promptTokens: input, outputTokens: output, totalTokens: input + output } : null }
    }
    if (provider === 'openai') {
        const content = data?.choices?.[0]?.message?.content
        const input = Number(data?.usage?.prompt_tokens) || 0
        const output = Number(data?.usage?.completion_tokens) || 0
        return {
            text: typeof content === 'string' ? content : '',
            usage: data?.usage ? { promptTokens: input, outputTokens: output, totalTokens: Number(data.usage.total_tokens) || input + output } : null,
        }
    }
    const parts = data?.candidates?.[0]?.content?.parts
    const text = Array.isArray(parts) ? parts.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).join('') : ''
    const meta = data?.usageMetadata
    return {
        text,
        usage: meta
            ? {
                promptTokens: Number(meta.promptTokenCount) || 0,
                outputTokens: Number(meta.candidatesTokenCount) || 0,
                totalTokens: Number(meta.totalTokenCount) || 0,
            }
            : null,
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

export async function requestAiText(
    config: AiConfig,
    prompt: AiPrompt,
    options: { fetcher?: Fetcher; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ text: string; usage: AiUsage | null }> {
    if (!config.apiKey.trim()) throw new AiError('NO_KEY')
    const { url, init } = buildAiRequest(config, prompt)
    const fetcher = options.fetcher ?? ((target, request) => fetch(target, request))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000)
    const forward = () => controller.abort()
    options.signal?.addEventListener('abort', forward)
    let response: Response
    try {
        response = await fetcher(url, { ...init, signal: controller.signal })
    } catch (error) {
        const aborted = (error as { name?: string })?.name === 'AbortError'
        throw new AiError(aborted ? 'TIMEOUT' : 'NETWORK', null, aborted ? '' : String((error as Error)?.message || error).slice(0, 200))
    } finally {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', forward)
    }
    if (!response.ok) {
        let message = ''
        try {
            const body = await response.json()
            message = typeof body?.error?.message === 'string' ? body.error.message : typeof body?.error === 'string' ? body.error : ''
        } catch {
            /* 본문이 JSON이 아니면 상태 코드만으로 판단한다 */
        }
        throw new AiError(aiErrorCode(response.status, message), response.status, message.slice(0, 300))
    }
    let data: unknown
    try {
        data = await response.json()
    } catch {
        throw new AiError('SERVER', response.status)
    }
    const result = readAiText(config.provider, data)
    if (!result.text.trim()) throw new AiError('EMPTY', response.status)
    return result
}

const TAG_RULES = `Tag rules:
- Use only tags that really exist on Danbooru. Never invent a tag.
- Lowercase English, words separated by spaces (write "long hair", not "long_hair").
- "ko" is a short Korean gloss of the tag (2-8 characters when possible).`

export const GENERATOR_SYSTEM_PROMPT = `You turn a scene description into a prompt for NovelAI anime image generation. The description may be in Korean or any other language.

Reply with one JSON object and nothing else:
{"tags":[{"tag":"1girl","ko":"소녀 1명"},{"tag":"long hair","ko":"긴 머리"}],"natural":"A girl with long hair ..."}

${TAG_RULES}
- Give 10 to 30 tags in this order: number of people (1girl, 2boys, solo ...), appearance, clothing and accessories, pose and expression, objects, background and place, composition and lighting.
- Describe only what was asked for. No quality tags (masterpiece, best quality, highres, absurdres ...), no artist names.
- "natural" is one or two plain English sentences describing the same scene, for models that read natural language.`

export const SUGGEST_SYSTEM_PROMPT = `Someone is writing a prompt for anime image generation and typed a Korean word or short phrase. Give the Danbooru tags that best express it.

Reply with one JSON object and nothing else:
{"tags":[{"tag":"cherry blossoms","ko":"벚꽃"}]}

${TAG_RULES}
- At most 8 tags, the most common and most literal match first.
- If the phrase names a character or a series, give its Danbooru tag.
- If nothing fits, reply {"tags":[]}.`

export interface GeneratedPrompt {
    tags: KoTagSuggestion[]
    natural: string
    usage: AiUsage | null
    raw: string
}

/** AI가 준 글에서 태그 목록과 자연어 문장을 읽는다. JSON이 아니면 쉼표로 나눈 태그로 본다. */
export function parseGeneratedPrompt(text: string): { tags: KoTagSuggestion[]; natural: string } {
    const parsed = extractJson(text)
    if (parsed && typeof parsed === 'object') {
        const natural = (parsed as { natural?: unknown }).natural
        return { tags: readTagList(parsed), natural: typeof natural === 'string' ? natural.trim() : '' }
    }
    return {
        tags: readTagList(text.split(',').map(part => part.replace(/["\n\r]/g, '').trim()).filter(Boolean)),
        natural: '',
    }
}

export async function generatePromptFromText(
    input: string,
    config: AiConfig,
    options: { fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<GeneratedPrompt> {
    const result = await requestAiText(config, { system: GENERATOR_SYSTEM_PROMPT, user: input.trim(), maxTokens: 2000 }, options)
    return { ...parseGeneratedPrompt(result.text), usage: result.usage, raw: result.text }
}

export async function suggestTagsForTerm(
    term: string,
    config: AiConfig,
    options: { fetcher?: Fetcher; signal?: AbortSignal } = {},
): Promise<KoTagSuggestion[]> {
    const result = await requestAiText(config, { system: SUGGEST_SYSTEM_PROMPT, user: term.trim(), maxTokens: 600 }, { ...options, timeoutMs: 20_000 })
    return readTagList(extractJson(result.text), 8)
}
