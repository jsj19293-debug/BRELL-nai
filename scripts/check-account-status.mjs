import assert from 'node:assert/strict'
import {
    describeSubscriptionExpiry,
    describeV5Usage,
    formatDday,
    splitDuration,
    subscriptionTierName,
    toSubscriptionInfo,
} from '../src/lib/account-status.ts'

// --- V5 한도: percent는 "남은 양"이고 timeUntilNextPercent는 1%당 초다 ---
assert.equal(describeV5Usage(null), null)
assert.equal(describeV5Usage(undefined), null)

const half = describeV5Usage({ percent: 50, isNegative: false, timeUntilNextPercent: 1080 })
assert.equal(half.percent, 50)
assert.equal(half.barPercent, 50)
assert.equal(half.limited, false)
assert.equal(half.full, false)
assert.equal(half.estimatedImages, 865) // 50 * 17.3
assert.equal(half.refillPercentPerHour, 3.3) // 3600 / 1080
assert.equal(half.secondsToFull, 50 * 1080)

const full = describeV5Usage({ percent: 100, isNegative: false, timeUntilNextPercent: 1080 })
assert.equal(full.full, true)
assert.equal(full.secondsToFull, 0)
assert.equal(full.barPercent, 100)

// 한도를 넘긴 계정: 서버는 크기와 부호를 따로 준다.
const over = describeV5Usage({ percent: 12, isNegative: true, timeUntilNextPercent: 600 })
assert.equal(over.percent, -12)
assert.equal(over.limited, true)
assert.equal(over.barPercent, 0)
assert.equal(over.estimatedImages, 0)
assert.equal(over.secondsToFull, 112 * 600)
// 부호가 이미 붙어 와도 두 번 뒤집지 않는다.
assert.equal(describeV5Usage({ percent: -12, isNegative: true, timeUntilNextPercent: 600 }).percent, -12)

// 충전 시간을 모르면 0으로 두고 나누지 않는다.
const unknownRate = describeV5Usage({ percent: 40, isNegative: false, timeUntilNextPercent: 0 })
assert.equal(unknownRate.refillPercentPerHour, 0)
assert.equal(unknownRate.secondsToFull, 0)

assert.deepEqual(splitDuration(3725), { hours: 1, minutes: 2, seconds: 5 })
assert.deepEqual(splitDuration(-5), { hours: 0, minutes: 0, seconds: 0 })
assert.deepEqual(splitDuration(Number.NaN), { hours: 0, minutes: 0, seconds: 0 })

// --- 구독 정보 ---
assert.equal(subscriptionTierName(3), 'opus')
assert.equal(subscriptionTierName(2), 'scroll')
assert.equal(subscriptionTierName(1), 'tablet')
assert.equal(subscriptionTierName(0), 'paper')
assert.equal(subscriptionTierName(undefined), 'paper')

// 이전 백엔드 응답(등급 없음)은 구독 정보를 만들지 않는다.
assert.equal(toSubscriptionInfo({}), null)
assert.deepEqual(
    toSubscriptionInfo({ tier: 3, active: true, isGracePeriod: false, expiresAt: 1_800_000_000 }),
    { tier: 'opus', active: true, isGracePeriod: false, expiresAt: 1_800_000_000_000 },
)
assert.equal(toSubscriptionInfo({ tier: 0, active: false, expiresAt: null }).expiresAt, null)
assert.equal(toSubscriptionInfo({ tier: 3, active: true, expiresAt: 0 }).expiresAt, null)

// --- 만료일: 달력 날짜로 센다 ---
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const sub = expiresAt => ({ tier: 'opus', active: true, isGracePeriod: false, expiresAt })
const now = at(2026, 10, 9, 11, 4)

assert.deepEqual(describeSubscriptionExpiry(null, now), { state: 'unknown', expiresAt: null, daysLeft: null })
assert.equal(describeSubscriptionExpiry(sub(null), now).state, 'unknown')

const far = describeSubscriptionExpiry(sub(at(2026, 10, 21, 9)), now)
assert.equal(far.daysLeft, 12)
assert.equal(far.state, 'active')

assert.equal(describeSubscriptionExpiry(sub(at(2026, 10, 16, 9)), now).state, 'soon') // D-7
assert.equal(describeSubscriptionExpiry(sub(at(2026, 10, 17, 9)), now).state, 'active') // D-8
assert.equal(describeSubscriptionExpiry(sub(at(2026, 10, 12, 23)), now).state, 'urgent') // D-3

// 내일 새벽 만료와 내일 밤 만료는 둘 다 D-1.
assert.equal(describeSubscriptionExpiry(sub(at(2026, 10, 10, 0, 30)), now).daysLeft, 1)
assert.equal(describeSubscriptionExpiry(sub(at(2026, 10, 10, 23, 30)), now).daysLeft, 1)

// 오늘 늦게 만료: 아직 유효한 D-DAY.
const today = describeSubscriptionExpiry(sub(at(2026, 10, 9, 23)), now)
assert.equal(today.daysLeft, 0)
assert.equal(today.state, 'urgent')
// 오늘 이미 지난 시각: 같은 날짜지만 만료.
assert.equal(describeSubscriptionExpiry(sub(at(2026, 10, 9, 8)), now).state, 'expired')

const past = describeSubscriptionExpiry(sub(at(2026, 10, 6, 9)), now)
assert.equal(past.state, 'expired')
assert.equal(past.daysLeft, -3)

assert.equal(formatDday(12), 'D-12')
assert.equal(formatDday(0), 'D-DAY')
assert.equal(formatDday(-3), 'D+3')
assert.equal(formatDday(null), '')

console.log('Account status checks passed: V5 remaining, refill, subscription tier and expiry.')
