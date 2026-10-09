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

// --- 로어북 ↔ txt (메모장 양식) ---
{
    const { formatLoreTxt, loreTxtFileName, parseLoreTxt } = await import('../src/lib/prompt-notes.ts')
    const lore = [
        { title: '일반모드', keywords: '1, !일반모드', content: '일반모드 | 1️⃣\n¶수락:⚪에서 U가 "{세력명} 의뢰시작" 직접 입력 시만 🔴\n¶표기:수락 세력 이모지+건수' },
        { title: '커스텀모드', keywords: '!커스텀모드', content: '\n키워드: !커스텀모드\n\n[핵심 규칙]\nU가 입력 시 최우선\n\n[예시]\n"!커스텀모드 나는 황제이다.  \n' },
    ]
    const txt = formatLoreTxt(lore)
    assert.equal(txt, [
        '---', '',
        '## 01 일반모드',
        '일반모드 | 1️⃣',
        '¶수락:⚪에서 U가 "{세력명} 의뢰시작" 직접 입력 시만 🔴',
        '¶표기:수락 세력 이모지+건수',
        '', '---', '',
        '## 02 커스텀모드',
        '',
        '키워드: !커스텀모드',
        '',
        '[핵심 규칙]',
        'U가 입력 시 최우선',
        '',
        '[예시]',
        '"!커스텀모드 나는 황제이다.',
        '', '---', '',
    ].join('\n'))
    // 등록한 키워드는 들어가지 않는다 (내용에 직접 적은 "키워드:" 줄은 내용이라 그대로)
    assert.ok(!txt.includes('1, !일반모드'))
    assert.equal(formatLoreTxt([]), '')
    assert.ok(formatLoreTxt([{ title: ' ', content: '' }]).includes('## 01 제목 없음\n\n---'))
    assert.ok(formatLoreTxt(Array.from({ length: 120 }, (_, i) => ({ title: `t${i}`, content: 'c' }))).includes('## 001 t0\nc'))

    // 다시 읽으면 제목(번호 제외)과 내용이 그대로 돌아온다
    const parsed = parseLoreTxt(txt)
    assert.deepEqual(parsed, {
        entries: [
            { title: '일반모드', content: lore[0].content },
            { title: '커스텀모드', content: '키워드: !커스텀모드\n\n[핵심 규칙]\nU가 입력 시 최우선\n\n[예시]\n"!커스텀모드 나는 황제이다.' },
        ],
        truncated: 0,
    })
    // 메모장에서 저장한 모양(BOM, CRLF), 번호 없는 제목, 번호 뒤 점
    const windows = parseLoreTxt('﻿---\r\n\r\n## 제목만\r\n첫 줄\r\n둘째 줄\r\n\r\n---\r\n\r\n## 3. 점 번호\r\n내용\r\n---\r\n버려지는 글\r\n')
    assert.deepEqual(windows.entries, [{ title: '제목만', content: '첫 줄\n둘째 줄' }, { title: '점 번호', content: '내용' }])
    // 구분선 없이 제목만으로 나뉜 글도 읽는다
    assert.deepEqual(parseLoreTxt('## 01 A\n가\n## 02 B\n나').entries, [{ title: 'A', content: '가' }, { title: 'B', content: '나' }])
    // 한도를 넘으면 자르고 몇 개인지 알려준다
    const long = parseLoreTxt(`## 01 긴 것\n${'가'.repeat(600)}\n\n---\n\n## 02 짧은 것\n나`)
    assert.equal(countChars(long.entries[0].content), 500)
    assert.equal(long.truncated, 1)
    assert.deepEqual(parseLoreTxt('그냥 글\n제목 없음'), { entries: [], truncated: 0 })
    assert.equal(loreTxtFileName('무림: 화해/중재?'), '무림_ 화해_중재__로어북.txt')
    assert.equal(loreTxtFileName('  '), '로어북_로어북.txt')
    console.log('Lorebook txt checks passed.')
}
