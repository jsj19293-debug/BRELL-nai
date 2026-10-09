import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CalendarClock, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/ui/tooltip'
import {
    describeSubscriptionExpiry,
    describeV5Usage,
    formatDday,
    splitDuration,
    type SubscriptionExpiryState,
    type SubscriptionInfo,
    type V5UsageInput,
    type V5UsageView,
} from '@/lib/account-status'

const TIER_LABELS: Record<SubscriptionInfo['tier'], string> = {
    paper: 'Paper',
    tablet: 'Tablet',
    scroll: 'Scroll',
    opus: 'Opus',
}

const EXPIRY_TONE: Record<SubscriptionExpiryState, string> = {
    unknown: 'text-muted-foreground',
    active: 'text-emerald-600 dark:text-emerald-400',
    soon: 'text-amber-600 dark:text-amber-400',
    urgent: 'text-red-600 dark:text-red-400',
    expired: 'text-red-600 dark:text-red-400',
}

/** 자정이 지나면 D-day가 바뀌므로 한 시간마다 다시 계산한다. */
function useHourlyNow(): number {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 3_600_000)
        return () => window.clearInterval(timer)
    }, [])
    return now
}

export function formatDurationText(t: TFunction, totalSeconds: number): string {
    const { hours, minutes, seconds } = splitDuration(totalSeconds)
    if (hours >= 24) {
        return t('account.duration.daysHours', '{{days}}일 {{hours}}시간', {
            days: Math.floor(hours / 24),
            hours: hours % 24,
        })
    }
    if (hours > 0) return t('account.duration.hoursMinutes', '{{hours}}시간 {{minutes}}분', { hours, minutes })
    if (minutes > 0) return t('account.duration.minutesSeconds', '{{minutes}}분 {{seconds}}초', { minutes, seconds })
    return t('account.duration.seconds', '{{seconds}}초', { seconds })
}

