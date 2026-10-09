// 통합 번역기 검사: 글 나누기, 엔진 고르기, 응답 해석, 오류 분류.
import assert from 'node:assert/strict'
import {
    DEEPL_TARGET, FREE_ENGINE_CHUNK_BYTES, FREE_TARGET, TranslateError, describeTranslateError, isDeeplFreeKey, pickEngine,
    readDeeplResponse, readFreeResponse, splitForTranslation, translatePhraseToEnglish, translateText,
} from '../src/lib/translator.ts'

const bytes = text => new TextEncoder().encode(text).length

assert.equal(pickEngine(''), 'free')
assert.equal(pickEngine('  '), 'free')
assert.equal(pickEngine('abc:fx'), 'deepl')
assert.equal(isDeeplFreeKey(' abc:fx '), true)
assert.equal(isDeeplFreeKey('abc'), false)
assert.deepEqual([DEEPL_TARGET.en, DEEPL_TARGET.zh, DEEPL_TARGET.ja], ['EN-US', 'ZH-HANS', 'JA'])
assert.deepEqual([FREE_TARGET.en, FREE_TARGET.zh, FREE_TARGET.ja], ['en', 'zh-CN', 'ja'])

// --- 나누기: 이어 붙이면 원문, 조각마다 한도 이하, 줄바꿈 유지 ---
{
    const text = '첫 문단입니다. 두 번째 문장!\n\n둘째 문단은 조금 더 깁니다. ' + '긴 문장이 계속 이어집니다. '.repeat(40) + '\n끝.'
    const pieces = splitForTranslation(text, FREE_ENGINE_CHUNK_BYTES)
    assert.equal(pieces.join(''), text)
    assert.ok(pieces.every(piece => bytes(piece) <= FREE_ENGINE_CHUNK_BYTES))
    assert.ok(pieces.includes('\n\n'))
    assert.ok(pieces.length > 3)
    // 문장 중간에서 자르지 않는다 (문장 하나가 한도보다 짧을 때)
    assert.ok(pieces.filter(piece => piece.trim()).every(piece => /[.!?]\s*$/.test(piece)))
    // 마침표 없이 아주 긴 한 줄도 한도 안으로 자른다
    const long = '가'.repeat(1000)
    const cut = splitForTranslation(long, 450)
    assert.equal(cut.join(''), long)
    assert.ok(cut.every(piece => bytes(piece) <= 450))
    assert.deepEqual(splitForTranslation('짧은 글', 450), ['짧은 글'])
    assert.deepEqual(splitForTranslation('', 450), [])
}

// --- 응답 해석 ---
assert.deepEqual(readDeeplResponse('{"translations":[{"text":"Hello"},{"text":"World"}]}'), ['Hello', 'World'])
assert.throws(() => readDeeplResponse('<html>'), TranslateError)
assert.throws(() => readDeeplResponse('{"message":"x"}'), TranslateError)
assert.equal(readFreeResponse('안녕', '{"responseStatus":200,"responseData":{"translatedText":"Hello  there. "}}'), 'Hello there.')
assert.throws(() => readFreeResponse('안녕', '{"responseStatus":429,"responseData":{"translatedText":""}}'), error => error.code === 'QUOTA')
assert.throws(() => readFreeResponse('안녕', '{"responseStatus":200,"responseData":{"translatedText":"MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY"}}'), error => error.code === 'QUOTA')
assert.throws(() => readFreeResponse('안녕', '{"responseStatus":200,"responseData":{"translatedText":"안녕"}}'), error => error.code === 'EMPTY')
assert.throws(() => readFreeResponse('안녕', '{"responseStatus":403,"responseData":{"translatedText":"x"}}'), error => error.code === 'FAILED')

