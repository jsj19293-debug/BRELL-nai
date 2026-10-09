// Ported from NAIS3-Custom (seotk0319/NAIS3-Custom @ 05b3313, based on sunanakgo/NAIS3), GPL-3.0.
// Electron 세션(ses.fetch, 쿠키 저장소, safeStorage) 대신 Tauri 네이티브 연결(native.ts)을 쓴다.
// 수집·갱신·답글의 판단 로직은 원본과 같다.
import {
  allowed,
  collectEden,
  collectLuna,
  collectPages,
  collectTeapot,
  endpoints,
  expiryByOrigin,
  normalize,
  profileUpdate,
  readError,
  readRoute,
  renewable,
  renewableExpiry,
  renewSession,
  safeSessionSummary,
  SessionExpired,
  teapotQueries,
  traceText,
  type EngineBatch,
  type SessionProfile,
  type EngineRequest
} from './engine.mjs'
import { LoginBrowser, profileReleased, type BrowserCookie } from './login-browser.ts'
import { ReplyError } from './babe-reply.ts'
import { imageReadAllowed, IMAGE_ROUTES, readWorkImage } from './work-image-routes.ts'
import {
  checkContent,
  findEdenReplies,
  REPLY_ADAPTERS,
  writeAllowed,
  type FoundReply,
  type ReplyComment,
  type ReplyContext,
  type ReplyItem,
  type WriteSend
} from './replies.ts'
import {
  DIRECT_PLATFORMS,
  SITES,
  captureComplete,
  cookieBelongs,
  cookieOnly,
  sessionReady,
  type DirectPlatformId
} from './platforms.ts'
import { createVault, type DirectState } from './vault.ts'
import { fromBrowserCookie, pruneCookies, type JarCookie } from './cookie-jar.ts'
import { createDirectFetch, looksLikeBotChallenge } from './http.ts'
import type { InboxNative } from '../native.ts'

const NEEDS_LOGIN = new Set([
  'SESSION_QUERIES_MISSING',
  'SESSION_ROUTES_MISSING',
  'SESSION_NOTICE_ROUTES_MISSING'
])
const RUN_EVERY = 5 * 60_000
const SIGNED_OUT_AFTER = 10_000
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface DirectStore {
  ingest(batch: Record<string, unknown>): Promise<unknown>
  heartbeat(detail: {
    version: string
    running: boolean
    sessions: Record<string, unknown>
  }): Promise<{ enabled: boolean; selection: Partial<Record<string, boolean>> }>
}
export interface ConnectResult {
  state: 'connected' | 'login-required' | 'error'
  detail: string | null
}
export interface RunResult {
  status: 'ok' | 'partial' | 'login' | 'error'
  detail: string
}
export interface DirectPlatformState {
  connected: boolean
  awaitingLogin: boolean
  connecting: boolean
  /** The sign-in window is still open, so a finished sign-in is picked up by itself. */
  windowOpen: boolean
}

