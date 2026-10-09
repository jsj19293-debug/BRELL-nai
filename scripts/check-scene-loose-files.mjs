// 작품 폴더의 낱장 이미지를 씬에 나눠 담는 규칙 점검: node --experimental-strip-types scripts/check-scene-loose-files.mjs
import assert from 'node:assert/strict'
import { leadingNumber, planLooseFiles } from '../src/lib/scene-loose-files.ts'

assert.equal(leadingNumber('2 - 웃음'), 2)
assert.equal(leadingNumber('17-술을 마시는'), 17)
assert.equal(leadingNumber('068-[마사지]가슴'), 68)
assert.equal(leadingNumber('[10] 경멸'), 10)
assert.equal(leadingNumber('웃음 2'), null)
assert.equal(leadingNumber(''), null)

const scenes = [
    { id: 's1', name: '1 - 기본' }, { id: 's2', name: '2 - 웃음' }, { id: 's10', name: '10 - 경멸' },
    { id: 's17', name: '17-술을 마시는' }, { id: 's26', name: '26 - 임신?' }, { id: 's68', name: '68-[마사지]가슴 슬라이드' },
]
const sceneOf = (fileName, list = scenes) => planLooseFiles(list, [fileName]).matches[0]?.sceneId ?? null

// 씬 이름으로 시작하는 파일
assert.equal(sceneOf('2 - 웃음_1.png'), 's2')
assert.equal(sceneOf('10 - 경멸_1.png'), 's10')
assert.equal(sceneOf('17-술을 마시는_1.png'), 's17')
assert.equal(sceneOf('68-[마사지]가슴 슬라이드_1.png'), 's68')
assert.equal(sceneOf('26 - 임신__3.webp'), 's26')       // ? 는 폴더에서 _ 로 바뀐다
// 숫자만 있는 파일
assert.equal(sceneOf('1.png'), 's1')
assert.equal(sceneOf('2.png'), 's2')
assert.equal(sceneOf('10.png'), 's10')                   // 1번 씬이 아니라 10번 씬
assert.equal(sceneOf('26.png'), 's26')
assert.equal(sceneOf('002_1.png'), 's2')
assert.equal(sceneOf('17 (2).jpg'), 's17')
assert.equal(sceneOf('2 - 다른 이름.png'), 's2')         // 이름이 달라도 숫자가 같으면
// 맞는 씬이 없으면 그대로 둔다
assert.equal(sceneOf('99.png'), null)
assert.equal(sceneOf('표지.png'), null)
assert.deepEqual(planLooseFiles(scenes, ['99.png', '2.png', '표지.png']), { matches: [{ fileName: '2.png', sceneId: 's2' }], unmatched: ['99.png', '표지.png'] })

// 같은 숫자의 씬이 둘이면 숫자로는 맞추지 않는다 (이름이 맞으면 맞춘다)
const twins = [{ id: 'a', name: '3 - 낮' }, { id: 'b', name: '3 - 밤' }]
assert.equal(sceneOf('3.png', twins), null)
assert.equal(sceneOf('3 - 밤_1.png', twins), 'b')

// 씬 이름에 숫자가 전혀 없으면 숫자를 순서로 본다
const plain = [{ id: 'x', name: '기본' }, { id: 'y', name: '웃음' }, { id: 'z', name: '슬픔' }]
assert.equal(sceneOf('2.png', plain), 'y')
assert.equal(sceneOf('3_1.png', plain), 'z')
assert.equal(sceneOf('4.png', plain), null)
assert.equal(sceneOf('웃음_2.png', plain), 'y')
// 숫자 씬 이름 "1" 과 "10" 이 섞여 있어도 헷갈리지 않는다
const bare = [{ id: 'one', name: '1' }, { id: 'ten', name: '10' }]
assert.equal(sceneOf('10.png', bare), 'ten')
assert.equal(sceneOf('10_1.png', bare), 'ten')
assert.equal(sceneOf('1_1.png', bare), 'one')

console.log('Scene loose file checks passed.')
