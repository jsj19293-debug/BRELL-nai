import assert from 'node:assert/strict'
import { expandSelectionToStacks, pruneSelection, toggleSelectAll } from '../src/lib/character-bulk-delete.ts'

// 변형 묶음(stack)은 카드 한 장으로 보인다. 카드를 체크하면 묶음 전체가 대상이다.
const characters = [
    { id: 'a', stack: 's1' },
    { id: 'a2', stack: 's1' },
    { id: 'b', stack: 'b' },
    { id: 'c', stack: 'c' },
    { id: 'd', stack: 's2' },
    { id: 'd2', stack: 's2' },
]
const key = character => character.stack
assert.deepEqual(expandSelectionToStacks(characters, new Set(['a', 'c']), key), ['a', 'a2', 'c'])
assert.deepEqual(expandSelectionToStacks(characters, new Set(['d2']), key), ['d', 'd2'], '보이지 않는 변형을 골라도 같은 묶음')
assert.deepEqual(expandSelectionToStacks(characters, new Set(), key), [])
assert.deepEqual(expandSelectionToStacks(characters, new Set(['gone']), key), [], '없는 번호는 아무것도 지우지 않는다')
assert.deepEqual(expandSelectionToStacks(characters, new Set(['b']), key), ['b'], '선택하지 않은 캐릭터는 남는다')

// 검색·폴더 변경으로 안 보이게 된 선택은 버린다.
assert.deepEqual([...pruneSelection(new Set(['a', 'b', 'c']), ['b', 'c', 'd'])], ['b', 'c'])
assert.equal(pruneSelection(new Set(['a']), []).size, 0)

assert.deepEqual([...toggleSelectAll(new Set(), ['a', 'b'])], ['a', 'b'])
assert.deepEqual([...toggleSelectAll(new Set(['a']), ['a', 'b'])], ['a', 'b'], '일부만 선택된 상태면 전체 선택')
assert.equal(toggleSelectAll(new Set(['a', 'b']), ['a', 'b']).size, 0, '모두 선택된 상태면 전체 해제')
assert.equal(toggleSelectAll(new Set(['x']), []).size, 0)

console.log('Character bulk-delete checks passed.')
