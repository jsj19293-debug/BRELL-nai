// 한글 → 태그 찾기 검사: 내장 용어집이 태그 색인과 맞는지, 검색 순위, AI 응답 해석, 제공사별 요청 모양.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { KO_TAG_GLOSSARY } from '../src/lib/ko-tag-glossary.ts'
import {
    extractJson, hasHangul, keepKnownTags, koNameOfTag, mergeSuggestions, normalizeKo,
    normalizeTagLabel, readTagList, searchKoGlossary,
} from '../src/lib/ko-tags.ts'
import {
    AI_MODELS, AiError, DEFAULT_AI_MODEL, aiErrorCode, buildAiRequest, generatePromptFromText,
    parseGeneratedPrompt, readAiText, requestAiText, suggestTagsForTerm,
} from '../src/services/ai-tag-service.ts'

// --- 용어집의 모든 태그는 앱의 단부루 색인에 그 표기 그대로 있어야 한다 ---
const index = JSON.parse(await readFile(new URL('../src/assets/tags.json', import.meta.url), 'utf8'))
const labels = new Set(index.map(tag => tag.label))
const seenTags = new Set()
for (const [tag, names] of KO_TAG_GLOSSARY) {
    assert.ok(labels.has(tag), `색인에 없는 태그: ${tag}`)
    assert.ok(!seenTags.has(tag), `용어집 중복 태그: ${tag}`)
    seenTags.add(tag)
    assert.ok(names.length > 0 && names.every(name => typeof name === 'string' && name.trim() === name && name), `이름 형식: ${tag}`)
    assert.ok(hasHangul(names[0]), `표시 이름은 한글이어야 한다: ${tag}`)
}
assert.ok(KO_TAG_GLOSSARY.length >= 400)

// --- 한글 판별·정규화 ---
assert.equal(hasHangul('긴 머리'), true)
assert.equal(hasHangul('long hair'), false)
assert.equal(hasHangul('ㅋㅋ'), true)
assert.equal(normalizeKo(' 긴  머리 '), '긴머리')
assert.equal(normalizeTagLabel(' Long_Hair '), 'long hair')

// --- 용어집 검색: 같은 이름 → 시작 → 포함 ---
const tagsOf = query => searchKoGlossary(query).map(item => item.tag)
assert.equal(tagsOf('긴머리')[0], 'long hair', '띄어쓰기 없이 쳐도 찾는다')
assert.equal(tagsOf('긴 머리')[0], 'long hair')
assert.deepEqual(searchKoGlossary('벚꽃')[0], { tag: 'cherry blossoms', ko: '벚꽃' })
assert.equal(tagsOf('교복')[0], 'school uniform')
assert.equal(tagsOf('금발')[0], 'blonde hair')
assert.ok(tagsOf('머리').includes('long hair'), '부분 일치로도 찾는다')
assert.ok(tagsOf('고양이').slice(0, 3).includes('cat'))
assert.ok(tagsOf('고양이').includes('cat ears'))
assert.equal(tagsOf('고양이')[0], 'cat', '정확히 같은 이름이 "고양이 귀"보다 먼저')
assert.equal(tagsOf('비')[0], 'rain', '정확히 같은 이름이 먼저')
assert.ok(tagsOf('비').includes('bubble'), '그 글자로 시작하는 이름(비눗방울)은 찾는다')
assert.ok(!searchKoGlossary('비', 100).some(item => item.tag === 'butterfly'), '한 글자는 "들어간 이름"(나비)까지 넓히지 않는다')
assert.deepEqual(tagsOf('long'), [], '영어 검색어는 일반 자동완성이 맡는다')
assert.deepEqual(tagsOf(''), [])
assert.equal(searchKoGlossary('머리', 3).length, 3)
assert.equal(koNameOfTag('long hair'), '긴 머리')
assert.equal(koNameOfTag('Long_Hair'), '긴 머리')
assert.equal(koNameOfTag('definitely not a tag'), null)

// --- AI 응답 해석 ---
assert.deepEqual(extractJson('{"tags":[{"tag":"rain","ko":"비"}]}'), { tags: [{ tag: 'rain', ko: '비' }] })
assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 })
assert.deepEqual(extractJson('Here you go:\n{"a":"x } y","b":[1,2]}\nHope it helps'), { a: 'x } y', b: [1, 2] })
assert.deepEqual(extractJson('[1, 2]'), [1, 2])
assert.equal(extractJson('no json here'), null)
assert.equal(extractJson('{broken'), null)

