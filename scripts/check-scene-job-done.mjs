// "작업완료하기" 옮길 계획 확인
import assert from 'node:assert/strict'
import * as lib from '../src/lib/scene-job-done.ts'

assert.equal(lib.jobFolderName('운빨/좆망겜', new Date(2026, 9, 27, 10, 31)), '운빨_좆망겜 2026-10-27 1031')
assert.equal(lib.uniqueName('A', new Set(['a', 'A (2)'])), 'A (3)')
assert.equal(lib.uniqueName('B', new Set(['a'])), 'B')
assert.ok(lib.isInside('C:\\x\\NAIS_Scene\\작품\\1', 'c:/x/nais_scene/작품'))
assert.ok(!lib.isInside('C:\\x\\NAIS_Scene\\작품2', 'C:\\x\\NAIS_Scene\\작품'))
const ok = lib.planJobDone('C:\\p\\NAIS_Scene\\작품', 'D:\\보관\\작품 2026-10-27 1031')
assert.deepEqual(ok, { ok: true, moves: [{ sourcePath: 'C:\\p\\NAIS_Scene\\작품', destinationPath: 'D:\\보관\\작품 2026-10-27 1031' }] })
assert.equal(lib.planJobDone('C:\\p\\작품', 'C:\\p\\작품\\보관\\x').reason, 'destination-inside-work')
assert.equal(lib.planJobDone('C:\\p\\보관\\x\\작품', 'C:\\p\\보관\\x').reason, 'work-inside-destination')
console.log('Scene job-done checks passed.')