export function formatExpiryDate(expiresAt: number, locale: string): string {
    return new Date(expiresAt).toLocaleString(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

/** "2026. 10. 21. · D-12" 형태의 한 줄 요약. 만료일을 모르면 빈 문자열. */
export function summarizeExpiry(t: TFunction, locale: string, subscription: SubscriptionInfo | null, now: number): string {
    const view = describeSubscriptionExpiry(subscription, now)
    if (view.expiresAt === null) return ''
    const date = new Date(view.expiresAt).toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    return view.state === 'expired'
        ? t('account.expiredOn', '{{date}} 만료됨', { date })
        : `${date} · ${formatDday(view.daysLeft)}`
}

function v5TooltipLines(t: TFunction, view: V5UsageView): string[] {
    const lines = [
        view.limited
            ? t('account.v5.limited', 'V5 생성 한도 초과 (−{{percent}}%) · 충전될 때까지 제한돼요', { percent: Math.abs(view.percent) })
            : t('account.v5.remaining', 'V5 생성 한도 잔량 {{percent}}%', { percent: view.percent }),
    ]
    if (!view.limited) {
        lines.push(t('account.v5.estimatedImages', '약 {{n}}장 (23스텝 · 약 1MP 기준 예상치)', {
            n: view.estimatedImages.toLocaleString(),
        }))
    }
    if (view.full) {
        lines.push(t('account.v5.full', '가득 참'))
    } else if (view.secondsPerPercent > 0) {
        lines.push(t('account.v5.refill', '충전 속도 +{{rate}}%/시간 · 1%당 {{time}}', {
            rate: view.refillPercentPerHour,
            time: formatDurationText(t, view.secondsPerPercent),
        }))
        lines.push(t('account.v5.untilFull', '100%까지 약 {{time}}', { time: formatDurationText(t, view.secondsToFull) }))
    }
    return lines
}

interface HeaderChipProps {
    usage: V5UsageInput | null
    subscription: SubscriptionInfo | null
}

/** 왼쪽 패널 상단: V5 잔량 막대. 선택한 모델과 상관없이 값이 있으면 항상 보인다. */
export function V5UsageChip({ usage }: Pick<HeaderChipProps, 'usage'>) {
    const { t } = useTranslation()
    const view = describeV5Usage(usage)
    if (!view) return null
    return (
        <Tip
            side="bottom"
            content={(
                <span className="block whitespace-pre-line text-left leading-relaxed">
                    {v5TooltipLines(t, view).join('\n')}
                </span>
            )}
        >
            <div
                className={cn(
                    'flex h-8 w-[5.5rem] shrink-0 flex-col justify-center rounded-md border px-2',
                    view.limited
                        ? 'border-red-500/40 bg-red-500/10 text-red-500'
                        : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
                )}
                aria-label={t('account.v5.remaining', 'V5 생성 한도 잔량 {{percent}}%', { percent: view.percent })}
            >
                <div className="flex items-baseline justify-between gap-1 text-[10px] font-semibold leading-3 tabular-nums">
                    <span>V5 {view.limited ? '−' : ''}{Math.abs(view.percent)}%</span>
                    <span className="truncate font-normal opacity-80">
                        {view.limited
                            ? t('account.v5.limitedShort', '제한')
                            : t('account.v5.imagesShort', '~{{n}}장', { n: view.estimatedImages.toLocaleString() })}
                    </span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/15 dark:bg-cyan-950/60">
                    <div
                        className={cn('h-full rounded-full', view.limited ? 'bg-red-500' : 'bg-cyan-500 dark:bg-cyan-400')}
                        style={{ width: `${view.barPercent}%` }}
                    />
                </div>
            </div>
        </Tip>
    )
}

/** 왼쪽 패널 상단: 만료가 가까울 때(7일 이내)만 보이는 D-day 배지. */
export function SubscriptionExpiryBadge({ subscription }: Pick<HeaderChipProps, 'subscription'>) {
    const { t, i18n } = useTranslation()
    const now = useHourlyNow()
    const view = describeSubscriptionExpiry(subscription, now)
    if (view.expiresAt === null || view.state === 'active' || view.state === 'unknown') return null
    return (
        <Tip
            side="bottom"
            content={t('account.expiresAtFull', '구독 만료일 {{date}}', { date: formatExpiryDate(view.expiresAt, i18n.language) })}
        >
            <span
                className={cn(
                    'flex h-8 shrink-0 items-center rounded-md border px-1.5 text-[11px] font-bold tabular-nums',
                    view.state === 'soon'
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400',
                )}
            >
                {view.state === 'expired' ? t('account.expiredShort', '만료') : formatDday(view.daysLeft)}
            </span>
        </Tip>
    )
}

/** Anlas 배지 툴팁에 붙이는 구독 요약 한 줄. 정보가 없으면 null. */
export function useSubscriptionSummary(subscription: SubscriptionInfo | null): string | null {
    const { t, i18n } = useTranslation()
    const now = useHourlyNow()
    if (!subscription) return null
    const expiry = summarizeExpiry(t, i18n.language, subscription, now)
    const tier = TIER_LABELS[subscription.tier]
    return expiry
        ? t('account.summaryWithExpiry', '{{tier}} · 만료 {{expiry}}', { tier, expiry })
        : tier
}

interface AccountStatusCardProps extends HeaderChipProps {
    className?: string
}

/** 설정 > API: 구독 등급·만료일과 V5 한도를 자세히 보여준다. */
export function AccountStatusCard({ usage, subscription, className }: AccountStatusCardProps) {
    const { t, i18n } = useTranslation()
    const now = useHourlyNow()
    const v5 = describeV5Usage(usage)
    const expiry = describeSubscriptionExpiry(subscription, now)
    if (!subscription && !v5) return null

    return (
        <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
            {subscription && (
                <div className="rounded-xl border border-border/50 bg-card/30 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <CalendarClock className="h-4 w-4 text-muted-foreground" />
                        {t('account.subscription', '구독')}
                        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                            {TIER_LABELS[subscription.tier]}
                        </span>
                    </div>
                    {expiry.expiresAt === null ? (
                        <p className="mt-3 text-sm text-muted-foreground">
                            {t('account.noExpiry', '만료일 정보가 없어요 (구독 중이 아니거나 서버가 알려주지 않았어요).')}
                        </p>
                    ) : (
                        <>
                            <p className={cn('mt-3 text-2xl font-bold tabular-nums', EXPIRY_TONE[expiry.state])}>
                                {expiry.state === 'expired' ? t('account.expiredShort', '만료') : formatDday(expiry.daysLeft)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {t('account.expiresAtFull', '구독 만료일 {{date}}', { date: formatExpiryDate(expiry.expiresAt, i18n.language) })}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {subscription.isGracePeriod
                                    ? t('account.gracePeriod', '결제 유예 기간이에요. 결제 수단을 확인해 주세요.')
                                    : subscription.active
                                        ? t('account.renewNote', '자동 결제를 쓰고 있다면 이 날짜에 갱신돼요.')
                                        : t('account.inactive', '현재 구독이 활성 상태가 아니에요.')}
                            </p>
                        </>
                    )}
                </div>
            )}
            {v5 && (
                <div className="rounded-xl border border-border/50 bg-card/30 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Gauge className="h-4 w-4 text-muted-foreground" />
                        {t('account.v5.title', 'V5 생성 한도')}
                    </div>
                    <p className={cn('mt-3 text-2xl font-bold tabular-nums', v5.limited ? 'text-red-600 dark:text-red-400' : 'text-cyan-600 dark:text-cyan-400')}>
                        {v5.limited ? '−' : ''}{Math.abs(v5.percent)}%
                    </p>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn('h-full rounded-full', v5.limited ? 'bg-red-500' : 'bg-cyan-500')}
                            style={{ width: `${v5.barPercent}%` }}
                        />
                    </div>
                    <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                        {v5TooltipLines(t, v5).slice(1).map(line => <li key={line}>{line}</li>)}
                    </ul>
                </div>
            )}
        </div>
    )
}