assert.deepEqual(readTagList({ tags: [{ tag: 'Long_Hair', ko: ' 긴 머리 ' }, { tag: 'long hair', ko: '중복' }, { tag: '' }, { nope: 1 }, 'smile', 42] }), [
    { tag: 'long hair', ko: '긴 머리' },
    { tag: 'smile', ko: '' },
])
assert.deepEqual(readTagList([{ tag: 'a' }, { tag: 'b' }, { tag: 'c' }], 2).map(item => item.tag), ['a', 'b'])
assert.deepEqual(readTagList(null), [])
assert.deepEqual(readTagList('text'), [])

// 색인에 있는 태그만 남기고, 색인의 표기를 쓰고, 빈 뜻은 용어집으로 채운다.
const known = new Map([['long hair', 'long hair'], ['rain', 'rain'], ['hatsune miku', 'hatsune miku']])
assert.deepEqual(
    keepKnownTags([{ tag: 'long_hair', ko: '' }, { tag: 'made up tag', ko: '지어낸 태그' }, { tag: 'Hatsune Miku', ko: '하츠네 미쿠' }, { tag: 'long hair', ko: '또' }], known),
    [{ tag: 'long hair', ko: '긴 머리' }, { tag: 'hatsune miku', ko: '하츠네 미쿠' }],
)
assert.deepEqual(
    mergeSuggestions([{ tag: 'rain', ko: '비' }], [{ tag: 'Rain', ko: '빗줄기' }, { tag: 'umbrella', ko: '우산' }, { tag: 'cloud', ko: '구름' }], 2),
    [{ tag: 'rain', ko: '비' }, { tag: 'umbrella', ko: '우산' }],
)

assert.deepEqual(parseGeneratedPrompt('{"tags":[{"tag":"1girl","ko":"소녀 1명"}],"natural":" A girl. "}'), { tags: [{ tag: '1girl', ko: '소녀 1명' }], natural: 'A girl.' })
// JSON이 아니면 이전처럼 쉼표로 나눈 태그로 읽는다.
assert.deepEqual(parseGeneratedPrompt('1girl, long_hair,\n"smile"').tags.map(item => item.tag), ['1girl', 'long hair', 'smile'])

// --- 제공사별 요청 모양 ---
const prompt = { system: 'SYS', user: '카페에서 커피를 마시는 소녀' }
{
    const { url, init } = buildAiRequest({ provider: 'claude', apiKey: ' sk-ant-x ', model: '' }, prompt)
    assert.equal(url, 'https://api.anthropic.com/v1/messages')
    assert.equal(init.headers['x-api-key'], 'sk-ant-x')
    assert.equal(init.headers['anthropic-version'], '2023-06-01')
    assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true')
    const body = JSON.parse(init.body)
    assert.equal(body.model, DEFAULT_AI_MODEL.claude)
    assert.equal(body.system, 'SYS')
    assert.deepEqual(body.messages, [{ role: 'user', content: prompt.user }])
    assert.ok(body.max_tokens > 0)
}
{
    const { url, init } = buildAiRequest({ provider: 'openai', apiKey: 'sk-x', model: 'my-model' }, prompt)
    assert.equal(url, 'https://api.openai.com/v1/chat/completions')
    assert.equal(init.headers.authorization, 'Bearer sk-x')
    const body = JSON.parse(init.body)
    assert.equal(body.model, 'my-model')
    assert.deepEqual(body.messages.map(message => message.role), ['system', 'user'])
    assert.deepEqual(body.response_format, { type: 'json_object' })
    assert.equal('temperature' in body, false, '추론 모델이 거절하는 옵션은 보내지 않는다')
    assert.equal('max_tokens' in body, false)
}
{
    const { url, init } = buildAiRequest({ provider: 'gemini', apiKey: 'AIza x', model: 'gemini-2.5-flash' }, prompt)
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIza%20x')
    const body = JSON.parse(init.body)
    assert.equal(body.systemInstruction.parts[0].text, 'SYS')
    assert.equal(body.contents[0].parts[0].text, prompt.user)
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
}
for (const provider of ['gemini', 'claude', 'openai']) {
    assert.ok(AI_MODELS[provider].some(model => model.id === DEFAULT_AI_MODEL[provider]), `${provider} 기본 모델이 목록에 있다`)
}

