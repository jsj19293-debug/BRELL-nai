// 알림 화면의 표시용 계산 (React 없이). 묶기·상대 시각 규칙은 NAIS3-Custom(seotk0319, GPL-3.0)의
// inbox-view와 같고, 문구는 화면에서 번역 문자열로 조립하도록 값만 돌려준다.
import { INBOX_EVENT_GROUPS } from './shared.ts'
import type { InboxEvent, InboxItem, InboxPlatform, InboxReplyTarget } from './shared.ts'

// 서로 구분되는 아홉 색. 점 하나 크기에서도 플랫폼이 섞여 보이지 않게 골랐다.
export const PLATFORM_COLORS: Record<InboxPlatform, string> = {
  crack: '#d95d3e',
  neko: '#d99b1f',
  genit: '#8aa320',
  elyn: '#4ca455',
  babe: '#17a398',
  eden: '#3f8fd6',
  rplay: '#3b4fb8',
  teapot: '#8a5fd6',
  luna: '#d65b9e'
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const parsed = (value: string | null | undefined): number | null =>
  value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null
const sameDay = (a: number, b: number): boolean => new Date(a).toDateString() === new Date(b).toDateString()
const dayBefore = (at: number): number => at - 24 * HOUR

export type RelativeTime =
  | { kind: 'none' }
  | { kind: 'now' }
  | { kind: 'minutes'; count: number }
  | { kind: 'hours'; count: number }
  | { kind: 'yesterday'; at: number }
  /** 미래 시각(시계 차이) — 시각만 보여준다 */
  | { kind: 'clock'; at: number }
  | { kind: 'date'; at: number }

// 최근 알림은 "얼마 전"이 날짜보다 빨리 읽힌다. 오래된 것은 날짜로 돌아간다.
export function agoParts(value: string | null | undefined, now: number): RelativeTime {
  const at = parsed(value)
  if (at === null) return { kind: 'none' }
  const past = now - at
  if (past < 0) return { kind: 'clock', at }
  if (past < MINUTE) return { kind: 'now' }
  if (past < HOUR) return { kind: 'minutes', count: Math.floor(past / MINUTE) }
  if (sameDay(at, now)) return { kind: 'hours', count: Math.floor(past / HOUR) }
  if (sameDay(at, dayBefore(now))) return { kind: 'yesterday', at }
  return { kind: 'date', at }
}

export type UntilTime =
  | { kind: 'none' }
  | { kind: 'soon' }
  | { kind: 'minutes'; count: number }
  | { kind: 'clock'; at: number }

export function untilParts(value: string | null | undefined, now: number): UntilTime {
  const at = parsed(value)
  if (at === null) return { kind: 'none' }
  const left = at - now
  if (left <= 0) return { kind: 'soon' }
  return left < HOUR ? { kind: 'minutes', count: Math.max(1, Math.round(left / MINUTE)) } : { kind: 'clock', at }
}

export type DayKey = { kind: 'none' } | { kind: 'today' } | { kind: 'yesterday' } | { kind: 'date'; at: number }
export function dayKey(value: string | null | undefined, now: number): DayKey {
  const at = parsed(value)
  if (at === null) return { kind: 'none' }
  if (sameDay(at, now)) return { kind: 'today' }
  if (sameDay(at, dayBefore(now))) return { kind: 'yesterday' }
  return { kind: 'date', at }
}

export const isReaction = (event: InboxEvent): boolean =>
  (INBOX_EVENT_GROUPS.reaction as readonly string[]).includes(event)

// 같은 댓글에 연달아 달린 좋아요는 한 가지를 말한다. 한 줄씩 보여주면 댓글이 화면 밖으로 밀린다.
export type InboxRow = { kind: 'item'; item: InboxItem } | { kind: 'bundle'; key: string; items: InboxItem[] }
export function bundleRows(items: InboxItem[]): InboxRow[] {
  const rows: InboxRow[] = []
  for (const item of items) {
    const last = rows.at(-1)
    const lead = last?.kind === 'bundle' ? last.items[0] : last?.kind === 'item' ? last.item : null
    const joins =
      !!lead &&
      isReaction(item.event) &&
      lead.event === item.event &&
      lead.platform === item.platform &&
      lead.title === item.title &&
      (lead.work?.id || null) === (item.work?.id || null)
    if (joins && last?.kind === 'bundle') last.items.push(item)
    else if (joins && last?.kind === 'item')
      rows[rows.length - 1] = { kind: 'bundle', key: last.item.id, items: [last.item, item] }
    else rows.push({ kind: 'item', item })
  }
  return rows
}

/** 묶음에 참여한 사람: 이름 둘까지와 나머지 수. 이름을 하나도 모르면 names가 빈 문자열이다. */
export function peopleSummary(items: InboxItem[]): { names: string; rest: number; total: number } {
  const names = [...new Set(items.map((x) => x.actor?.name).filter((x): x is string => !!x))]
  if (!names.length) return { names: '', rest: 0, total: items.length }
  return {
    names: names.slice(0, 2).join(', '),
    rest: items.length - Math.min(2, names.length),
    total: items.length
  }
}

// 에덴처럼 알림 본문을 "…"로 잘라 주는 곳이 있다. 원래 댓글을 불러왔고 그 앞부분이 알림 본문과
// 같으면 원래 댓글 전체를 본문으로 쓴다.
export function fullComment(
  body: string,
  target: InboxReplyTarget | 'loading' | undefined
): { text: string; merged: boolean } {
  const content = target && target !== 'loading' && target.ok ? target.content || '' : ''
  if (!content.trim()) return { text: body, merged: false }
  const norm = (s: string): string => s.replace(/\s+/g, ' ').trim()
  const head = norm(body)
    .replace(/(?:\.{3}|…)$/, '')
    .trim()
  return norm(content).startsWith(head) ? { text: content, merged: true } : { text: body, merged: false }
}

/** 알림이 가리키는 작품 이름 (「」 안 또는 작품 제목). */
export function workNameOf(item: Pick<InboxItem, 'title' | 'work'>): string | null {
  if (item.work?.title) return item.work.title
  return /「(.+?)」/.exec(item.title || '')?.[1] ?? null
}

export type PlatformStateKey =
  | 'checking'
  | 'windowOpen'
  | 'windowClosed'
  | 'relogin'
  | 'connected'
  | 'disconnected'

/** 연결 관리의 한 줄 상태. 확인 중 > 로그인 대기 > 재로그인 > 연결됨 순으로 본다. */
export function platformStateKey(p: {
  checking: boolean
  awaitingLogin: boolean
  loginWindowOpen: boolean
  appConnected: boolean
  status: string
}): PlatformStateKey {
  if (p.checking) return 'checking'
  if (p.awaitingLogin) return p.loginWindowOpen ? 'windowOpen' : 'windowClosed'
  if (p.appConnected && p.status === 'login') return 'relogin'
  return p.appConnected ? 'connected' : 'disconnected'
}