/** JWT의 payload를 읽는다 (서명은 서버가 검증한다. 여기서는 내 계정 번호만 꺼낸다). */
export function tokenPayload(token: string): Record<string, unknown> | null {
  const part = token.replace(/^Bearer\s+/i, '').split('.')[1]
  if (!part) return null
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    const value = JSON.parse(new TextDecoder().decode(bytes))
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

export function createDirectCollector(options: {
  native: InboxNative
  store: DirectStore
  version: string
  /** 앱 웹뷰의 출처. DevTools WebSocket 허용 목록에 넣는다. */
  origin?: string | null
  /** 로그인 정보를 읽을 때 페이지에 넣는 스크립트 (테스트에서는 빈 문자열) */
  captureScript: string
}): {
  start(): void
  stop(): Promise<void>
  /** One collection round now, the same one the timer runs; used by tests. */
  collect(): Promise<void>
  /**
   * "지금 수집" 버튼: 수집 주기·5분 간격과 상관없이 연결된 플랫폼을 모두 한 번씩 읽는다.
   * 체크를 끈 플랫폼은 건너뛴다. 이미 수집 중이면 아무것도 하지 않는다.
   */
  collectAll(): Promise<void>
  connect(platform: DirectPlatformId): Promise<ConnectResult>
  disconnect(platform: DirectPlatformId): Promise<void>
  /** 알림이 가리키는 원래 댓글을 찾는다 (보내기 전 확인용). */
  resolveReply(platform: DirectPlatformId, item: ReplyItem): Promise<ReplyComment>
  /** 원래 댓글을 다시 찾아 그 댓글에 답글을 단다. */
  reply(
    platform: DirectPlatformId,
    item: ReplyItem,
    content: string
  ): Promise<{ replyId: string | null; target: ReplyComment }>
  /** 베이비챗 내 작품 목록(이름·대표 이미지) 원본 응답. 썸네일 기준표를 만든다. */
  babeWorks(): Promise<unknown>
  /** 그 플랫폼 작품의 대표 이미지 주소 (로그인 계정으로 읽음). 연결 안 된 플랫폼은 null. */
  workImage(platform: string, workId: string): Promise<string | null>
  /** 에덴 댓글 번호 → 사이트에서 내가 그 뒤에 단 답글 (읽기만 한다). */
  edenReplies(commentIds: string[]): Promise<Record<string, FoundReply>>
  status(): Promise<{
    error: string | null
    platforms: Record<DirectPlatformId, DirectPlatformState>
  }>
} {
  const { native, store, version } = options
  const vault = createVault(native)
  let state: DirectState | null = null,
    loading: Promise<DirectState> | null = null,
    loadError: string | null = null,
    browser: LoginBrowser | null = null,
    timer: ReturnType<typeof setInterval> | null = null,
    startTimer: ReturnType<typeof setTimeout> | null = null,
    watchTimer: ReturnType<typeof setInterval> | null = null,
    cookieSave: ReturnType<typeof setTimeout> | null = null,
    watching = false,
    signInOpen = false,
    ticking = false,
    stopped = false
  const awaitingLogin = new Set<DirectPlatformId>(),
    connecting = new Set<DirectPlatformId>(),
    renewing = new Map<DirectPlatformId, Promise<boolean>>(),
    lastRenewal = new Map<DirectPlatformId, string>()

  async function ready(): Promise<DirectState> {
    if (state) return state
    if (!loading)
      loading = vault.load().then(
        (value) => {
          value.cookies = pruneCookies(value.cookies)
          state = value
          loadError = null
          return value
        },
        (error: Error) => {
          loading = null
          loadError = error.message
          throw error
        }
      )
    return loading
  }
  const persist = async (): Promise<void> => {
    if (state) await vault.save(state)
  }

  // 사이트가 Set-Cookie로 세션을 돌려 쓰는 경우를 놓치지 않게, 바뀐 쿠키는 잠시 뒤 한 번에 저장한다.
  const directFetch = createDirectFetch({
    native,
    cookies: {
      get: () => state?.cookies || [],
      set: (next: JarCookie[]) => {
        if (!state) return
        state.cookies = next
        if (cookieSave) clearTimeout(cookieSave)
        cookieSave = setTimeout(() => {
          cookieSave = null
          void persist().catch(() => undefined)
        }, 2_000)
      }
    },
    userAgent: () => state?.userAgent || null
  })

  async function heartbeat(): Promise<{
    enabled: boolean
    selection: Partial<Record<string, boolean>>
  }> {
    const s = await ready()
    const sessions = Object.fromEntries(
      DIRECT_PLATFORMS.filter((p) => s.platforms[p]).map((p) => [
        p,
        p === 'luna'
          ? { connected: true, expiresAt: null, canRenew: false }
          : safeSessionSummary(s.platforms[p]!.profile)
      ])
    )
    return store.heartbeat({ version, running: true, sessions })
  }

  // One renewal per account at a time. A failure keeps the old bearer, so the account
  // still reports its real error instead of being hidden behind a renewal error.
  function renewPlatform(
    platform: DirectPlatformId,
    holder: { profile: SessionProfile }
  ): Promise<boolean> {
    if (!holder.profile.renewal) return Promise.resolve(false)
    let run = renewing.get(platform)
    if (!run) {
      run = (async () => {
        const result = await renewSession({
          platform,
          profile: holder.profile,
          // 갱신 요청은 원본과 같이 쿠키 없이(credentials: 'omit') 보낸다.
          fetchImpl: ((url: string, init: RequestInit) =>
            directFetch(String(url), {
              method: init?.method,
              headers: (init?.headers || {}) as Record<string, string>,
              body: typeof init?.body === 'string' ? init.body : undefined,
              cookies: false
            })) as unknown as typeof fetch
        })
        const current = state?.platforms[platform]
        if (!state || !current) return false
        const headersByOrigin = { ...current.profile.headersByOrigin }
        for (const origin of result.origins)
          headersByOrigin[origin] = {
            ...headersByOrigin[origin],
            authorization: result.authorization
          }
        const primary =
          platform === 'teapot' ? 'https://firestore.googleapis.com' : allowed[platform]?.origin
        const profile: SessionProfile = {
          ...current.profile,
          headersByOrigin,
          headers: result.origins.includes(primary)
            ? { ...current.profile.headers, authorization: result.authorization }
            : current.profile.headers,
          renewal: result.renewal,
          renewedAt: new Date().toISOString()
        }
        state.platforms[platform] = { ...current, profile }
        holder.profile = profile
        await persist()
        lastRenewal.delete(platform)
        return true
      })().finally(() => renewing.delete(platform))
      renewing.set(platform, run)
    }
    return run
  }

  /** 봇 확인 페이지는 로그인 만료(403)와 구분해 오류로 올린다. 그렇지 않으면 멀쩡한 연결을 끊게 된다. */
  async function rejectBotChallenge(platform: DirectPlatformId, response: Response): Promise<void> {
    if (response.ok || (response.status !== 403 && response.status !== 503)) return
    const start = await response
      .clone()
      .text()
      .then((text) => text.slice(0, 4000))
      .catch(() => '')
    if (looksLikeBotChallenge(response, start)) throw new Error(platform + ': BOT_CHALLENGE')
  }

  async function transport(
    platform: DirectPlatformId,
    holder: { profile: SessionProfile },
    request: EngineRequest,
    retried = false
  ): Promise<Response> {
    const { url, method = 'GET' } = request,
      profile = holder.profile
    if (platform === 'teapot') {
      const query = JSON.parse(request.body || '{}')
      const approved = teapotQueries(profile).some((q) => {
        const known = q as { parent: string; structuredQuery: unknown }
        return (
          url === 'https://firestore.googleapis.com/v1/' + known.parent + ':runQuery' &&
          JSON.stringify(query) === JSON.stringify({ structuredQuery: known.structuredQuery })
        )
      })
      if (method !== 'POST' || !approved) throw new Error('UNAPPROVED_READ_QUERY')
    } else if (method !== 'GET') throw new Error('READ_ONLY')
    else readRoute(platform, url)
    const origin = new URL(url).origin
    const headers =
      profile.headersByOrigin?.[origin] ||
      (platform === 'teapot' || origin === allowed[platform]?.origin ? profile.headers : {}) ||
      {}
    const response = await directFetch(url, {
      method,
      headers: { ...headers, ...request.headers },
      body: request.body
    })
    await rejectBotChallenge(platform, response)
    // An expired bearer is renewed once in place, so the caller never sees the stale failure.
    if (
      !response.ok &&
      !retried &&
      (await renewable(response)) &&
      (await renewPlatform(platform, holder).catch((error: Error) => {
        lastRenewal.set(platform, error.message)
        return false
      }))
    )
      return transport(platform, holder, request, true)
    return response
  }

  async function runPlatform(platform: DirectPlatformId): Promise<RunResult> {
    const s = await ready(),
      current = s.platforms[platform]
    if (!current) return { status: 'login', detail: '로그인이 필요해요.' }
    const holder = { profile: current.profile }
    let last: RunResult = { status: 'ok', detail: '' }
    const report = async (status: RunResult['status'], detail: string): Promise<void> => {
      last = { status, detail }
      await store.ingest({
        transport: 'direct-api',
        platform,
        channel: 'api-status',
        items: [],
        status,
        detail
      })
    }
    // Renew before the round rather than after a failure, so one expiry does not cost a cycle.
    const due = renewableExpiry(holder.profile)
    if (due && Date.parse(due) - Date.now() < 300_000)
      await renewPlatform(platform, holder).catch((error: Error) =>
        lastRenewal.set(platform, error.message)
      )
    const request = (r: EngineRequest): Promise<Response> => transport(platform, holder, r)
    const commit = async (batch: EngineBatch): Promise<void> => {
      const status: RunResult['status'] =
        batch.issues?.length || batch.unmapped
          ? 'partial'
          : batch.checkpoint?.complete
            ? 'ok'
            : 'partial'
      const detail =
        '앱 수집 · API 응답 ' +
        (batch.received ?? batch.items.length) +
        '건 · 미분류 ' +
        (batch.unmapped || 0) +
        '건 · 변환 누락 ' +
        (batch.issues?.length || 0) +
        '건' +
        (batch.checkpoint?.next ? ' · 다음 페이지 이어받기' : '')
      await store.ingest({ ...batch, transport: 'direct-api', status, detail, items: batch.items })
      last = { status, detail }
      if (batch.checkpoint) s.checkpoints[platform] = batch.checkpoint
    }
    const stored = s.checkpoints[platform],
      cursor = stored?.complete ? null : stored
    try {
      if (platform === 'eden')
        await collectEden({
          profile: holder.profile,
          transport: request,
          commit,
          checkpoint: cursor
        })
      else if (platform === 'luna')
        await collectLuna({ transport: request, commit, checkpoint: cursor })
      else if (platform === 'teapot')
        await collectTeapot({ profile: holder.profile, transport: request, commit })
      else {
        const route =
          platform === 'rplay'
            ? holder.profile.routes?.['/account/getuser']
            : holder.profile.routes?.[new URL(endpoints[platform]).pathname] || endpoints[platform]
        if (!route) throw new Error('SESSION_ROUTES_MISSING')
        // Refresh the newest page even while a historical continuation is pending.
        if (cursor?.next)
          await collectPages({
            platform,
            transport: request,
            commit: async (batch) => {
              await store.ingest({
                ...batch,
                transport: 'direct-api',
                channel: 'latest',
                status: 'partial',
                detail: '앱 수집 · 최신 알림 API 조회',
                items: batch.items
              })
            },
            startUrl: route,
            maxPages: 1,
            stage: 'latest'
          })
        await collectPages({
          platform,
          transport: request,
          commit,
          startUrl: route,
          checkpoint: cursor,
          maxPages: 40,
          stage: platform === 'rplay' ? 'getuser' : 'list'
        })
        const popup =
          platform === 'rplay'
            ? holder.profile.routes?.['/account/popup-notifications/active']
            : undefined
        if (popup) {
          const response = await request({ platform, url: popup, method: 'GET' })
          if (!response.ok) throw await readError(platform, response, popup, 'popup')
          const batch = normalize(platform, await response.json(), {
            channel: 'global',
            classification: { event: 'admin', type: 'popup', evidence: 'source-route' }
          })
          await commit({ ...batch, platform, channel: 'global' })
        }
      }
    } catch (error) {
      // The stored token's own expiry travels with the failure, so an expired
      // credential is never mistaken for a broken route or a server outage.
      const message = error instanceof Error ? error.message : String(error)
      const oldest = Object.values(expiryByOrigin(holder.profile)).sort()[0] || null,
        renewal = lastRenewal.get(platform)
      const suffix = [
        oldest && traceText({ tokenExp: oldest, now: new Date().toISOString() }),
        renewal && 'renewal=' + JSON.stringify(String(renewal).slice(0, 200))
      ]
        .filter(Boolean)
        .map((x) => ' · ' + x)
        .join('')
      const login = error instanceof SessionExpired || NEEDS_LOGIN.has(message)
      await report(login ? 'login' : 'error', message + suffix).catch(() => undefined)
    } finally {
      lastRenewal.delete(platform)
      s.lastRun[platform] = Date.now()
      await persist().catch(() => undefined)
    }
    return last
  }

  async function tick(): Promise<void> {
    if (ticking || stopped) return
    ticking = true
    try {
      const s = await ready()
      const connected = DIRECT_PLATFORMS.filter((p) => s.platforms[p])
      if (!connected.length) return
      const gate = await heartbeat()
      if (!gate.enabled) return
      const due = connected
        .filter(
          (p) =>
            gate.selection[p] !== false &&
            !connecting.has(p) &&
            Date.now() - (s.lastRun[p] || 0) >= RUN_EVERY
        )
        .slice(0, 2)
      for (const platform of due) await runPlatform(platform)
    } catch {
      /* A failed round is reported per platform; the next tick retries. */
    } finally {
      ticking = false
    }
  }

  async function collectAll(): Promise<void> {
    if (ticking || stopped) return
    ticking = true
    try {
      const s = await ready()
      const gate = await heartbeat()
      for (const platform of DIRECT_PLATFORMS)
        if (s.platforms[platform] && gate.selection[platform] !== false && !connecting.has(platform))
          await runPlatform(platform)
    } catch {
      /* Each platform reports its own failure. */
    } finally {
      ticking = false
    }
  }

  async function openBrowser(): Promise<LoginBrowser> {
    if (browser?.alive) return browser
    browser = await LoginBrowser.launch(native, options.origin ?? null)
    return browser
  }
  async function closeBrowser(): Promise<void> {
    const open = browser
    browser = null
    if (open) await open.close()
  }

  async function capture(
    open: LoginBrowser,
    platform: DirectPlatformId
  ): Promise<SessionProfile | null> {
    const tab = await open.openCaptureTab(SITES[platform], options.captureScript)
    let profile: SessionProfile | undefined = platform === 'luna' ? cookieOnly() : undefined
    const started = Date.now()
    try {
      while (Date.now() - started < 25_000) {
        await sleep(500)
        for (const message of await tab.poll()) {
          const captured = message as { platform?: string; profile?: unknown }
          if (captured.platform !== platform) continue
          try {
            profile = profileUpdate(platform, captured.profile, profile)
          } catch {
            /* A request from another API on the page is not this session. */
          }
        }
        // Late renewal tokens are worth a few seconds; a complete capture ends early.
        const elapsed = Date.now() - started
        if (elapsed >= 4_000 && captureComplete(platform, profile)) break
        // A signed-in site sends its first API call within a few seconds. Nothing usable by
        // now means signed out, so the person is not kept waiting for the full window.
        if (elapsed >= SIGNED_OUT_AFTER && !sessionReady(platform, profile)) break
      }
    } finally {
      await tab.close()
    }
    return sessionReady(platform, profile) ? profile! : null
  }

  function clearCookies(s: DirectState, platform: DirectPlatformId): void {
    s.cookies = s.cookies.filter((cookie) => !cookieBelongs(platform, cookie.domain))
  }
  function importCookies(s: DirectState, platform: DirectPlatformId, cookies: BrowserCookie[]): void {
    clearCookies(s, platform)
    // A browser-session cookie would end with this app's session; it is kept for a month
    // instead, and the site itself still decides whether it is valid.
    for (const cookie of cookies) {
      if (!cookieBelongs(platform, cookie.domain) || cookie.partitionKey) continue
      const stored = fromBrowserCookie(cookie)
      if (stored) s.cookies.push(stored)
    }
  }

  async function forget(platform: DirectPlatformId): Promise<void> {
    const s = await ready()
    clearCookies(s, platform)
    delete s.platforms[platform]
    delete s.checkpoints[platform]
    delete s.lastRun[platform]
    await persist()
  }

  // Reads the platform's session from the app's profile under DevTools. The sign-in window
  // must be closed first: Google refuses to sign in on a browser under remote control, and
  // one profile can only be open once. `openLogin` opens that window when no session is found.
  async function attempt(platform: DirectPlatformId, openLogin: boolean): Promise<ConnectResult> {
    if (connecting.has(platform)) return { state: 'error', detail: 'CONNECT_IN_PROGRESS' }
    connecting.add(platform)
    try {
      const s = await ready()
      // The person is still signing in: another platform opens as a tab in that window.
      if (!browser?.alive && (await native.profileInUse())) {
        if (!openLogin) return { state: 'login-required', detail: null }
        await native.openSignIn(SITES[platform])
        waitForSignIn(platform)
        return { state: 'login-required', detail: null }
      }
      // Never connected and not mid sign-in: there is nothing to check yet, so the sign-in
      // window opens at once. Closing it runs the check anyway.
      if (openLogin && !browser?.alive && !s.platforms[platform] && !awaitingLogin.has(platform)) {
        await native.openSignIn(SITES[platform])
        waitForSignIn(platform)
        return { state: 'login-required', detail: null }
      }
      let connected: ConnectResult | null = null
      try {
        const open = await openBrowser()
        const profile = await capture(open, platform)
        if (profile) {
          importCookies(s, platform, await open.cookies())
          s.userAgent = open.userAgent
          s.platforms[platform] = { profile, connectedAt: new Date().toISOString() }
          delete s.checkpoints[platform]
          delete s.lastRun[platform]
          await persist()
          // The first collection is the proof: a signed-out site answers it with 401/403.
          const result = await runPlatform(platform)
          if (result.status !== 'login')
            connected = {
              state: 'connected',
              detail: result.status === 'error' ? result.detail : null
            }
          else await forget(platform)
        }
      } finally {
        // The DevTools browser only lives for the check; another check may still be using it.
        if (connecting.size === 1) await closeBrowser()
      }
      if (connected) {
        awaitingLogin.delete(platform)
        await heartbeat().catch(() => undefined)
        return connected
      }
      if (openLogin) {
        await profileReleased(native)
        await native.openSignIn(SITES[platform])
        waitForSignIn(platform)
      }
      return { state: 'login-required', detail: null }
    } catch (error) {
      return { state: 'error', detail: error instanceof Error ? error.message : String(error) }
    } finally {
      connecting.delete(platform)
    }
  }
  const connect = (platform: DirectPlatformId): Promise<ConnectResult> => attempt(platform, true)

  function stopWatching(): void {
    if (watchTimer) clearInterval(watchTimer)
    watchTimer = null
  }
  function waitForSignIn(platform: DirectPlatformId): void {
    awaitingLogin.add(platform)
    signInOpen = true
    if (!watchTimer) watchTimer = setInterval(() => void watchTick(), 1_500)
    void heartbeat().catch(() => undefined)
  }
  // Watches only whether the sign-in window is still open (the profile's lockfile), never
  // the page itself. Once it closes, each platform waiting for sign-in is checked once;
  // one still signed out keeps its "로그인 완료" button for another try.
  async function watchTick(): Promise<void> {
    if (watching || stopped) return
    watching = true
    try {
      if (!awaitingLogin.size) {
        signInOpen = false
        return stopWatching()
      }
      if (browser?.alive || connecting.size) return
      if (await native.profileInUse()) {
        signInOpen = true
        return
      }
      if (!signInOpen) return
      signInOpen = false
      for (const platform of [...awaitingLogin]) await attempt(platform, false)
      await heartbeat().catch(() => undefined)
    } catch {
      /* The next tick or the button tries again. */
    } finally {
      watching = false
    }
  }

  // 답글 쓰기는 수집용 transport(읽기 전용)와 분리한다. 플랫폼마다 그 사이트의 댓글 주소로만
  // 보낼 수 있고, 만료된 토큰은 수집과 같은 방식으로 한 번 갱신한다.
  async function replyContext(
    platform: DirectPlatformId
  ): Promise<{ adapter: (typeof REPLY_ADAPTERS)[string]; ctx: ReplyContext }> {
    const adapter = REPLY_ADAPTERS[platform]
    if (!adapter) throw new ReplyError('REPLY_UNSUPPORTED')
    const s = await ready()
    const current = s.platforms[platform]
    if (!current) throw new ReplyError('LOGIN_REQUIRED')
    const holder = { profile: current.profile }
    // 쓰기 주소는 writeAllowed로 그 플랫폼 댓글 주소로만 제한돼 있다. 그 주소에 따로 기록된
    // 헤더가 없으면 같은 플랫폼 세션의 기본 헤더를 쓴다 (예: 티팟 함수 호출, 스토리챗 목록).
    const headersFor = (origin: string): Record<string, string> =>
      holder.profile.headersByOrigin?.[origin] ||
      holder.profile.headers ||
      Object.values(holder.profile.headersByOrigin || {})[0] ||
      {}
    const send: WriteSend = async (url, init) => {
      if (!writeAllowed(platform, url)) throw new ReplyError('UNAPPROVED_WRITE_ROUTE')
      const origin = new URL(url).origin
      const call = (): Promise<Response> =>
        directFetch(url, {
          method: init.method,
          headers: {
            ...(init.form ? {} : headersFor(origin)),
            ...(init.body ? { 'content-type': 'application/json' } : {}),
            ...init.headers
          },
          body: init.form ? undefined : init.body,
          form: init.form
        })
      const response = await call()
      if (
        !response.ok &&
        (await renewable(response.clone())) &&
        (await renewPlatform(platform, holder).catch(() => false))
      )
        return call()
      return response
    }
    const ctx: ReplyContext = {
      send,
      async cookie(domain, name) {
        const host = domain.replace(/^\./, '').toLowerCase()
        const seconds = Date.now() / 1000
        const found = s.cookies.find(
          (cookie) =>
            cookie.name === name &&
            cookie.expires > seconds &&
            (cookie.domain === host || cookie.domain.endsWith('.' + host))
        )
        return found?.value ?? null
      },
      accountId(origin) {
        const payload = tokenPayload(String(headersFor(origin).authorization || ''))
        const id = payload?.sub ?? payload?.user_id
        return typeof id === 'string' ? id : null
      },
      route(path) {
        const value = (holder.profile.routes as Record<string, unknown> | undefined)?.[path]
        return typeof value === 'string' ? value : null
      }
    }
    return { adapter, ctx }
  }

  /** 로그인 세션 헤더로 읽기만 하는 요청 (작품 이미지, 베이비챗 작품 목록). 만료되면 한 번 갱신한다. */
  async function readWithSession(
    platform: DirectPlatformId,
    holder: { profile: SessionProfile },
    url: string,
    headers: Record<string, string>
  ): Promise<Response> {
    const call = (): Promise<Response> => directFetch(url, { headers })
    const response = await call()
    if (
      !response.ok &&
      (await renewable(response.clone())) &&
      (await renewPlatform(platform, holder).catch(() => false))
    )
      return call()
    return response
  }

  return {
    start() {
      stopped = false
      ready().catch(() => undefined)
      startTimer = setTimeout(() => void tick(), 5_000)
      timer = setInterval(() => void tick(), 30_000)
    },
    async stop() {
      stopped = true
      if (startTimer) clearTimeout(startTimer)
      startTimer = null
      if (timer) clearInterval(timer)
      timer = null
      stopWatching()
      if (cookieSave) {
        clearTimeout(cookieSave)
        cookieSave = null
        await persist().catch(() => undefined)
      }
      await closeBrowser().catch(() => undefined)
    },
    connect,
    collect: tick,
    collectAll,
    async workImage(platform, workId) {
      const route = IMAGE_ROUTES[platform]
      if (!route) return null
      // 요청이 필요 없는 플랫폼(알플레이)은 로그인 없이도 주소를 만든다.
      if (!route.url) return readWorkImage(platform, workId, () => Promise.reject(new Error('NO_READ')))
      const s = await ready()
      const current = s.platforms[platform as DirectPlatformId]
      if (!current) return null
      const holder = { profile: current.profile }
      const read = async (url: string): Promise<Response> => {
        if (!imageReadAllowed(platform, url)) throw new Error('UNAPPROVED_READ_ROUTE')
        const origin = new URL(url).origin
        return readWithSession(
          platform as DirectPlatformId,
          holder,
          url,
          holder.profile.headersByOrigin?.[origin] ||
            (origin === allowed[platform as DirectPlatformId]?.origin ? holder.profile.headers : {}) ||
            {}
        )
      }
      return readWorkImage(platform, workId, read)
    },
    async babeWorks() {
      const s = await ready()
      const current = s.platforms.babe
      if (!current) throw new ReplyError('LOGIN_REQUIRED')
      const holder = { profile: current.profile }
      const url = 'https://api.babechatapi.com/ko/api/characters/my'
      const origin = new URL(url).origin
      const response = await readWithSession(
        'babe',
        holder,
        url,
        holder.profile.headersByOrigin?.[origin] || holder.profile.headers || {}
      )
      if (!response.ok) throw new ReplyError('WORKS_FAILED', response.status)
      return response.json()
    },
    async resolveReply(platform, item) {
      const { adapter, ctx } = await replyContext(platform)
      return adapter.resolve(ctx, item)
    },
    async edenReplies(commentIds) {
      const { ctx } = await replyContext('eden')
      return findEdenReplies(ctx, commentIds)
    },
    async reply(platform, item, content) {
      const text = checkContent(content)
      const { adapter, ctx } = await replyContext(platform)
      const target = await adapter.resolve(ctx, item)
      const { replyId } = await adapter.post(ctx, target, text)
      return { replyId, target }
    },
    async disconnect(platform) {
      awaitingLogin.delete(platform)
      await forget(platform)
      await heartbeat().catch(() => undefined)
    },
    async status() {
      const s = await ready().catch(() => null)
      return {
        error: s ? null : loadError,
        platforms: Object.fromEntries(
          DIRECT_PLATFORMS.map((p) => [
            p,
            {
              connected: !!s?.platforms[p],
              awaitingLogin: awaitingLogin.has(p),
              connecting: connecting.has(p),
              windowOpen: signInOpen
            }
          ])
        ) as Record<DirectPlatformId, DirectPlatformState>
      }
    }
  }
}
