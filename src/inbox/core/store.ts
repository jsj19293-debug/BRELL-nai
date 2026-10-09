// Ported from NAIS3-Custom (seotk0319/NAIS3-Custom @ 05b3313, based on sunanakgo/NAIS3), GPL-3.0.
// 원본 store.mjs는 node:fs로 inbox.json을 직접 읽고 썼다. 여기서는 읽기·쓰기를 주입받고
// (Tauri에서는 Rust가 임시 파일 → .previous 백업 → 바꿔치기를 한다) 나머지 규칙은 그대로 둔다.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { refineNotification, refineNotifications } from './api/model.mjs'
import { initializeSchedule, scheduleView, advanceSchedule, validateInterval } from './schedule.mjs'
import type { InboxView } from '../shared.ts'

export const platformIds = ['eden', 'babe', 'luna', 'elyn', 'neko', 'teapot', 'crack', 'rplay', 'genit']

export interface InboxStore {
  view(): Promise<InboxView>
  control(enabled: boolean): Promise<{ enabled: boolean }>
  setInterval(
    minutes: number
  ): Promise<{ intervalMinutes: number; collecting: boolean; nextCollectionAt: string | null }>
  heartbeat(detail: {
    version: string
    running: boolean
    sessions: Record<string, unknown>
  }): Promise<{ enabled: boolean; selection: Partial<Record<string, boolean>> }>
  select(platform: string, selected: boolean): Promise<{ selection: Partial<Record<string, boolean>> }>
  ingest(batch: Record<string, unknown>): Promise<{ accepted: number; added: number }>
}

export interface StorePersistence {
  /** 저장된 JSON 문자열. 아직 없으면 null. */
  read(): Promise<string | null>
  write(data: string): Promise<void>
}

function displayItem(item: any): any {
  if (item.schemaVersion === 1) return refineNotification(item)
  if (
    item.platform === 'crack' &&
    item.kind === 'other' &&
    item.sourceType === 'social' &&
    /^(?:내 스토리에 댓글이 달렸어요|내 댓글에 답글이 달렸어요)[.!]?$/.test(item.title)
  )
    return { ...item, kind: 'comment' }
  return item
}

export function cleanItem(item: any, platform: string): Record<string, any> {
  if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || item.id.length > 300)
    throw Error('Invalid notification ID')
  const text = (v: unknown, n = 12000): string => (typeof v === 'string' ? v.slice(0, n) : '')
  // An unreadable timestamp is a missing one, which the model already records as
  // unknown-time. It must never throw: one bad row would reject its whole batch, and
  // the collector's checkpoint would stop there for good.
  const instant = (value: unknown): string | null => {
    if (value == null) return null
    const at = new Date(value as string).getTime()
    return Number.isFinite(at) ? new Date(at).toISOString() : null
  }
  const at = instant(item.at)
  let url: string | null = null
  try {
    const u = new URL(item.url)
    if (u.protocol === 'https:') url = u.href
  } catch {
    /* no usable link */
  }
  const base = {
    id: `${platform}:${item.id.replace(new RegExp(`^${platform}:`), '')}`,
    platform,
    kind: ['comment', 'admin', 'follow', 'like', 'other'].includes(item.kind) ? item.kind : 'other',
    title: text(item.title, 500) || '알림',
    body: text(item.body),
    author: text(item.author, 150),
    at,
    timeLabel: text(item.timeLabel, 100),
    unread: typeof item.unread === 'boolean' ? item.unread : null,
    url,
    sourceType: text(item.sourceType, 150),
    provenance: text(item.provenance, 500) || '브라우저 수집',
    stableId: item.stableId !== false
  }
  if (item.schemaVersion === 1) {
    if (!item.sourceId || !['comment', 'reply', 'like', 'follow', 'admin', 'other'].includes(item.event))
      throw Error('Invalid API notification')
    const entity = (v: any): { id: string | null; name: string | null } => ({
      id: text(v?.id, 300) || null,
      name: text(v?.name, 300) || null
    })
    const sourceData =
      ['babe', 'teapot'].includes(platform) &&
      item.sourceData &&
      typeof item.sourceData === 'object' &&
      !Array.isArray(item.sourceData) &&
      JSON.stringify(item.sourceData).length <= 64000
        ? JSON.parse(JSON.stringify(item.sourceData))
        : null
    return {
      ...base,
      schemaVersion: 1,
      sourceId: text(item.sourceId, 300),
      channel: text(item.channel, 100),
      event: item.event,
      actor: entity(item.actor),
      work: {
        id: text(item.work?.id, 300) || null,
        title: text(item.work?.title, 500) || null,
        url: typeof item.work?.url === 'string' && /^https:\/\//.test(item.work.url) ? item.work.url : null
      },
      commentId: text(item.commentId, 300) || null,
      readAt: instant(item.readAt),
      classification: {
        evidence: text(item.classification?.evidence, 100),
        warnings: Array.isArray(item.classification?.warnings)
          ? item.classification.warnings
              .filter((x: unknown) => typeof x === 'string')
              .slice(0, 20)
              .map((x: string) => x.slice(0, 100))
          : []
      },
      ...(sourceData ? { sourceData } : {})
    }
  }
  return base
}

