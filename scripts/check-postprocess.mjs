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

// 후처리본: 새 이름 · 폴더 판별
{
    const { postprocessOutputName, isPostprocessOutput } = await import('../src/lib/postprocess.ts')
    assert.equal(postprocessOutputName('NAIS_SCENE_1.webp', 1760000000000), 'NAIS_SCENE_1_후처리_1760000000000.png')
    assert.equal(isPostprocessOutput('C:\\x\\1 기본\\후처리\\a.png'), true)
    assert.equal(isPostprocessOutput('/x/1 기본/a.png'), false)
    const { latestImagePerScene } = await import('../src/lib/scene-i2i-cycle.ts')
    const picks = latestImagePerScene([{ id: 's', images: [{ url: 'C:\\x\\후처리\\b.png', timestamp: 9 }, { url: 'C:\\x\\a.png', timestamp: 1 }] }])
    assert.equal(picks[0].path, 'C:\\x\\a.png')
    const { getSceneFolderFromImages } = await import('../src/lib/scene-path.ts')
    assert.equal(getSceneFolderFromImages([{ url: 'C:\\x\\s\\후처리\\b.png' }, { url: 'C:\\x\\s\\a.png' }]), 'C:\\x\\s')
    console.log('postprocess output checks passed')
}
