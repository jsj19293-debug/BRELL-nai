// 후처리 템플릿 · 씬 자동 적용 규칙
import assert from 'node:assert/strict'
import { sameAspect, postprocessFileName, splitPath, uniqueTemplateName, POSTPROCESS_FOLDER_NAME } from '../src/lib/postprocess.ts'

assert.equal(POSTPROCESS_FOLDER_NAME, '후처리')
assert.ok(sameAspect({ width: 832, height: 1216 }, { width: 1664, height: 2432 }))
assert.ok(!sameAspect({ width: 832, height: 1216 }, { width: 1216, height: 832 }))
assert.ok(sameAspect({ width: 0, height: 0 }, { width: 10, height: 20 }))
assert.equal(postprocessFileName('NAIS_SCENE_1760000000100.webp'), 'NAIS_SCENE_1760000000100.png')
assert.equal(postprocessFileName('a.b.png'), 'a.b.png')
assert.deepEqual(splitPath('C:\\x\\1 기본\\a.png'), { folder: 'C:\\x\\1 기본', name: 'a.png' })
assert.deepEqual(splitPath('a.png'), { folder: '', name: 'a.png' })
assert.equal(uniqueTemplateName('  ', ['a']), '템플릿 2')
assert.equal(uniqueTemplateName('말풍선', ['말풍선', '말풍선 (2)']), '말풍선 (3)')
console.log('Postprocess checks passed.')
