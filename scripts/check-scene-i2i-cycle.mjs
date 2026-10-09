import assert from 'node:assert/strict'
import {
    SCENE_I2I_DEFAULT_STRENGTH, beginCycle, bytesToDataUrl, clampSceneI2iNoise, clampSceneI2iStrength,
    idleCycleState, imageMimeForPath, latestImagePerScene, planSecondPass, recordFirstPass, shouldRunSecondPass,
} from '../src/lib/scene-i2i-cycle.ts'

// 변화 강도: 기본 0.58, 0.01~0.99, 소수 둘째 자리
assert.equal(SCENE_I2I_DEFAULT_STRENGTH, 0.58)
assert.equal(clampSceneI2iStrength(0.55), 0.55)
assert.equal(clampSceneI2iStrength(0.6), 0.6)
assert.equal(clampSceneI2iStrength(0.5849), 0.58)
assert.equal(clampSceneI2iStrength(0), 0.01)
assert.equal(clampSceneI2iStrength(5), 0.99)
assert.equal(clampSceneI2iStrength('0.57'), 0.57)
assert.equal(clampSceneI2iStrength(Number.NaN), 0.58)
assert.equal(clampSceneI2iStrength(undefined), 0.58)
assert.equal(clampSceneI2iNoise(-1), 0)
assert.equal(clampSceneI2iNoise(0.123), 0.12)
assert.equal(clampSceneI2iNoise('x'), 0)

const record = (sceneId, path, seed = 1) => ({ sceneId, path, seed, characterPromptIds: ['c1'], sequenceEntry: null })

// 세션이 시작될 때의 설정으로 정해지고, 같은 세션에서는 다시 정하지 않는다.
let state = idleCycleState()
assert.equal(shouldRunSecondPass(state, 1), false)
state = beginCycle(state, 100, true)
assert.deepEqual(state, { sessionId: 100, enabled: true, phase: 'first', records: [] })
assert.equal(beginCycle(state, 100, false), state, '도중에 스위치를 꺼도 진행 중인 싸이클은 그대로')
assert.equal(shouldRunSecondPass(state, 100), false, '1단계 이미지가 없으면 2단계도 없다')

state = recordFirstPass(state, 100, record('s1', '/a/1.png', 11))
state = recordFirstPass(state, 100, record('s2', '/a/2.png', 22))
assert.equal(state.records.length, 2)
assert.equal(recordFirstPass(state, 999, record('s3', '/a/3.png')), state, '다른 세션의 이미지는 기록하지 않는다')
assert.equal(shouldRunSecondPass(state, 100), true)
assert.equal(shouldRunSecondPass(state, 999), false)

// 2단계에서 만든 이미지는 다시 기록되지 않는다 (무한 반복 방지).
const second = { ...state, phase: 'second', records: [] }
assert.equal(recordFirstPass(second, 100, record('s1', '/a/9.png')), second)
assert.equal(shouldRunSecondPass(second, 100), false)

// 꺼진 채 시작한 세션은 아무것도 기록하지 않는다.
let off = beginCycle(idleCycleState(), 200, false)
assert.equal(off.phase, 'idle')
off = recordFirstPass(off, 200, record('s1', '/a/1.png'))
assert.equal(off.records.length, 0)
assert.equal(shouldRunSecondPass(off, 200), false)

// 새 세션은 이전 기록을 물려받지 않는다.
const next = beginCycle(state, 300, true)
assert.deepEqual(next.records, [])

// 2단계 계획: 1단계 순서 그대로, 씬당 예약 수만큼, 지워진 씬과 중복 파일은 제외
const scenes = [{ id: 's1', name: 'one' }, { id: 's2', name: 'two' }]
const plan = planSecondPass([
    record('s1', '/a/1.png', 11),
    record('s1', '/a/1b.png', 12),
    record('gone', '/a/x.png', 13),
    record('s2', '/a/2.png', 22),
    record('s2', '/a/2.png', 22),
    record('s2', '', 23),
], scenes)
assert.deepEqual(plan.map(step => [step.scene.name, step.record.path, step.record.seed]), [
    ['one', '/a/1.png', 11],
    ['one', '/a/1b.png', 12],
    ['two', '/a/2.png', 22],
])
assert.deepEqual(planSecondPass([], scenes), [])

assert.equal(imageMimeForPath('C:\\Pictures\\NAIS_Scene\\a\\NAIS_SCENE_1.png'), 'image/png')
assert.equal(imageMimeForPath('/x/y.WEBP'), 'image/webp')
assert.equal(imageMimeForPath('/x/y.jpeg'), 'image/jpeg')
assert.equal(imageMimeForPath('/x/noext'), 'image/png')

// 큰 파일도 한 번에 변환된다 (인자 개수 한도에 걸리지 않게 나눠서 처리).
const big = new Uint8Array(200_000).map((_, index) => index % 251)
const url = bytesToDataUrl(big, 'image/png')
assert.ok(url.startsWith('data:image/png;base64,'))
assert.deepEqual(new Uint8Array(Buffer.from(url.split(',')[1], 'base64')), big)
assert.equal(bytesToDataUrl(new Uint8Array(), 'image/webp'), 'data:image/webp;base64,')

// "I2I로 변형": 씬마다 가장 최근 이미지 1장 (없는 씬은 빠지고, 저장 안 된 미리보기는 쓰지 않는다)
assert.deepEqual(latestImagePerScene([
    { id: 'a', images: [{ url: 'C:/a/1.png', timestamp: 10 }, { url: 'C:/a/3.png', timestamp: 30 }, { url: 'C:/a/2.png', timestamp: 20 }] },
    { id: 'b', images: [] },
    { id: 'c', images: [{ url: 'C:/c/1.png', timestamp: 5 }, { url: 'data:image/png;base64,AAAA', timestamp: 99 }] },
    { id: 'd', images: [{ url: 'data:image/png;base64,AAAA', timestamp: 1 }] },
]), [{ sceneId: 'a', path: 'C:/a/3.png' }, { sceneId: 'c', path: 'C:/c/1.png' }])
// 그 기록은 평소의 2단계 계획에 그대로 들어간다
{
    const state = { sessionId: 7, enabled: true, phase: 'first', records: [{ sceneId: 'a', path: 'C:/a/3.png', seed: 0, sequenceEntry: null }] }
    assert.equal(shouldRunSecondPass(state, 7), true)
    assert.deepEqual(planSecondPass(state.records, [{ id: 'a' }, { id: 'b' }]).map(step => [step.scene.id, step.record.path, step.record.characterPromptIds]), [['a', 'C:/a/3.png', undefined]])
}

console.log('Scene reference → i2i cycle checks passed.')
