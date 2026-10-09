// 프롬프트 관리(세계관 · 로어북 · 메모) 규칙 검사.
import assert from 'node:assert/strict'
import {
    IMAGES_MAX_PER_ITEM, LORE_CONTENT_MAX_CHARS, LORE_MAX_ENTRIES, WORLD_MAX_CHARS,
    addImages, canAddLore, clampChars, countChars, createProject, filterLore, formatLoreEntry, formatProject,
    isImagePath, normalizeLore, normalizeMemo, parseKeywords, totalLoreChars,
} from '../src/lib/prompt-notes.ts'

assert.equal(WORLD_MAX_CHARS, 10000)
assert.equal(LORE_CONTENT_MAX_CHARS, 500)
assert.equal(LORE_MAX_ENTRIES, 150)

// 글자 수: 한글 · 공백 · 줄바꿈 · 이모지 모두 1자
assert.equal(countChars(''), 0)
assert.equal(countChars('안녕하세요'), 5)
assert.equal(countChars('가 나\n다'), 5)
assert.equal(countChars('a😀b'), 3)
assert.equal(clampChars('가나다라마', 3), '가나다')
assert.equal(clampChars('가나', 3), '가나')
assert.equal(clampChars('a😀b😀', 2), 'a😀')        // 이모지를 반으로 자르지 않는다
assert.equal(countChars(clampChars('가'.repeat(10050), WORLD_MAX_CHARS)), 10000)

assert.deepEqual(parseKeywords(' 마법, 왕국 ,, 마법,Elf，elf\n용 '), ['마법', '왕국', 'Elf', '용'])
assert.deepEqual(parseKeywords(''), [])

// 이미지: 중복 제거, 최대 개수
assert.deepEqual(addImages(['C:\\a\\1.png'], ['c:/a/1.PNG', 'C:\\a\\2.png', ' ']), ['C:\\a\\1.png', 'C:\\a\\2.png'])
assert.equal(addImages([], Array.from({ length: 30 }, (_, i) => `C:\\a\\${i}.png`)).length, IMAGES_MAX_PER_ITEM)
assert.equal(isImagePath('C:\\a\\b.WEBP'), true)
assert.equal(isImagePath('C:\\a\\b.txt'), false)

const project = createProject('p1', '  내 세계  ', 100)
assert.deepEqual(project, { id: 'p1', name: '내 세계', world: '', worldImages: [], lore: [], memos: [], createdAt: 100, updatedAt: 100 })
assert.equal(createProject('p2', '   ', 1).name, '새 작품')
assert.equal(canAddLore(project), true)
assert.equal(canAddLore({ lore: Array.from({ length: 150 }, () => ({})) }), false)

const lore = normalizeLore({ id: 'l1', title: '제'.repeat(100), content: '내'.repeat(700), keywords: 'k'.repeat(300), images: Array.from({ length: 20 }, (_, i) => `${i}.png`), updatedAt: 1 })
assert.equal(countChars(lore.title), 60)
assert.equal(countChars(lore.content), 500)
assert.equal(countChars(lore.keywords), 200)
assert.equal(lore.images.length, IMAGES_MAX_PER_ITEM)
assert.equal(countChars(normalizeMemo({ id: 'm', title: '', content: '메'.repeat(6000), images: [], updatedAt: 1 }).content), 5000)

const entries = [
    { id: 'a', title: '엘프 왕국', content: '숲 속의 오래된 나라.', keywords: '엘프, 숲', images: [], updatedAt: 1 },
    { id: 'b', title: '마탑', content: '마법사들이 모이는 곳', keywords: 'Magic Tower', images: [], updatedAt: 2 },
]
assert.deepEqual(filterLore(entries, '').map(e => e.id), ['a', 'b'])
assert.deepEqual(filterLore(entries, '숲').map(e => e.id), ['a'])
assert.deepEqual(filterLore(entries, 'magic').map(e => e.id), ['b'])
assert.deepEqual(filterLore(entries, '없는말'), [])
assert.equal(totalLoreChars(entries), 12 + 11)
assert.equal(formatLoreEntry(entries[0]), '[엘프 왕국]\n키워드: 엘프, 숲\n숲 속의 오래된 나라.')
assert.equal(formatLoreEntry({ title: '', content: '내용만', keywords: '' }), '내용만')
assert.equal(
    formatProject({ name: '내 세계', world: ' 검과 마법의 대륙 ', lore: entries }),
    '# 내 세계\n\n## 세계관\n검과 마법의 대륙\n\n## 로어북\n[엘프 왕국]\n키워드: 엘프, 숲\n숲 속의 오래된 나라.\n\n[마탑]\n키워드: Magic Tower\n마법사들이 모이는 곳',
)
assert.equal(formatProject({ name: '빈 작품', world: '', lore: [] }), '# 빈 작품')

console.log('Prompt notes checks passed: limits, counting, keywords, images, search, copy text.')
