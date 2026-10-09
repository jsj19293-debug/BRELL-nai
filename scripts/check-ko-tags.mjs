// 한글 → 태그 찾기 검사: 내장 용어집이 태그 색인과 맞는지, 검색 순위.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { KO_TAG_GLOSSARY } from '../src/lib/ko-tag-glossary.ts'
import {
    extractJson, hasHangul, keepKnownTags, koNameOfTag, mergeSuggestions, normalizeKo,
    normalizeTagLabel, readTagList, searchKoGlossary,
} from '../src/lib/ko-tags.ts'

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

console.log(`Korean tag checks passed: ${KO_TAG_GLOSSARY.length} glossary tags in the index, search ranking.`)
