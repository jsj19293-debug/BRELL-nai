// 알림 모아보기: 다른 플랫폼(에덴·베이비챗·루나·엘린·네코·티팟·크랙·알플레이·젠잇)의
// 댓글·답글·좋아요·팔로우를 한 화면에서 보고, 댓글에는 바로 답글을 단다.
// 화면 구성은 NAIS3-Custom(seotk0319, GPL-3.0)의 inbox-view를 NAIS2-Forge 디자인에 맞춰 옮겼다.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
    Bell,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Loader2,
    Pause,
    Play,
    RefreshCw,
    Search,
    Send,
    Settings2,
    TriangleAlert,
    X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getInboxService } from '@/inbox'
import { INBOX_EVENT_GROUPS } from '@/inbox/shared'
import type {
    InboxEvent,
    InboxEventGroup,
    InboxItem,
    InboxPlatform,
    InboxReplyTarget,
    InboxResult,
} from '@/inbox/shared'
import {
    PLATFORM_COLORS,
    agoParts,
    bundleRows,
    dayKey,
    fullComment,
    peopleSummary,
    platformStateKey,
    untilParts,
    workNameOf,
    type InboxRow,
    type RelativeTime,
} from '@/inbox/view-model'

type View = InboxEventGroup | 'all'
const VIEWS: View[] = ['conversation', 'reaction', 'all']
const INTERVALS = [5, 15, 30, 60, 120, 360, 1440]
const REPLY_MAX = 1000

const PLATFORM_DEFAULTS: Record<InboxPlatform, string> = {
    eden: '에덴', babe: '베이비챗', luna: '루나', elyn: '엘린', neko: '네코',
    teapot: '티팟', crack: '크랙', rplay: '알플레이', genit: '젠잇',
}
const EVENT_DEFAULTS: Record<InboxEvent, string> = {
    comment: '댓글', reply: '답글', like: '좋아요', follow: '팔로우', admin: '공지', other: '기타',
}
const STATUS_DEFAULTS: Record<string, string> = {
    ok: '수집 정상', partial: '일부 수집', pending: '연결 대기', login: '계정 재연결 필요',
    error: '수집 오류', auth_required: '계정 재연결 필요', unauthorized: '계정 재연결 필요',
}
const VIEW_DEFAULTS: Record<View, string> = { conversation: '대화', reaction: '반응', all: '전체' }

const platformLabel = (t: TFunction, id: InboxPlatform): string => t(`inbox.platform.${id}`, PLATFORM_DEFAULTS[id] || id)
const eventLabel = (t: TFunction, id: InboxEvent): string => t(`inbox.event.${id}`, EVENT_DEFAULTS[id] || EVENT_DEFAULTS.other)

function relativeText(t: TFunction, locale: string, value: RelativeTime): string {
    switch (value.kind) {
        case 'none': return t('inbox.time.none', '시간 없음')
        case 'now': return t('inbox.time.now', '방금')
        case 'minutes': return t('inbox.time.minutesAgo', '{{count}}분 전', { count: value.count })
        case 'hours': return t('inbox.time.hoursAgo', '{{count}}시간 전', { count: value.count })
        case 'yesterday': return t('inbox.time.yesterday', '어제 {{time}}', { time: clock(value.at, locale) })
        case 'clock': return clock(value.at, locale)
        default: return new Date(value.at).toLocaleDateString(locale, { month: '2-digit', day: '2-digit' })
    }
}
const clock = (at: number, locale: string): string =>
    new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
function fullTime(t: TFunction, locale: string, value: string | null | undefined): string {
    const at = value ? Date.parse(value) : Number.NaN
    return Number.isFinite(at)
        ? new Date(at).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : t('inbox.time.unknown', '시간 정보 없음')
}
function dayLabel(t: TFunction, locale: string, key: ReturnType<typeof dayKey>): string {
    if (key.kind === 'none') return t('inbox.time.noDate', '날짜 없음')
    if (key.kind === 'today') return t('inbox.time.today', '오늘')
    if (key.kind === 'yesterday') return t('inbox.time.yesterdayLabel', '어제')
    return new Date(key.at).toLocaleDateString(locale, { month: 'long', day: 'numeric', weekday: 'short' })
}
const intervalLabel = (t: TFunction, minutes: number): string =>
    minutes % 60 === 0
        ? t('inbox.interval.hours', '{{count}}시간', { count: minutes / 60 })
        : t('inbox.interval.minutes', '{{count}}분', { count: minutes })

const outlineButton =
    'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40'

