// 작업 기록 검사: 날짜별 · 모델별 합계와 사용량 계산.
import assert from 'node:assert/strict'
import {
    WORK_LOG_MAX_DAYS, addToWorkLog, dateKey, dayModelRows, summarizeDay, summarizeWorkLog, usageSpent, workLogCsv, workLogModelLabel,
} from '../src/lib/work-log.ts'

assert.equal(dateKey(new Date(2026, 9, 9, 23, 59).getTime()), '2026-10-09')
assert.equal(dateKey(new Date(2026, 0, 3, 0, 0).getTime()), '2026-01-03')
assert.equal(workLogModelLabel('nai-diffusion-5-full'), 'V5 Full')
assert.equal(workLogModelLabel('nai-diffusion-4-5-full'), 'V4.5 Full')
assert.equal(workLogModelLabel('some-new-model'), 'some-new-model')

let log = []
log = addToWorkLog(log, '2026-10-09', 'nai-diffusion-5-full', { images: 1 })
log = addToWorkLog(log, '2026-10-09', 'nai-diffusion-5-full', { v5Percent: 0.06 })
log = addToWorkLog(log, '2026-10-09', 'nai-diffusion-5-full', { images: 1, v5Percent: 0.06 })
log = addToWorkLog(log, '2026-10-09', 'nai-diffusion-4-5-full', { images: 3, anlas: 60 })
log = addToWorkLog(log, '2026-10-08', 'nai-diffusion-4-5-full', { images: 10, anlas: 200 })
log = addToWorkLog(log, '2026-10-10', 'nai-diffusion-4-5-curated', { images: 1 })
// 최신 날짜가 앞에, V5와 V4.5가 따로 쌓인다
assert.deepEqual(log.map(day => day.date), ['2026-10-10', '2026-10-09', '2026-10-08'])
assert.deepEqual(log[1].models, {
    'nai-diffusion-5-full': { images: 2, anlas: 0, v5Percent: 0.12 },
    'nai-diffusion-4-5-full': { images: 3, anlas: 60, v5Percent: 0 },
})
assert.deepEqual(summarizeDay(log[1]), { images: 5, anlas: 60, v5Percent: 0.12 })
assert.deepEqual(summarizeWorkLog(log), { images: 16, anlas: 260, v5Percent: 0.12 })
assert.deepEqual(dayModelRows(log[1]).map(row => [row.label, row.images]), [['V4.5 Full', 3], ['V5 Full', 2]])
// 아무것도 더하지 않거나 음수는 무시한다
assert.deepEqual(addToWorkLog(log, '2026-10-09', 'm', {}), log)
assert.deepEqual(addToWorkLog(log, '2026-10-09', 'm', { images: -3, anlas: -5 }), log)
assert.deepEqual(addToWorkLog(log, '', 'm', { images: 1 }), log)
// 오래된 날짜는 버린다
let long = []
for (let day = 0; day < WORK_LOG_MAX_DAYS + 20; day++) long = addToWorkLog(long, dateKey(new Date(2025, 0, 1 + day).getTime()), 'm', { images: 1 })
assert.equal(long.length, WORK_LOG_MAX_DAYS)
assert.equal(long[0].date, dateKey(new Date(2025, 0, WORK_LOG_MAX_DAYS + 20).getTime()))

// 사용량: 줄어든 만큼만
const snap = (account, anlas, v5Percent) => ({ account, anlas, v5Percent })
assert.deepEqual(usageSpent(snap('a', 1000, 80), snap('a', 980, 79.94)), { anlas: 20, v5Percent: 0.06 })
assert.deepEqual(usageSpent(snap('a', 1000, 80), snap('a', 1000, 80)), { anlas: 0, v5Percent: 0 })
assert.deepEqual(usageSpent(snap('a', 100, 10), snap('a', 5000, 100)), { anlas: 0, v5Percent: 0 })   // 충전
assert.deepEqual(usageSpent(snap('a', 1000, 80), snap('b', 10, 5)), { anlas: 0, v5Percent: 0 })      // 계정 바뀜
assert.deepEqual(usageSpent(null, snap('a', 10, 5)), { anlas: 0, v5Percent: 0 })
assert.deepEqual(usageSpent(snap('a', null, 80), snap('a', 10, null)), { anlas: 0, v5Percent: 0 })

assert.equal(workLogCsv(log.slice(1, 2)), '날짜,모델,장수,Anlas,V5 사용량(%)\r\n2026-10-09,V4.5 Full,3,60,0\r\n2026-10-09,V5 Full,2,0,0.12\r\n')

console.log('Work log checks passed.')
