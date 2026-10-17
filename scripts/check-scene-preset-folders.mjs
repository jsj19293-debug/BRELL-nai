// 씬 작품 폴더 묶기 점검: node --experimental-strip-types scripts/check-scene-preset-folders.mjs
import assert from 'node:assert/strict'
import { groupPresets, uniqueFolderName } from '../src/lib/scene-preset-folders.ts'

const presets = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id }))
const folders = [{ id: 'f1', name: '완결', collapsed: false }, { id: 'f2', name: '연재', collapsed: true }]
const groups = groupPresets(presets, folders, { a: 'f2', c: 'f1', d: 'f2', e: 'gone' })
assert.deepEqual(groups.map(group => [group.folder?.id ?? null, group.presets.map(preset => preset.id)]), [['f1', ['c']], ['f2', ['a', 'd']], [null, ['b', 'e']]])
assert.deepEqual(groupPresets(presets, [], {}).map(group => group.presets.length), [5])
assert.equal(uniqueFolderName('새 폴더', []), '새 폴더')
assert.equal(uniqueFolderName('새 폴더', ['새 폴더', '새 폴더(2)']), '새 폴더(3)')
console.log('Scene preset folder checks passed.')