// --- DeepL: 줄 단위로 한 번에 보내고 문단 모양을 되살린다 ---
{
    const calls = []
    const transport = {
        deepl: async (apiKey, texts, target) => { calls.push({ apiKey, texts, target }); return JSON.stringify({ translations: texts.map(text => ({ text: `<${target}:${text}>` })) }) },
        free: async () => { throw new Error('should not be called') },
    }
    const result = await translateText('첫 줄\r\n\r\n둘째 줄\n  \n셋째', 'ja', { engine: 'deepl', deeplApiKey: ' key:fx ', transport })
    assert.equal(result, '<JA:첫 줄>\n\n<JA:둘째 줄>\n  \n<JA:셋째>')
    assert.deepEqual(calls, [{ apiKey: 'key:fx', texts: ['첫 줄', '둘째 줄', '셋째'], target: 'JA' }])
    assert.equal(await translateText('   ', 'en', { engine: 'deepl', deeplApiKey: 'k', transport }), '')
    assert.equal(calls.length, 1)
    await assert.rejects(translateText('글', 'en', { engine: 'deepl', deeplApiKey: '', transport }), error => error.code === 'NO_KEY')
    await assert.rejects(translateText('가'.repeat(10001), 'en', { engine: 'deepl', deeplApiKey: 'k', transport }), error => error.code === 'TOO_LONG')
    // 1만 자는 된다
    assert.ok((await translateText('가'.repeat(10000), 'zh', { engine: 'deepl', deeplApiKey: 'k', transport })).startsWith('<ZH-HANS:'))
    const failing = status => ({ ...transport, deepl: async () => { throw new Error(`HTTP_${status}`) } })
    await assert.rejects(translateText('글', 'en', { engine: 'deepl', deeplApiKey: 'k', transport: failing(403) }), error => error.code === 'BAD_KEY')
    await assert.rejects(translateText('글', 'en', { engine: 'deepl', deeplApiKey: 'k', transport: failing(456) }), error => error.code === 'QUOTA')
    await assert.rejects(translateText('글', 'en', { engine: 'deepl', deeplApiKey: 'k', transport: failing(500) }), error => error.code === 'FAILED')
    await assert.rejects(translateText('글', 'en', { engine: 'deepl', deeplApiKey: 'k', transport: { ...transport, deepl: async () => { throw new Error('NETWORK_ERROR: dns') } } }), error => error.code === 'NETWORK')
    await assert.rejects(translateText('글\n둘', 'en', { engine: 'deepl', deeplApiKey: 'k', transport: { ...transport, deepl: async () => '{"translations":[{"text":"one"}]}' } }), error => error.code === 'FAILED')
}

// --- 무료 엔진: 조각마다 차례로 보내고, 길이 제한을 지킨다 ---
{
    const calls = []
    const transport = {
        deepl: async () => { throw new Error('should not be called') },
        free: async (text, target) => { calls.push([text, target]); return JSON.stringify({ responseStatus: 200, responseData: { translatedText: `[${target}] ${text.length}` } }) },
    }
    const result = await translateText('첫 줄입니다.\n\n둘째 줄입니다.', 'zh', { engine: 'free', transport })
    assert.equal(result, '[zh-CN] 7\n\n[zh-CN] 8')
    assert.deepEqual(calls, [['첫 줄입니다.', 'zh-CN'], ['둘째 줄입니다.', 'zh-CN']])
    calls.length = 0
    const long = '문장입니다. '.repeat(120).trim()   // 약 840자
    const translated = await translateText(long, 'en', { engine: 'free', transport })
    assert.ok(calls.length >= 4)
    assert.ok(calls.every(([text]) => bytes(text) <= FREE_ENGINE_CHUNK_BYTES))
    assert.ok(translated.startsWith('[en] '))
    await assert.rejects(translateText('가'.repeat(1001), 'en', { engine: 'free', transport }), error => error.code === 'TOO_LONG')

    // 프롬프트 칸의 짧은 문구: 다듬어서(소문자, 마침표 제거) 돌려주고, 실패하면 빈 문자열
    const phrase = { deepl: async (_key, texts) => JSON.stringify({ translations: texts.map(() => ({ text: 'Beautiful night view.' })) }), free: async () => JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'Beautiful night view.' } }) }
    assert.equal(await translatePhraseToEnglish('아름다운 야경', { engine: 'free', transport: phrase }), 'beautiful night view')
    assert.equal(await translatePhraseToEnglish('아름다운 야경', { engine: 'deepl', deeplApiKey: 'k', transport: phrase }), 'beautiful night view')
    assert.equal(await translatePhraseToEnglish('아름다운 야경', { engine: 'deepl', deeplApiKey: '', transport: phrase }), '')
}

assert.match(describeTranslateError(new TranslateError('BAD_KEY')), /키/)
assert.match(describeTranslateError(new TranslateError('TOO_LONG')), /1,000자/)
assert.match(describeTranslateError(new Error('x')), /실패/)

console.log('Translator checks passed: splitting, engines, responses, errors.')