export default function Inbox() {
    const { t, i18n } = useTranslation()
    const locale = i18n.language
    const [data, setData] = useState<InboxResult | null>(null)
    const [platform, setPlatform] = useState('')
    const [view, setView] = useState<View>('conversation')
    const [event, setEvent] = useState('')
    const [unreadOnly, setUnreadOnly] = useState(false)
    const [unrepliedOnly, setUnrepliedOnly] = useState(false)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(0)
    const [selected, setSelected] = useState<InboxItem | null>(null)
    // 답글: 알림별 입력값. 보낸 답글은 서비스가 기록하고, 다시 읽기 전까지만 여기서 먼저 보여준다.
    const [drafts, setDrafts] = useState<Record<string, string>>({})
    const [replying, setReplying] = useState<string | null>(null)
    const [notes, setNotes] = useState<Record<string, { ok: boolean; message: string }>>({})
    const [sent, setSent] = useState<Record<string, string>>({})
    // 답글 대상 확인: 알림별로 한 번 불러와 기억한다 (크랙·네코는 시각으로 찾으므로 보여주고 보낸다).
    const [targets, setTargets] = useState<Record<string, InboxReplyTarget | 'loading'>>({})
    const requested = useRef(new Set<string>())
    const [open, setOpen] = useState<Set<string>>(new Set())
    const [settings, setSettings] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [revision, setRevision] = useState(0)
    const [busy, setBusy] = useState(false)
    const [collecting, setCollecting] = useState(false)
    // 이 화면에서 시작한 로그인 확인. 서비스도 자기 상태를 따로 알려준다.
    const [linking, setLinking] = useState<Set<string>>(new Set())
    // 상대 시각은 데이터를 받은 시점 기준으로 계산한다 (목록은 10초마다 다시 읽는다).
    const [now, setNow] = useState(() => Date.now())
    const pendingRef = useRef(false)

    const eventQuery = event || (view === 'all' ? '' : view)
    const unrepliedQuery = unrepliedOnly && view !== 'reaction'

    useEffect(() => {
        let disposed = false
        let timer: ReturnType<typeof setTimeout>
        async function refresh(): Promise<void> {
            try {
                const inbox = await getInboxService()
                const result = await inbox.query({
                    platform,
                    event: eventQuery,
                    unread: unreadOnly,
                    unreplied: unrepliedQuery,
                    search,
                    page,
                })
                if (disposed) return
                setNow(Date.now())
                setData(result)
                pendingRef.current = result.thumbnailsPending === true || result.repliesPending === true
                setError(result.error || '')
                setSelected(previous => (previous ? result.items.find(item => item.id === previous.id) || null : null))
            } catch {
                if (!disposed) setError(t('inbox.error.load', '알림을 불러오지 못했어요. 잠시 뒤 다시 확인해주세요.'))
            }
            // 작품 이미지나 사이트 답글을 뒤에서 확인하는 중이면 조금 일찍 다시 읽어 바로 채운다.
            if (!disposed) timer = setTimeout(() => void refresh(), pendingRef.current ? 3_000 : 10_000)
        }
        timer = setTimeout(() => void refresh(), search ? 180 : 0)
        return () => {
            disposed = true
            clearTimeout(timer)
        }
    }, [platform, eventQuery, unreadOnly, unrepliedQuery, search, page, revision, t])

    const replyTarget = selected ? targets[selected.id] : undefined
    const comment = selected ? fullComment(selected.body, replyTarget) : null
    const selectedId = selected?.canReply ? selected.id : null
    useEffect(() => {
        if (!selectedId || requested.current.has(selectedId)) return
        requested.current.add(selectedId)
        setTargets(previous => ({ ...previous, [selectedId]: 'loading' }))
        void getInboxService()
            .then(inbox => inbox.previewReply(selectedId))
            .catch((): InboxReplyTarget => ({ ok: false, message: t('inbox.reply.targetFailed', '원래 댓글을 불러오지 못했어요.') }))
            .then(result => {
                // 실패는 다시 열었을 때 한 번 더 시도할 수 있게 둔다.
                if (!result.ok) requested.current.delete(selectedId)
                setTargets(previous => ({ ...previous, [selectedId]: result }))
            })
    }, [selectedId, t])

    const repliedOf = (item: InboxItem): { content: string; at: string | null; via: string } | null =>
        item.replied ?? (sent[item.id] ? { content: sent[item.id], at: null, via: 'app' } : null)
    const replyText = selected ? drafts[selected.id] || '' : ''
    const replyNote = selected ? notes[selected.id] || null : null
    const replyReady = !!(replyTarget && replyTarget !== 'loading' && replyTarget.ok)

    async function sendReply(item: InboxItem): Promise<void> {
        const content = (drafts[item.id] || '').trim()
        const target = targets[item.id]
        if (!content || replying || !target || target === 'loading' || !target.ok) return
        setReplying(item.id)
        setNotes(previous => {
            const next = { ...previous }
            delete next[item.id]
            return next
        })
        try {
            const result = await (await getInboxService()).reply(item.id, content)
            setNotes(previous => ({ ...previous, [item.id]: result }))
            if (result.ok) {
                setSent(previous => ({ ...previous, [item.id]: content }))
                setDrafts(previous => ({ ...previous, [item.id]: '' }))
                setRevision(value => value + 1)
            }
        } catch {
            setNotes(previous => ({
                ...previous,
                [item.id]: { ok: false, message: t('inbox.reply.failed', '답글을 달지 못했어요. 잠시 뒤 다시 해주세요.') },
            }))
        } finally {
            setReplying(null)
        }
    }

    const totalPages = data ? Math.max(1, Math.ceil(data.filtered / data.pageSize)) : 1
    const latest = data?.platforms.map(p => p.lastSuccess).filter((v): v is string => !!v).sort().at(-1) || null
    const broken = (data?.platforms || []).filter(p => p.selected && ['error', 'login'].includes(p.status))
    // 앱이 스스로 갱신할 수 있는 토큰은 보여주기만 하고 경고로 만들지 않는다.
    const expiring = (data?.platforms || []).filter(
        p => !broken.includes(p) && p.expiresAt !== null &&
            Date.parse(p.expiresAt) - now < 10 * 60_000 && Date.parse(p.expiresAt) - now > -3_600_000,
    )
    const preserved = broken.reduce((total, p) => total + p.count, 0)
    const tally = (group: View): number =>
        data
            ? (group === 'all'
                ? (Object.keys(EVENT_DEFAULTS) as InboxEvent[])
                : (INBOX_EVENT_GROUPS[group] as readonly InboxEvent[])
            ).reduce((total, id) => total + data.events[id], 0)
            : 0
    const subEvents = view === 'all' ? [] : (INBOX_EVENT_GROUPS[view] as readonly InboxEvent[])

    // 최신순으로 오므로 날짜가 바뀔 때마다 새 묶음이 시작된다.
    const days: { label: string; rows: InboxRow[] }[] = []
    {
        const grouped: { label: string; items: InboxItem[] }[] = []
        for (const item of data?.items || []) {
            const label = dayLabel(t, locale, dayKey(item.at, now))
            const last = grouped.at(-1)
            if (last && last.label === label) last.items.push(item)
            else grouped.push({ label, items: [item] })
        }
        for (const day of grouped) days.push({ label: day.label, rows: bundleRows(day.items) })
    }

    function reset(next: () => void): void {
        next()
        setPage(0)
        setSelected(null)
        setOpen(new Set())
    }
    function toggleOpen(key: string): void {
        setOpen(previous => {
            const next = new Set(previous)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }
    async function toggleCollection(): Promise<void> {
        if (!data || busy) return
        setBusy(true)
        try {
            await (await getInboxService()).control(!data.enabled)
            setRevision(value => value + 1)
        } catch {
            setError(t('inbox.error.control', '수집 설정을 바꾸지 못했어요.'))
        } finally {
            setBusy(false)
        }
    }
    async function collectNow(): Promise<void> {
        if (collecting) return
        setCollecting(true)
        try {
            await (await getInboxService()).collectNow()
        } catch {
            /* 플랫폼별 오류는 목록의 상태로 보인다 */
        } finally {
            setCollecting(false)
            setRevision(value => value + 1)
        }
    }
    // 로그인은 브라우저에서 몇 분이 걸릴 수 있어서 플랫폼마다 따로 확인 상태를 둔다.
    async function link(id: string, label: string): Promise<void> {
        setLinking(previous => new Set(previous).add(id))
        setMessage(t('inbox.connect.checking', '{{label}} 로그인 상태를 확인하고 있어요. 크롬 창이 잠깐 열릴 수 있어요.', { label }))
        try {
            const result = await (await getInboxService()).connect(id)
            setMessage(label + ': ' + result.message)
        } catch {
            setMessage(t('inbox.connect.failed', '{{label}} 연결을 확인하지 못했어요.', { label }))
        } finally {
            setLinking(previous => {
                const next = new Set(previous)
                next.delete(id)
                return next
            })
            setRevision(value => value + 1)
        }
    }
    async function unlink(id: string, label: string): Promise<void> {
        try {
            await (await getInboxService()).disconnect(id)
            setMessage(t('inbox.connect.removed', '{{label}} 로그인 정보를 앱에서 지웠어요. 이미 모은 알림은 그대로예요.', { label }))
        } catch {
            setMessage(t('inbox.connect.removeFailed', '{{label}} 연결을 해제하지 못했어요.', { label }))
        }
        setRevision(value => value + 1)
    }
    async function selectPlatform(id: string, checked: boolean): Promise<void> {
        try {
            await (await getInboxService()).select(id, checked)
            if (!checked && platform === id) reset(() => setPlatform(''))
        } catch {
            setMessage(t('inbox.error.select', '모아보기 설정을 바꾸지 못했어요.'))
        }
        setRevision(value => value + 1)
    }
    async function openSource(item: InboxItem): Promise<void> {
        try {
            await openUrl(await (await getInboxService()).sourceUrl(item.id))
        } catch {
            setError(t('inbox.error.open', '이 알림의 원문 주소를 열지 못했어요.'))
        }
    }
    async function changeInterval(minutes: number): Promise<void> {
        setBusy(true)
        try {
            const result = await (await getInboxService()).setInterval(minutes)
            setData(previous => (previous ? { ...previous, ...result } : previous))
            setMessage(t('inbox.interval.saved', '수집 주기를 {{interval}}으로 저장했어요.', { interval: intervalLabel(t, minutes) }))
            setRevision(value => value + 1)
        } catch {
            setError(t('inbox.error.interval', '수집 주기를 저장하지 못했어요.'))
        } finally {
            setBusy(false)
        }
    }

    function renderItem(item: InboxItem, nested = false) {
        const unread = item.unread === true
        const actor = item.actor?.name || null
        // 본문이 비면 작성자 이름을 본문처럼 보여주지 않는다.
        const body = item.body && item.body !== actor && item.body !== item.title ? item.body : null
        // 제목이 이미 작품을 인용하면(「작품」 댓글) 오른쪽에 또 쓰지 않는다.
        const work = item.work?.title && !item.title.includes(item.work.title) ? item.work.title : null
        return (
            <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className={cn(
                    'relative flex w-full items-start gap-3 border-b border-border/60 py-2.5 pr-4 text-left transition-colors [contain-intrinsic-size:auto_64px] [content-visibility:auto] last:border-b-0',
                    nested ? 'pl-9' : 'pl-5',
                    selected?.id === item.id ? 'bg-primary/10' : 'hover:bg-muted/50',
                )}
            >
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: PLATFORM_COLORS[item.platform] }} />
                <WorkThumb item={item} label={platformLabel(t, item.platform)} className="mt-0.5 h-9 w-9 shrink-0 rounded-lg text-[13px]" />
                <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                        {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label={t('inbox.unread', '안 읽음')} />}
                        <span className={cn('truncate text-[13.5px] leading-snug', unread ? 'font-semibold text-foreground' : 'text-foreground/85')}>
                            {item.title}
                        </span>
                        {repliedOf(item) && (
                            <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-px text-[11px] font-semibold text-primary">
                                {t('inbox.reply.done', '답글 완료')}
                            </span>
                        )}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-xs leading-snug text-muted-foreground">
                        <span className="shrink-0 font-medium" style={{ color: PLATFORM_COLORS[item.platform] }}>{platformLabel(t, item.platform)}</span>
                        <Dot />
                        <span className="shrink-0">{eventLabel(t, item.event)}</span>
                        {actor && (<><Dot /><span className="max-w-40 shrink-0 truncate text-foreground/70">{actor}</span></>)}
                        {body && (<><Dot /><span className="min-w-0 truncate">{body}</span></>)}
                    </span>
                </span>
                <span className="flex max-w-[34%] shrink-0 flex-col items-end gap-0.5 pt-px text-right">
                    <span className="text-[11.5px] tabular-nums text-muted-foreground">{relativeText(t, locale, agoParts(item.at, now))}</span>
                    {work && <span className="max-w-full truncate text-[11px] text-muted-foreground/70">{work}</span>}
                </span>
            </button>
        )
    }

    function renderBundle(row: Extract<InboxRow, { kind: 'bundle' }>) {
        const lead = row.items[0]
        const expanded = open.has(row.key)
        const unread = row.items.some(item => item.unread === true)
        const people = peopleSummary(row.items)
        return (
            <div key={row.key} className="[contain-intrinsic-size:auto_64px] [content-visibility:auto]">
                <button
                    type="button"
                    onClick={() => toggleOpen(row.key)}
                    aria-expanded={expanded}
                    className="relative flex w-full items-start gap-3 border-b border-border/60 py-2.5 pl-5 pr-4 text-left transition-colors hover:bg-muted/50"
                >
                    <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: PLATFORM_COLORS[lead.platform] }} />
                    <WorkThumb item={lead} label={platformLabel(t, lead.platform)} className="mt-0.5 h-9 w-9 shrink-0 rounded-lg text-[13px]" />
                    <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                            {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-label={t('inbox.unread', '안 읽음')} />}
                            <span className={cn('truncate text-[13.5px] leading-snug', unread ? 'font-semibold text-foreground' : 'text-foreground/85')}>{lead.title}</span>
                            <span className="shrink-0 rounded-md bg-muted px-1.5 py-px text-[11px] font-medium tabular-nums text-muted-foreground">{row.items.length}</span>
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-xs leading-snug text-muted-foreground">
                            <span className="shrink-0 font-medium" style={{ color: PLATFORM_COLORS[lead.platform] }}>{platformLabel(t, lead.platform)}</span>
                            <Dot />
                            <span className="shrink-0">{eventLabel(t, lead.event)}</span>
                            <Dot />
                            <span className="min-w-0 truncate text-foreground/70">
                                {people.names
                                    ? people.rest > 0
                                        ? t('inbox.people.more', '{{names}} 외 {{count}}명', { names: people.names, count: people.rest })
                                        : people.names
                                    : t('inbox.people.count', '{{count}}명', { count: people.total })}
                            </span>
                        </span>
                    </span>
                    <span className="flex max-w-[34%] shrink-0 items-center gap-2 pt-px text-right">
                        <span className="text-[11.5px] tabular-nums text-muted-foreground">{relativeText(t, locale, agoParts(lead.at, now))}</span>
                        <ChevronDown aria-hidden className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                    </span>
                </button>
                {expanded && <div className="bg-muted/30">{row.items.map(item => renderItem(item, true))}</div>}
            </div>
        )
    }

    const nextCollection = untilParts(data?.nextCollectionAt, now)

    return (
        <section className="flex h-full min-w-0 overflow-hidden" aria-label={t('inbox.title', '알림 모아보기')}>
            <aside className="flex w-48 shrink-0 flex-col border-r border-border/60 bg-background/40 p-3 xl:w-56">
                <h2 className="mb-4 flex items-center gap-2 px-2 pt-2 text-sm font-semibold">
                    <Bell className="h-4 w-4" /> {t('inbox.platforms', '플랫폼')}
                </h2>
                <button
                    type="button"
                    onClick={() => reset(() => setPlatform(''))}
                    className={cn(
                        'mb-2 flex items-center justify-between rounded-lg px-3 py-2.5 text-[13px]',
                        !platform ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted',
                    )}
                >
                    <span>{t('inbox.allPlatforms', '전체 플랫폼')}</span>
                    <span className="tabular-nums">{data?.total.toLocaleString() || '0'}</span>
                </button>
                <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                    {(data?.platforms || []).filter(p => p.selected).map(p => {
                        const trouble = ['error', 'login'].includes(p.status)
                        const soon = expiring.includes(p)
                        const status = t(`inbox.status.${p.status}`, STATUS_DEFAULTS[p.status] || p.status)
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => reset(() => setPlatform(p.id))}
                                title={`${status} · ${t('inbox.lastSuccess', '마지막 성공')} ${fullTime(t, locale, p.lastSuccess)}`}
                                className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs', platform === p.id ? 'bg-primary/10' : 'hover:bg-muted')}
                            >
                                <span aria-hidden className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p.id] }} />
                                <span className="min-w-0 flex-1">
                                    <span className={cn('block truncate text-[12.5px] font-medium', platform === p.id ? 'text-primary' : 'text-foreground')}>{platformLabel(t, p.id)}</span>
                                    {trouble && <span className="mt-0.5 block truncate text-[10.5px] font-medium text-destructive">{status}</span>}
                                    {!trouble && soon && (
                                        <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
                                            {p.canRenew ? t('inbox.renewSoon', '곧 자동 갱신') : t('inbox.expireSoon', '인증 곧 만료')}
                                        </span>
                                    )}
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">{p.count.toLocaleString()}</span>
                            </button>
                        )
                    })}
                </div>
                <p className="mt-3 px-2 text-[11px] leading-relaxed text-muted-foreground/80">
                    {t('inbox.note', '로그인한 계정의 알림을 모아요. 원본 사이트의 읽음 상태는 바꾸지 않아요.')}
                </p>
            </aside>

            <main className="flex min-w-0 flex-1 flex-col gap-3 p-5">
                <header className="flex flex-wrap items-center gap-3">
                    <h1 className="mr-auto text-xl font-semibold tracking-tight">{t('inbox.title', '알림 모아보기')}</h1>
                    <div className="flex w-64 items-center gap-2 rounded-lg border border-border bg-background/60 px-3">
                        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <input
                            value={search}
                            onChange={e => {
                                const value = e.target.value
                                reset(() => setSearch(value))
                            }}
                            placeholder={t('inbox.searchPlaceholder', '작품, 작성자, 내용 검색')}
                            aria-label={t('inbox.search', '알림 검색')}
                            className="min-w-0 flex-1 bg-transparent py-2 text-[13px] outline-none"
                        />
                        {search && (
                            <button type="button" aria-label={t('inbox.clearSearch', '검색어 지우기')} onClick={() => reset(() => setSearch(''))}>
                                <X className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                        )}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        {t('inbox.interval.label', '수집 주기')}
                        <select
                            aria-label={t('inbox.interval.label', '수집 주기')}
                            value={data?.intervalMinutes ?? 60}
                            disabled={!data?.available || busy}
                            onChange={e => void changeInterval(Number(e.target.value))}
                            className="rounded-lg border border-border bg-background px-2 py-2 text-foreground disabled:opacity-40"
                        >
                            {INTERVALS.map(minutes => <option key={minutes} value={minutes}>{intervalLabel(t, minutes)}</option>)}
                        </select>
                    </label>
                    <button type="button" className={outlineButton} disabled={!data?.available || collecting} onClick={() => void collectNow()}>
                        {collecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        {t('inbox.collectNow', '지금 수집')}
                    </button>
                    <button type="button" className={outlineButton} onClick={() => setSettings(value => !value)}>
                        <Settings2 className="h-3.5 w-3.5" /> {t('inbox.connections', '연결 관리')}
                    </button>
                </header>

                {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</div>}
                {!!broken.length && (
                    <div role="status" className="flex items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3">
                        <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" />
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-foreground">
                                {t('inbox.broken.title', '{{names}}에서 새 알림을 못 받고 있어요', { names: broken.map(p => platformLabel(t, p.id)).join(', ') })}
                            </p>
                            <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                                {t('inbox.broken.kept', '이미 저장한 {{n}}건은 그대로 볼 수 있어요', { n: preserved.toLocaleString() })}
                                {broken[0].detail ? ` · ${describeDetail(t, broken[0].detail)}` : ''}
                            </p>
                        </div>
                        <button type="button" onClick={() => setSettings(true)} className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                            {t('inbox.connections', '연결 관리')}
                        </button>
                    </div>
                )}
                {settings && (
                    <div className="max-h-[55%] shrink-0 overflow-y-auto rounded-lg border border-border bg-background/60 p-4 text-xs">
                        <div className="mb-2 flex items-center justify-between">
                            <strong>{t('inbox.connect.title', '플랫폼 연결')}</strong>
                            <button type="button" aria-label={t('inbox.connect.close', '연결 관리 닫기')} onClick={() => setSettings(false)}>
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <p className="leading-relaxed text-muted-foreground">
                            {t('inbox.connect.help', '플랫폼마다 한 번 로그인하면 앱이 직접 알림을 모아요. 로그인 창은 크롬(없으면 엣지)으로 열리고, 이 앱 전용 프로필이라 평소 쓰는 크롬과 섞이지 않아요. 로그인한 뒤 그 창을 닫으면 앱이 연결을 마쳐요. 체크를 끈 플랫폼은 모으지도, 목록에 보여주지도 않아요.')}
                        </p>
                        {data?.directError && <p className="mt-2 text-destructive">{data.directError}</p>}
                        <ul className="mt-3 divide-y divide-border/60 rounded-lg border border-border/60">
                            {(data?.platforms || []).map(p => {
                                const label = platformLabel(t, p.id)
                                const checking = linking.has(p.id) || p.connecting
                                const relogin = p.appConnected && p.status === 'login'
                                const stateKey = platformStateKey({ ...p, checking })
                                const state = stateKey === 'checking'
                                    ? t('inbox.state.checking', '로그인 상태를 확인하고 있어요…')
                                    : stateKey === 'windowOpen'
                                        ? t('inbox.state.windowOpen', '로그인한 뒤 창을 닫으면 알아서 연결돼요')
                                        : stateKey === 'windowClosed'
                                            ? t('inbox.state.windowClosed', '로그인 창이 닫혔어요. 로그인했다면 ‘로그인 완료’를 눌러주세요')
                                            : stateKey === 'relogin'
                                                ? t('inbox.state.relogin', '다시 로그인이 필요해요')
                                                : stateKey === 'connected'
                                                    ? [
                                                        t('inbox.state.connected', '연결됨'),
                                                        p.lastAttempt ? t('inbox.state.checkedAgo', '{{time}} 확인', { time: relativeText(t, locale, agoParts(p.lastAttempt, now)) }) : '',
                                                        p.lastAttempt ? (p.lastNewAt ? t('inbox.state.newAgo', '새 알림 {{time}}', { time: relativeText(t, locale, agoParts(p.lastNewAt, now)) }) : t('inbox.state.noNew', '새 알림 없음')) : '',
                                                    ].filter(Boolean).join(' · ')
                                                    : t('inbox.state.disconnected', '연결 안 됨')
                                const failed = p.appConnected && !checking && p.status === 'error' && p.detail
                                return (
                                    <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                                        <input
                                            type="checkbox"
                                            checked={p.selected}
                                            onChange={e => void selectPlatform(p.id, e.target.checked)}
                                            aria-label={t('inbox.connect.include', '{{label}} 모아보기', { label })}
                                            className="h-3.5 w-3.5 shrink-0 accent-primary"
                                        />
                                        <span aria-hidden className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: PLATFORM_COLORS[p.id] }} />
                                        <span className="w-16 shrink-0 font-medium text-foreground">{label}</span>
                                        <span className={cn('min-w-0 flex-1 truncate', relogin || failed ? 'text-destructive' : 'text-muted-foreground')} title={failed ? String(p.detail) : undefined}>
                                            {failed ? `${state} · ${describeDetail(t, String(p.detail))}` : state}
                                        </span>
                                        {p.appConnected && !checking && !p.awaitingLogin && (
                                            <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => void unlink(p.id, label)}>
                                                {t('inbox.connect.disconnect', '해제')}
                                            </button>
                                        )}
                                        <button type="button" className={outlineButton} disabled={checking || !data?.available} onClick={() => void link(p.id, label)}>
                                            {p.awaitingLogin
                                                ? t('inbox.connect.done', '로그인 완료')
                                                : relogin
                                                    ? t('inbox.connect.relogin', '다시 로그인')
                                                    : p.appConnected
                                                        ? t('inbox.connect.reconnect', '다시 연결')
                                                        : t('inbox.connect.login', '로그인')}
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                        <div className="mt-3 flex items-center gap-2">
                            <button type="button" className={outlineButton} disabled={!data?.available || busy} onClick={() => void toggleCollection()}>
                                {data?.enabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                {data?.enabled ? t('inbox.pause', '수집 일시정지') : t('inbox.resume', '수집 재개')}
                            </button>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={message}>{message}</span>
                        </div>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div role="tablist" aria-label={t('inbox.kind', '알림 종류')} className="inline-flex rounded-lg border border-border bg-muted/60 p-0.5">
                        {VIEWS.map(id => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={view === id}
                                onClick={() => reset(() => { setView(id); setEvent('') })}
                                className={cn('rounded-md px-3 py-1.5 text-[12.5px] transition-colors', view === id ? 'bg-background font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                            >
                                {t(`inbox.view.${id}`, VIEW_DEFAULTS[id])}
                                <span className="ml-1.5 tabular-nums text-muted-foreground/70">{tally(id).toLocaleString()}</span>
                            </button>
                        ))}
                    </div>
                    {subEvents.length > 1 && (
                        <div className="flex items-center gap-0.5">
                            {(['', ...subEvents] as ('' | InboxEvent)[]).map(id => (
                                <button
                                    key={id || 'any'}
                                    type="button"
                                    onClick={() => reset(() => setEvent(id))}
                                    className={cn('rounded-md px-2 py-1 text-xs transition-colors', event === id ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground')}
                                >
                                    {id ? eventLabel(t, id) : t('inbox.any', '모두')}
                                    {id && data ? <span className="ml-1 tabular-nums text-muted-foreground/70">{data.events[id].toLocaleString()}</span> : null}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                        {view !== 'reaction' && (
                            <FilterSwitch label={t('inbox.unrepliedOnly', '답글 안 단 것만')} on={unrepliedOnly} onToggle={() => reset(() => setUnrepliedOnly(value => !value))} />
                        )}
                        <FilterSwitch label={t('inbox.unreadOnly', '안 읽은 것만')} on={unreadOnly} onToggle={() => reset(() => setUnreadOnly(value => !value))} />
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-background/60" aria-label={t('inbox.list', '알림 목록')}>
                    {!data ? (
                        <p className="p-10 text-center text-[13px] text-muted-foreground">{t('inbox.loading', '알림을 불러오는 중이에요…')}</p>
                    ) : !data.items.length ? (
                        <p className="p-10 text-center text-[13px] text-muted-foreground">
                            {!data.total
                                ? data.platforms.some(p => p.appConnected)
                                    ? t('inbox.empty.waiting', '연결된 계정의 첫 알림을 기다리고 있어요.')
                                    : t('inbox.empty.connect', '오른쪽 위 ‘연결 관리’에서 플랫폼에 로그인하면 알림이 모여요.')
                                : unrepliedQuery
                                    ? t('inbox.empty.unreplied', '답글을 기다리는 댓글이 없어요.')
                                    : unreadOnly
                                        ? t('inbox.empty.unread', '안 읽은 알림이 없어요.')
                                        : t('inbox.empty.filtered', '조건에 맞는 알림이 없어요.')}
                        </p>
                    ) : (
                        days.map(day => (
                            <section key={day.label} aria-label={day.label}>
                                <h3 className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-5 py-1.5 text-[11px] font-semibold text-muted-foreground backdrop-blur">{day.label}</h3>
                                {day.rows.map(row => (row.kind === 'bundle' ? renderBundle(row) : renderItem(row.item)))}
                            </section>
                        ))
                    )}
                </div>

                <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">
                        {t('inbox.count', '{{n}}건', { n: (data?.filtered || 0).toLocaleString() })}
                        {data?.unread && !unreadOnly ? ` · ${t('inbox.unreadCount', '안 읽음 {{n}}', { n: data.unread.toLocaleString() })}` : ''}
                    </span>
                    <span className="tabular-nums text-muted-foreground/80">
                        {data?.collectorOnline
                            ? data.enabled
                                ? [
                                    t('inbox.lastCollected', '마지막 수집 {{time}}', { time: relativeText(t, locale, agoParts(latest, now)) }),
                                    data.collecting
                                        ? t('inbox.collecting', '수집 중')
                                        : nextCollection.kind === 'soon'
                                            ? t('inbox.nextSoon', '다음 곧')
                                            : nextCollection.kind === 'minutes'
                                                ? t('inbox.nextMinutes', '다음 {{count}}분 후', { count: nextCollection.count })
                                                : nextCollection.kind === 'clock'
                                                    ? t('inbox.nextAt', '다음 {{time}}', { time: clock(nextCollection.at, locale) })
                                                    : '',
                                ].filter(Boolean).join(' · ')
                                : t('inbox.paused', '자동 수집 일시정지')
                            : t('inbox.collectorWaiting', '연결된 플랫폼 없음')}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <button
                            type="button"
                            className={outlineButton}
                            aria-label={t('inbox.prevPage', '이전 알림 페이지')}
                            disabled={!data || data.page === 0}
                            onClick={() => { setPage(Math.max(0, (data?.page || 0) - 1)); setSelected(null); setOpen(new Set()) }}
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="tabular-nums">{(data?.page || 0) + 1} / {totalPages}</span>
                        <button
                            type="button"
                            className={outlineButton}
                            aria-label={t('inbox.nextPage', '다음 알림 페이지')}
                            disabled={!data || data.page + 1 >= totalPages}
                            onClick={() => { setPage((data?.page || 0) + 1); setSelected(null); setOpen(new Set()) }}
                        >
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </footer>
            </main>

            {selected && (
                <aside className="flex w-[clamp(320px,28vw,460px)] shrink-0 flex-col border-l border-border/60 bg-background/40" aria-label={t('inbox.detail', '알림 상세')}>
                    <header className="flex shrink-0 items-center gap-1 pb-2.5 pl-5 pr-3.5 pt-3.5">
                        <h2 className="mr-auto text-[15px] font-semibold">{t('inbox.detail', '알림 상세')}</h2>
                        <button
                            type="button"
                            aria-label={t('inbox.openSource', '원문에서 보기')}
                            title={t('inbox.openSourceHint', '원문에서 보기 (사이트에서 읽음 처리될 수 있어요)')}
                            disabled={!selected.url}
                            onClick={() => void openSource(selected)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                        >
                            <ExternalLink className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            aria-label={t('inbox.closeDetail', '알림 상세 닫기')}
                            onClick={() => setSelected(null)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </header>
                    <div className="mx-5 flex shrink-0 items-center gap-3 border-b border-border/60 pb-3.5">
                        <WorkThumb item={selected} label={platformLabel(t, selected.platform)} className="h-12 w-12 shrink-0 rounded-xl text-lg" />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{workNameOf(selected) || selected.title}</p>
                            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                                <span className="shrink-0 font-medium" style={{ color: PLATFORM_COLORS[selected.platform] }}>{platformLabel(t, selected.platform)}</span>
                                <Dot />
                                <span className="shrink-0">{eventLabel(t, selected.event)}</span>
                                <Dot />
                                <span className="truncate">{fullTime(t, locale, selected.at)}</span>
                                {selected.unread !== null && (<><Dot /><span className="shrink-0">{selected.unread ? t('inbox.unread', '안 읽음') : t('inbox.read', '읽음')}</span></>)}
                            </p>
                        </div>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4" data-allow-context-menu>
                        {/* 작품 이름이 없으면 위 머리 줄이 이미 제목을 보여준다 */}
                        {!selected.canReply && workNameOf(selected) && <h3 className="text-[15px] font-semibold leading-snug">{selected.title}</h3>}
                        {(selected.canReply || !!(comment?.text ?? selected.body)) && (
                            <div className="shrink-0">
                                {selected.canReply && (
                                    <p className="text-xs font-semibold text-foreground">
                                        {(replyTarget && replyTarget !== 'loading' && replyTarget.ok ? replyTarget.author : null) || selected.actor?.name || t('inbox.unknownAuthor', '작성자 미확인')}
                                        <span className="ml-1.5 font-normal text-muted-foreground">{fullTime(t, locale, selected.at)}</span>
                                    </p>
                                )}
                                <p className="mt-1.5 select-text whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-[13.5px] leading-relaxed">
                                    {comment?.text ?? selected.body}
                                </p>
                            </div>
                        )}
                        {selected.canReply && (
                            replyTarget === undefined || replyTarget === 'loading' ? (
                                <p className="text-[11.5px] text-muted-foreground">{t('inbox.reply.finding', '원래 댓글을 찾고 있어요…')}</p>
                            ) : !replyTarget.ok ? (
                                <p className="rounded-xl bg-destructive/10 px-3 py-2.5 text-xs text-destructive">{replyTarget.message}</p>
                            ) : comment?.merged || !replyTarget.content?.trim() ? null : (
                                // 알림 본문과 다른 댓글(답글 알림의 부모 등)에 답글을 다는 경우 그 댓글을 따로 보여준다.
                                <div className="shrink-0 rounded-xl border border-border px-3 py-2.5 text-xs">
                                    <p className="text-[11px] font-medium text-muted-foreground">{t('inbox.reply.target', '답글 달 댓글')}</p>
                                    <p className="mt-1 font-semibold text-foreground">
                                        {replyTarget.author || t('inbox.unknownAuthor', '작성자 미확인')}
                                        <span className="ml-1.5 font-normal text-muted-foreground">{fullTime(t, locale, replyTarget.at ?? null)}</span>
                                    </p>
                                    <p className="mt-1 select-text whitespace-pre-wrap break-words leading-relaxed">{replyTarget.content}</p>
                                </div>
                            )
                        )}
                        {(() => {
                            const mine = repliedOf(selected)
                            return mine ? (
                                <div className="ml-auto max-w-[88%] shrink-0 text-right">
                                    <p className="flex items-center justify-end gap-1 text-xs font-semibold text-primary">
                                        <Check className="h-3 w-3 shrink-0" /> {t('inbox.reply.mine', '내 답글')}
                                        <span className="ml-1 font-normal text-muted-foreground">
                                            {mine.via === 'site'
                                                ? t('inbox.reply.viaSite', '{{label}}에서', { label: platformLabel(t, selected.platform) })
                                                : t('inbox.reply.viaApp', '앱에서')}
                                            {' · '}
                                            {mine.at ? relativeText(t, locale, agoParts(mine.at, now)) : t('inbox.time.now', '방금')}
                                        </span>
                                    </p>
                                    <p className="mt-1.5 select-text whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary/10 px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed">{mine.content}</p>
                                </div>
                            ) : null
                        })()}
                    </div>
                    {selected.canReply && (
                        <div className="shrink-0 border-t border-border/60 px-5 pt-3">
                            <div className="flex items-end gap-2">
                                <textarea
                                    value={replyText}
                                    maxLength={REPLY_MAX}
                                    rows={3}
                                    disabled={!replyReady || replying === selected.id}
                                    onChange={e => {
                                        const value = e.target.value
                                        setDrafts(previous => ({ ...previous, [selected.id]: value }))
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
                                            e.preventDefault()
                                            void sendReply(selected)
                                        }
                                    }}
                                    placeholder={repliedOf(selected)
                                        ? t('inbox.reply.again', '한 번 더 답글 달기')
                                        : selected.actor?.name
                                            ? t('inbox.reply.to', '{{name}}님에게 답글', { name: selected.actor.name })
                                            : t('inbox.reply.write', '답글 쓰기')}
                                    className="min-h-[72px] min-w-0 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-[13.5px] leading-relaxed outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                                />
                                <button
                                    type="button"
                                    aria-label={t('inbox.reply.send', '답글 보내기')}
                                    disabled={!replyReady || !replyText.trim() || replying === selected.id}
                                    onClick={() => void sendReply(selected)}
                                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                                >
                                    {replying === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </button>
                            </div>
                            <p className="mt-1 text-right text-[10.5px] tabular-nums text-muted-foreground/70">{replyText.length} / {REPLY_MAX}</p>
                        </div>
                    )}
                    <p className={cn('shrink-0 px-5 pb-3 pt-1 text-[11px] leading-relaxed', replyNote ? (replyNote.ok ? 'text-primary' : 'text-destructive') : 'text-muted-foreground/80')}>
                        {replyNote
                            ? replyNote.message
                            : selected.canReply
                                ? t('inbox.reply.hint', 'Ctrl+Enter로 보내요 · 원문을 열면 사이트에서 읽음 처리될 수 있어요')
                                : t('inbox.sourceHint', '원문을 열면 해당 사이트의 동작에 따라 읽음 처리될 수 있어요.')}
                    </p>
                </aside>
            )}
        </section>
    )
}

/** 수집 오류의 기술적인 내용을 사람이 할 수 있는 일로 바꿔 보여준다. 모르는 오류는 앞부분만 보여준다. */
function describeDetail(t: TFunction, detail: string): string {
    if (detail.includes('BOT_CHALLENGE')) return t('inbox.detailText.botChallenge', '사이트의 보안 확인(봇 차단)에 막혔어요. 이 플랫폼은 앱에서 직접 읽지 못할 수 있어요.')
    if (detail.includes('NETWORK_ERROR')) return t('inbox.detailText.network', '네트워크에 연결하지 못했어요.')
    if (detail.includes('UNEXPECTED_REDIRECT')) return t('inbox.detailText.redirect', '로그인 페이지로 이동됐어요. 다시 로그인해 주세요.')
    if (detail.includes('SESSION_EXPIRED')) return t('inbox.detailText.expired', '로그인이 만료됐어요.')
    return detail.slice(0, 80)
}

function Dot() {
    return <span aria-hidden className="text-muted-foreground/60">·</span>
}

function FilterSwitch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={onToggle}
            className={cn('inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors', on ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:text-foreground')}
        >
            <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', on ? 'bg-primary' : 'bg-muted-foreground/50')} />
            {label}
        </button>
    )
}

/**
 * 작품 썸네일 한 칸. 원본 비율이 달라도 틀 하나에 꽉 채워 자르고, 세로 그림은 얼굴이 있는 위쪽을 기준으로 자른다.
 * 이미지가 없거나 못 불러오면 플랫폼 색 바탕에 작품 첫 글자를 둔다.
 */
function WorkThumb({ item, label, className }: { item: InboxItem; label: string; className: string }) {
    const [failed, setFailed] = useState<string | null>(null)
    const src = item.thumbnail && failed !== item.thumbnail ? item.thumbnail : null
    if (src) {
        return (
            <img
                decoding="async"
                loading="lazy"
                referrerPolicy="no-referrer"
                src={src}
                alt=""
                draggable={false}
                onError={() => setFailed(src)}
                className={cn('bg-muted object-cover object-[center_20%]', className)}
            />
        )
    }
    const letter = (workNameOf(item) || label || '?').trim().replace(/^re:\s*/i, '').charAt(0)
    return (
        <span
            aria-hidden
            className={cn('grid place-items-center font-bold text-white', className)}
            style={{ backgroundColor: `color-mix(in oklab, ${PLATFORM_COLORS[item.platform]} 78%, black)` }}
        >
            {letter}
        </span>
    )
}
