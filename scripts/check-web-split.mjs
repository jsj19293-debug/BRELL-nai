// 웹 분할 주소 처리와 캐릭터 프사 자르기 점검: node --experimental-strip-types scripts/check-web-split.mjs
import assert from 'node:assert/strict'
import { normalizeWebAddress, WEB_QUICK_LINKS } from '../src/lib/web-split.ts'
import { squareCrop } from '../src/lib/square-avatar.ts'

assert.equal(normalizeWebAddress(''), null)
assert.equal(normalizeWebAddress('  '), null)
assert.equal(normalizeWebAddress('https://danbooru.donmai.us/posts?tags=1girl'), 'https://danbooru.donmai.us/posts?tags=1girl')
assert.equal(normalizeWebAddress('http://example.com'), 'http://example.com/')
assert.equal(normalizeWebAddress('novelai.net/image'), 'https://novelai.net/image')
assert.equal(normalizeWebAddress('danbooru.donmai.us'), 'https://danbooru.donmai.us/')
assert.equal(normalizeWebAddress('localhost:3000/a'), 'https://localhost:3000/a')
// 주소가 아니면 검색
assert.equal(normalizeWebAddress('은발 소녀 태그'), 'https://www.google.com/search?q=' + encodeURIComponent('은발 소녀 태그'))
assert.equal(normalizeWebAddress('silver_hair'), 'https://www.google.com/search?q=silver_hair')
// http(s) 가 아닌 주소는 열지 않는다
assert.equal(normalizeWebAddress('javascript:alert(1)'), null)
assert.equal(normalizeWebAddress('file:///C:/Windows/win.ini'), null)
assert.equal(normalizeWebAddress('data:text/html,hi'), null)
for (const link of WEB_QUICK_LINKS) assert.equal(normalizeWebAddress(link.url) !== null, true)

// 프사: 가로로 길면 가운데, 세로로 길면 위쪽에서 정사각형
assert.deepEqual(squareCrop(1216, 832), { x: 192, y: 0, side: 832 })
assert.deepEqual(squareCrop(832, 1216), { x: 0, y: 46, side: 832 })
assert.deepEqual(squareCrop(500, 500), { x: 0, y: 0, side: 500 })
assert.deepEqual(squareCrop(0, 0), { x: 0, y: 0, side: 1 })

console.log('Web split and avatar checks passed.')