// Only a session's shape leaves the collector: never a token, cookie or header value.
export function cleanSessions(sessions: unknown): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries((sessions || {}) as Record<string, any>)
      .filter(([p]) => platformIds.includes(p))
      .map(([p, x]) => [
        p,
        {
          connected: x?.connected === true,
          routeCount: Number.isInteger(x?.routeCount) ? Math.max(0, x.routeCount) : 0,
          queryCount: Number.isInteger(x?.queryCount) ? Math.max(0, x.queryCount) : 0,
          hasAuthorization: x?.hasAuthorization === true,
          expiresAt:
            typeof x?.expiresAt === 'string' && Number.isFinite(Date.parse(x.expiresAt)) ? x.expiresAt : null,
          canRenew: x?.canRenew === true
        }
      ])
  )
}

export async function createStore(persistence: StorePersistence): Promise<InboxStore> {
  const raw = await persistence.read()
  let state: any
  if (raw === null) state = { version: 1, items: {}, snapshots: {}, platforms: {}, enabled: true, collector: null }
  else {
    try {
      state = JSON.parse(raw)
    } catch {
      throw Error('Stored data could not be read; preserved original: inbox.json')
    }
  }
  if (state?.version !== 1 || !state.items || !state.platforms || !state.snapshots)
    throw Error('Unsupported store; original preserved')
  state = { ...state, schedule: initializeSchedule(state) }
  let pending: Promise<unknown> = Promise.resolve(),
    appCollector: any = null
  // The retired Chrome extension's last report is not a live collector.
  delete state.collector
  const atomic = (value: unknown): Promise<void> => persistence.write(JSON.stringify(value))
  function change<T>(fn: () => Promise<T>): Promise<T> {
    const result = pending.then(fn)
    pending = result.catch(() => undefined)
    return result
  }
  return {
    async view() {
      await pending
      const snapshots = state.apiMode
        ? []
        : Object.entries(state.snapshots as Record<string, any[]>)
            .filter(
              ([key]) =>
                !(key === 'babe:personal-screen' && state.platforms.babe?.channels?.['/ko/api/notifications']?.count > 0)
            )
            .flatMap(([, items]) => items)
      const items = Object.values(state.items as Record<string, any>).filter(
        (x) => !state.apiMode || x.schemaVersion === 1
      )
      const visible: any[] = state.apiMode ? refineNotifications(items) : [...items, ...snapshots].map(displayItem)
      return {
        version: 1,
        mode: state.apiMode ? 'direct-api' : 'legacy',
        enabled: state.enabled,
        ...scheduleView(state.schedule, state.enabled),
        collector: appCollector,
        selection: { ...state.selection },
        platforms: state.platforms,
        items: visible.sort(
          (a, b) => Date.parse(b.at || b.firstSeen) - Date.parse(a.at || a.firstSeen)
        )
      } as InboxView
    },
    control(enabled) {
      return change(async () => {
        const next = { ...state, enabled: !!enabled }
        await atomic(next)
        state = next
        return { enabled: state.enabled }
      })
    },
    setInterval(minutes) {
      return change(async () => {
        validateInterval(minutes)
        const next = { ...state, schedule: { ...state.schedule, intervalMinutes: minutes } }
        await atomic(next)
        state = next
        return scheduleView(state.schedule, state.enabled)
      })
    },
    // The in-app collector lives in this process, so its liveness stays in memory and the
    // file is written only when it opens a new collection window.
    heartbeat(detail) {
      return change(async () => {
        const sessions = cleanSessions(detail.sessions)
        appCollector = Object.keys(sessions).length
          ? {
              lastSeen: new Date().toISOString(),
              version: String(detail.version || '').slice(0, 40),
              running: detail.running === true,
              sessions
            }
          : null
        const gate = advanceSchedule(state.schedule, state.enabled, platformIds)
        if (gate.schedule !== state.schedule) {
          const next = { ...state, schedule: gate.schedule }
          await atomic(next)
          state = next
        }
        return { enabled: gate.allowed, selection: { ...state.selection } }
      })
    },
    select(platform, selected) {
      return change(async () => {
        if (!platformIds.includes(platform) || typeof selected !== 'boolean') throw Error('Invalid selection')
        const next = { ...state, selection: { ...state.selection, [platform]: selected } }
        await atomic(next)
        state = next
        return { selection: { ...next.selection } }
      })
    },
    ingest(batch: any) {
      return change(async () => {
        const p = batch.platform
        if (!platformIds.includes(p) || !Array.isArray(batch.items) || batch.items.length > 1000)
          throw Error('Invalid batch')
        const normalized: any[] = batch.items.map((x: unknown) => cleanItem(x, p)),
          now = new Date().toISOString(),
          channel = String(batch.channel || 'notifications').slice(0, 100)
        const next = structuredClone(state)
        let added = 0
        next.schedule.pending = next.schedule.pending.filter((id: string) => id !== p)
        if (batch.transport === 'direct-api') {
          if (normalized.some((x) => x.schemaVersion !== 1)) throw Error('API schema required')
          if (!next.apiMode) next.platforms = {}
          next.apiMode = true
        } else if (next.apiMode) throw Error('Legacy collector is no longer active')
        for (const item of normalized.filter((x) => x.stableId)) {
          const old = next.items[item.id]
          if (!old) added++
          next.items[item.id] = { ...item, firstSeen: old?.firstSeen || now, lastSeen: now }
        }
        const uncertain = normalized.filter((x) => !x.stableId)
        if (batch.snapshot === true)
          next.snapshots[`${p}:${channel}`] = uncertain.map((x) => ({ ...x, firstSeen: now, lastSeen: now }))
        const old = next.platforms[p] || {},
          success = batch.status === 'ok' || batch.status === 'partial'
        const channels = {
          ...old.channels,
          [channel]: {
            at: now,
            count: normalized.length,
            status: batch.status || 'partial',
            detail: String(batch.detail || '').slice(0, 700)
          }
        }
        if (success && channel !== 'api-status') delete channels['api-status']
        next.platforms[p] = {
          ...old,
          lastAttempt: now,
          lastSuccess: success ? now : old.lastSuccess || null,
          lastNewAt: added > 0 ? now : old.lastNewAt || null,
          status: batch.status || 'partial',
          detail: String(batch.detail || '').slice(0, 700),
          channels,
          ...(batch.transport === 'direct-api'
            ? {
                transport: 'direct-api',
                coverage: String(batch.coverage || old.coverage || 'list'),
                unmapped: Number.isInteger(batch.unmapped) ? batch.unmapped : old.unmapped || 0,
                rejected: Number.isInteger(batch.issues?.length) ? batch.issues.length : old.rejected || 0
              }
            : {})
        }
        await atomic(next)
        state = next
        return { accepted: normalized.length, added }
      })
    }
  }
}