// --- 제공사별 응답 읽기 ---
assert.deepEqual(readAiText('claude', { content: [{ type: 'text', text: '{"a":' }, { type: 'tool_use' }, { type: 'text', text: '1}' }], usage: { input_tokens: 10, output_tokens: 5 } }),
    { text: '{"a":1}', usage: { promptTokens: 10, outputTokens: 5, totalTokens: 15 } })
assert.deepEqual(readAiText('openai', { choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } }),
    { text: 'hi', usage: { promptTokens: 3, outputTokens: 4, totalTokens: 7 } })
assert.deepEqual(readAiText('gemini', { candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }), { text: 'ab', usage: null })
assert.deepEqual(readAiText('claude', {}), { text: '', usage: null })

assert.equal(aiErrorCode(401), 'AUTH')
assert.equal(aiErrorCode(400, 'Your credit balance is too low'), 'CREDIT')
assert.equal(aiErrorCode(429, 'You exceeded your current quota'), 'CREDIT')
assert.equal(aiErrorCode(429), 'RATE')
assert.equal(aiErrorCode(404, 'model: foo'), 'MODEL')
assert.equal(aiErrorCode(400, 'The model `x` does not exist'), 'MODEL')
assert.equal(aiErrorCode(529), 'SERVER')
assert.equal(aiErrorCode(400), 'BAD_REQUEST')

// --- 가짜 fetch로 끝까지 ---
const reply = (body, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
{
    const calls = []
    const fetcher = async (url, init) => { calls.push({ url, init }); return reply({ content: [{ type: 'text', text: '{"tags":[{"tag":"cherry_blossoms","ko":"벚꽃"},{"tag":"petals","ko":"꽃잎"}]}' }] })() }
    const tags = await suggestTagsForTerm(' 벚꽃 ', { provider: 'claude', apiKey: 'k', model: '' }, { fetcher })
    assert.deepEqual(tags, [{ tag: 'cherry blossoms', ko: '벚꽃' }, { tag: 'petals', ko: '꽃잎' }])
    assert.equal(JSON.parse(calls[0].init.body).messages[0].content, '벚꽃')
    assert.ok(calls[0].init.signal instanceof AbortSignal)
}
{
    const generated = await generatePromptFromText('카페 소녀', { provider: 'openai', apiKey: 'k', model: '' }, {
        fetcher: reply({ choices: [{ message: { content: '{"tags":[{"tag":"1girl","ko":"소녀 1명"},{"tag":"cafe","ko":"카페"}],"natural":"A girl in a cafe."}' } }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }),
    })
    assert.deepEqual(generated.tags.map(item => item.tag), ['1girl', 'cafe'])
    assert.equal(generated.natural, 'A girl in a cafe.')
    assert.equal(generated.usage.totalTokens, 3)
}
const failure = async (run) => { try { await run(); return null } catch (error) { return error } }
{
    const noKey = await failure(() => requestAiText({ provider: 'claude', apiKey: '  ', model: '' }, prompt, { fetcher: reply({}) }))
    assert.ok(noKey instanceof AiError)
    assert.equal(noKey.code, 'NO_KEY')
    const auth = await failure(() => requestAiText({ provider: 'claude', apiKey: 'k', model: '' }, prompt, { fetcher: reply({ error: { message: 'invalid x-api-key' } }, 401) }))
    assert.equal(auth.code, 'AUTH')
    assert.equal(auth.status, 401)
    assert.equal(auth.detail, 'invalid x-api-key')
    const empty = await failure(() => requestAiText({ provider: 'openai', apiKey: 'k', model: '' }, prompt, { fetcher: reply({ choices: [{ message: { content: '  ' } }] }) }))
    assert.equal(empty.code, 'EMPTY')
    const network = await failure(() => requestAiText({ provider: 'gemini', apiKey: 'k', model: '' }, prompt, { fetcher: async () => { throw new TypeError('Failed to fetch') } }))
    assert.equal(network.code, 'NETWORK')
    const timeout = await failure(() => requestAiText({ provider: 'gemini', apiKey: 'k', model: '' }, prompt, {
        timeoutMs: 20,
        fetcher: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    }))
    assert.equal(timeout.code, 'TIMEOUT')
}

console.log(`Korean tag checks passed: ${KO_TAG_GLOSSARY.length} glossary tags in the index, search ranking, AI parsing, provider requests.`)
