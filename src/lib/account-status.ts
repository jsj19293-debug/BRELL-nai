/**
 * 계정 상태 표시용 계산: V5 생성 한도 잔량과 구독 만료일.
 * 화면 코드와 분리해 두어 `npm run check:account-status`로 검사한다.
 *
 * V5 잔량 해석과 예상 장수 계산은 NAIS3(sunanakgo) / NAIS3-Custom(seotk0319)의
 * `src/shared/v5-usage.ts`를 참고했다 (GPL-3.0).
 */

/** NovelAI `/user/subscription`의 `usage`. percent는 "남은 한도"다. */
export interface V5UsageInput {
    percent: number
    isNegative: boolean
    /** 1% 충전에 걸리는 초 (카운트다운이 아니다) */
    timeUntilNextPercent: number
}

export interface V5UsageView {
    /** 화면에 쓰는 잔량 숫자. 제한 상태면 음수. */
    percent: number
    /** 막대 길이 0~100 */
    barPercent: number
    /** 한도를 넘겨 제한된 상태 */
    limited: boolean
    full: boolean
    /** 23스텝·약 1MP 기준 예상 생성 장수 */
    estimatedImages: number
    /** 시간당 충전되는 % (소수 1자리). 알 수 없으면 0 */
    refillPercentPerHour: number
    /** 1% 충전에 걸리는 초. 알 수 없으면 0 */
    secondsPerPercent: number
    /** 100%까지 남은 초. 가득 찼거나 알 수 없으면 0 */
    secondsToFull: number
}

/** NovelAI 공식 안내 기준: 1%당 약 17.3장 (23스텝 · 약 1MP). */
export const V5_IMAGES_PER_PERCENT = 17.3

export function describeV5Usage(usage: V5UsageInput | null | undefined): V5UsageView | null {
    if (!usage || !Number.isFinite(usage.percent)) return null
    const magnitude = Math.abs(usage.percent)
    const limited = usage.isNegative === true
    const percent = limited ? -magnitude : magnitude
    const secondsPerPercent = Number.isFinite(usage.timeUntilNextPercent) && usage.timeUntilNextPercent > 0
        ? usage.timeUntilNextPercent
        : 0
    const full = !limited && magnitude >= 100
    const percentToFull = full ? 0 : limited ? magnitude + 100 : 100 - magnitude
    return {
        percent,
        barPercent: limited ? 0 : Math.max(0, Math.min(100, magnitude)),
        limited,
        full,
        estimatedImages: limited ? 0 : Math.floor(magnitude * V5_IMAGES_PER_PERCENT),
        refillPercentPerHour: secondsPerPercent > 0 ? Math.round((3600 / secondsPerPercent) * 10) / 10 : 0,
        secondsPerPercent,
        secondsToFull: Math.round(percentToFull * secondsPerPercent),
    }
}

/** 초를 { hours, minutes, seconds }로 나눈다 (표시는 화면에서 번역 문자열로 조립). */
export function splitDuration(totalSeconds: number): { hours: number; minutes: number; seconds: number } {
    const value = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0))
    return {
        hours: Math.floor(value / 3600),
        minutes: Math.floor((value % 3600) / 60),
        seconds: value % 60,
    }
}

export type SubscriptionTierName = 'paper' | 'tablet' | 'scroll' | 'opus'

export interface SubscriptionInfo {
    tier: SubscriptionTierName
    active: boolean
    isGracePeriod: boolean
    /** 만료 시각 (epoch ms). 서버가 주지 않으면 null */
    expiresAt: number | null
}

export function subscriptionTierName(tier: number | null | undefined): SubscriptionTierName {
    return tier === 3 ? 'opus' : tier === 2 ? 'scroll' : tier === 1 ? 'tablet' : 'paper'
}

/** Rust `get_anlas_balance` 응답에서 구독 정보를 만든다. tier가 없으면(이전 응답 형태) null. */
export function toSubscriptionInfo(raw: {
    tier?: number | null
    active?: boolean | null
    isGracePeriod?: boolean | null
    expiresAt?: number | null
}): SubscriptionInfo | null {
    if (raw.tier === undefined || raw.tier === null) return null
    const seconds = typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt) && raw.expiresAt > 0
        ? raw.expiresAt
        : null
    return {
        tier: subscriptionTierName(raw.tier),
        active: raw.active === true,
        isGracePeriod: raw.isGracePeriod === true,
        expiresAt: seconds === null ? null : seconds * 1000,
    }
}

export type SubscriptionExpiryState =
    /** 만료일 정보 없음 (무료 계정 등) */
    | 'unknown'
    | 'active'
    /** 7일 이내 만료 */
    | 'soon'
    /** 3일 이내 만료 */
    | 'urgent'
    | 'expired'

export interface SubscriptionExpiryView {
    state: SubscriptionExpiryState
    expiresAt: number | null
    /** 만료까지 남은 달력 일수. 오늘 만료면 0, 지났으면 음수. 모르면 null */
    daysLeft: number | null
}

const DAY_MS = 86_400_000
const startOfLocalDay = (time: number): number => {
    const date = new Date(time)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function describeSubscriptionExpiry(
    subscription: SubscriptionInfo | null | undefined,
    now = Date.now(),
): SubscriptionExpiryView {
    const expiresAt = subscription?.expiresAt ?? null
    if (expiresAt === null) return { state: 'unknown', expiresAt: null, daysLeft: null }
    // 달력 날짜 차이로 센다: 내일 새벽 만료와 내일 밤 만료가 모두 "D-1"이다.
    const daysLeft = Math.round((startOfLocalDay(expiresAt) - startOfLocalDay(now)) / DAY_MS)
    const state: SubscriptionExpiryState = expiresAt <= now
        ? 'expired'
        : daysLeft <= 3 ? 'urgent' : daysLeft <= 7 ? 'soon' : 'active'
    return { state, expiresAt, daysLeft }
}

/** "D-12", "D-DAY", "D+3" */
export function formatDday(daysLeft: number | null): string {
    if (daysLeft === null) return ''
    if (daysLeft === 0) return 'D-DAY'
    return daysLeft > 0 ? `D-${daysLeft}` : `D+${-daysLeft}`
}
