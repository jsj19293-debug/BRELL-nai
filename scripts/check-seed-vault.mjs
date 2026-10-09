// 시드 보관함 규칙 점검: node --experimental-strip-types scripts/check-seed-vault.mjs
import assert from 'node:assert/strict'
import { addSeedEntry, filterSeedEntries, parseSeedInput, MAX_SEED_ENTRIES } from '../src/lib/seed-vault.ts'

assert.equal(parseSeedInput(' 1,234 567 '), 1234567)
assert.equal(parseSeedInput('4294967295'), 4294967295)
assert.equal(parseSeedInput('4294967296'), null)
assert.equal(parseSeedInput('0'), null)
assert.equal(parseSeedInput('-5'), null)
assert.equal(parseSeedInput('12a'), null)
assert.equal(parseSeedInput(''), null)

const entry = (id, seed, extra = {}) => ({ id, seed, createdAt: 1, ...extra })
let list = []
let result = addSeedEntry(list, entry('a', 10, { imagePath: 'C:/a.png', prompt: 'forest' }))
assert.equal(result.duplicate, false)
list = result.entries
result = addSeedEntry(list, entry('b', 20, { memo: '좋음' }))
list = result.entries
assert.deepEqual(list.map(item => item.id), ['b', 'a'])
// 같은 시드 + 같은 이미지는 다시 넣지 않고 맨 앞으로 올린다 (메모가 지워지지 않게 기존 항목 유지)
result = addSeedEntry(list, entry('c', 10, { imagePath: 'C:/a.png', prompt: 'forest' }))
assert.equal(result.duplicate, true)
assert.deepEqual(result.entries.map(item => item.id), ['a', 'b'])
// 같은 시드라도 다른 이미지면 따로 저장한다
result = addSeedEntry(list, entry('d', 10, { imagePath: 'C:/other.png', prompt: 'forest' }))
assert.equal(result.duplicate, false)
assert.equal(result.entries.length, 3)
// 개수 제한
const many = Array.from({ length: MAX_SEED_ENTRIES }, (_, index) => entry(`m${index}`, index + 1))
assert.equal(addSeedEntry(many, entry('new', 999999)).entries.length, MAX_SEED_ENTRIES)
assert.equal(addSeedEntry(many, entry('new', 999999)).entries[0].id, 'new')

assert.deepEqual(filterSeedEntries(list, 'FOREST').map(item => item.id), ['a'])
assert.deepEqual(filterSeedEntries(list, '좋').map(item => item.id), ['b'])
assert.deepEqual(filterSeedEntries(list, '20').map(item => item.id), ['b'])
assert.equal(filterSeedEntries(list, '  ').length, 2)

console.log('Seed vault checks passed.')
