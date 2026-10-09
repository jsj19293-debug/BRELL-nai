/** 번역기의 실제 네트워크 호출(Tauri 명령)과, 지금 설정에 맞는 엔진 고르기. */
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '@/stores/settings-store'
import {
    pickEngine, translatePhraseToEnglish, translateText,
    type TranslateEngine, type TranslateOptions, type TranslateTarget, type TranslateTransport,
} from '@/lib/translator'

export const translateTransport: TranslateTransport = {
    deepl: (apiKey, texts, target) => invoke<string>('rell_translate_deepl', { apiKey, texts, target }),
    free: (text, target) => invoke<string>('rell_translate_free', { text, target }),
}

export function currentTranslateOptions(): TranslateOptions {
    const deeplApiKey = useSettingsStore.getState().deeplApiKey
    return { engine: pickEngine(deeplApiKey), deeplApiKey, transport: translateTransport }
}

export function currentTranslateEngine(): TranslateEngine {
    return pickEngine(useSettingsStore.getState().deeplApiKey)
}

/** 한국어 글을 한 언어로 옮긴다 (설정에 DeepL 키가 있으면 DeepL, 없으면 무료 번역). */
export function translateKorean(text: string, target: TranslateTarget): Promise<string> {
    return translateText(text, target, currentTranslateOptions())
}

const PHRASE_CACHE_LIMIT = 200
const phraseCache = new Map<string, string>()

/** 프롬프트 칸의 짧은 한글 문구 → 영어. 같은 문구는 이번 실행 동안 다시 묻지 않는다. 실패하면 빈 문자열. */
export async function translatePromptPhrase(phrase: string): Promise<string> {
    const options = currentTranslateOptions()
    const key = `${options.engine}\n${phrase.trim()}`
    const cached = phraseCache.get(key)
    if (cached !== undefined) return cached
    const translated = await translatePhraseToEnglish(phrase.trim(), options)
    if (translated) {
        phraseCache.set(key, translated)
        if (phraseCache.size > PHRASE_CACHE_LIMIT) phraseCache.delete(phraseCache.keys().next().value as string)
    }
    return translated
}
