// Ported from NAIS3-Custom (seotk0319/NAIS3-Custom @ 05b3313, based on sunanakgo/NAIS3), GPL-3.0.
// 브라우저 실행은 Rust(inbox_native.rs)가 하고, DevTools 연결은 웹뷰의 WebSocket으로 한다.
import type { InboxNative } from '../native.ts'
import { connectCdp, type CdpConnection } from './cdp.ts'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// Google refuses sign-in inside embedded browsers, so accounts are signed in through the
// person's own Chrome (or Edge) in a profile that belongs to this app alone. Google also
// refuses a browser started for remote control ("this browser or app may not be secure"),
// so the window a person signs in on is an ordinary one; only after it closes does the app
// reopen the same profile under DevTools to read the sessions.

/** Waits until no browser holds the profile, so the next start owns it. */
export async function profileReleased(native: InboxNative, timeoutMs = 8_000): Promise<boolean> {
  const started = Date.now()
  while (await native.profileInUse()) {
    if (Date.now() - started > timeoutMs) return false
    await sleep(250)
  }
  return true
}

export interface BrowserCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  secure: boolean
  httpOnly: boolean
  session?: boolean
  sameSite?: string
  partitionKey?: unknown
}

export interface CaptureTab {
  poll(): Promise<unknown[]>
  close(): Promise<void>
}

// Reads what the capture script queued, without enabling the page's Runtime domain.
const POLL =
  '(()=>{const q=globalThis.__moaCaptured;return JSON.stringify(Array.isArray(q)?q.splice(0):[])})()'

/**
 * 크롬은 DevTools WebSocket에 Origin 헤더가 있으면 허용 목록에 있는 출처만 받는다.
 * 앱 웹뷰의 출처(배포판 http://tauri.localhost, 개발 서버 등)를 실행 인자로 넘긴다.
 */
export function allowedOrigins(current: string | null | undefined): string {
  const origins = new Set(['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost'])
  if (current && /^[a-z]+:\/\/[a-z0-9.:-]+$/i.test(current)) origins.add(current)
  return [...origins].join(',')
}

export class LoginBrowser {
  readonly userAgent: string
  private readonly native: InboxNative
  private readonly cdp: CdpConnection

  private constructor(native: InboxNative, cdp: CdpConnection, userAgent: string) {
    this.native = native
    this.cdp = cdp
    this.userAgent = userAgent
  }

  static async launch(native: InboxNative, origin: string | null): Promise<LoginBrowser> {
    // An ordinary window on this profile would swallow the launch; the caller checks first.
    if (await native.profileInUse()) throw new Error('BROWSER_ALREADY_OPEN')
    await native.launchDebugBrowser(allowedOrigins(origin))
    const started = Date.now()
    while (Date.now() - started < 20_000) {
      // A window already open on this profile absorbs the launch and exits it at once.
      if (!(await native.debugBrowserAlive())) throw new Error('BROWSER_ALREADY_OPEN')
      const endpoint = await native.debugEndpoint().catch(() => null)
      if (endpoint) {
        try {
          const cdp = await connectCdp('ws://127.0.0.1:' + endpoint[0] + endpoint[1])
          const version = await cdp.send<{ userAgent: string }>('Browser.getVersion')
          return new LoginBrowser(native, cdp, version.userAgent.replace('HeadlessChrome', 'Chrome'))
        } catch {
          /* The port is written before the socket accepts connections. */
        }
      }
      await sleep(250)
    }
    await native.killDebugBrowser().catch(() => undefined)
    throw new Error('BROWSER_START_TIMEOUT')
  }

  get alive(): boolean {
    return !this.cdp.closed
  }

  async cookies(): Promise<BrowserCookie[]> {
    return (await this.cdp.send<{ cookies: BrowserCookie[] }>('Storage.getCookies')).cookies
  }

  // Addresses of the open tabs, read from the browser itself without attaching to any page.
  async pageUrls(): Promise<string[]> {
    const { targetInfos } = await this.cdp.send<{ targetInfos: { type: string; url: string }[] }>(
      'Target.getTargets'
    )
    return targetInfos.filter((target) => target.type === 'page').map((target) => target.url)
  }

  async openCaptureTab(url: string, script: string): Promise<CaptureTab> {
    const { targetId } = await this.cdp.send<{ targetId: string }>('Target.createTarget', {
      url: 'about:blank',
      // Behind the tab the person is signing in on, so a check never steals the window.
      background: true
    })
    const { sessionId } = await this.cdp.send<{ sessionId: string }>('Target.attachToTarget', {
      targetId,
      flatten: true
    })
    await this.cdp.send('Page.enable', {}, sessionId)
    await this.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: script }, sessionId)
    await this.cdp.send('Page.navigate', { url }, sessionId)
    return {
      poll: async () => {
        try {
          const result = await this.cdp.send<{ result: { value?: string } }>(
            'Runtime.evaluate',
            { expression: POLL, returnByValue: true },
            sessionId
          )
          const value = JSON.parse(result.result.value || '[]')
          return Array.isArray(value) ? value : []
        } catch {
          return []
        }
      },
      close: async () => {
        await this.cdp.send('Target.closeTarget', { targetId }).catch(() => undefined)
      }
    }
  }

  async close(): Promise<void> {
    await this.cdp.send('Browser.close').catch(() => undefined)
    this.cdp.close()
    const exited = await this.native.waitDebugBrowserExit(5_000).catch(() => false)
    if (!exited) await this.native.killDebugBrowser().catch(() => undefined)
  }
}
