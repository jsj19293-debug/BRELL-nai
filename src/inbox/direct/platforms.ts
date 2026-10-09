// Ported from NAIS3-Custom (seotk0319/NAIS3-Custom @ 05b3313, based on sunanakgo/NAIS3), GPL-3.0.
// CAPTURE_SCRIPT lives in capture-script.ts (it needs the bundler's ?raw import).
import { teapotQueries, type SessionProfile } from './engine.mjs'

export const DIRECT_PLATFORMS = [
  'eden',
  'babe',
  'luna',
  'elyn',
  'neko',
  'teapot',
  'crack',
  'rplay',
  'genit'
] as const
export type DirectPlatformId = (typeof DIRECT_PLATFORMS)[number]
export const isDirectPlatform = (value: unknown): value is DirectPlatformId =>
  typeof value === 'string' && (DIRECT_PLATFORMS as readonly string[]).includes(value)

// The page each platform shows a signed-in creator; loading it makes the site call
// its own notification API, which is where the session is read from.
export const SITES: Record<DirectPlatformId, string> = {
  eden: 'https://www.eden-chat.com/',
  babe: 'https://babechat.ai/notification?tab=my',
  luna: 'https://lunatalk.chat/member/alarm',
  elyn: 'https://elyn.ai/',
  neko: 'https://www.nekochat.xyz/',
  teapot: 'https://teapotchat.com/notifications',
  crack: 'https://crack.wrtn.ai/',
  rplay: 'https://rplay.live/story',
  genit: 'https://genit.ai/ko'
}
// Only these cookies leave the sign-in browser, and only for their own platform.
export const COOKIE_DOMAINS: Record<DirectPlatformId, string[]> = {
  eden: ['eden-chat.com'],
  babe: ['babechat.ai', 'babechatapi.com'],
  luna: ['lunatalk.chat'],
  elyn: ['elyn.ai'],
  neko: ['nekochat.xyz'],
  teapot: ['teapotchat.com'],
  crack: ['wrtn.ai'],
  rplay: ['rplay.live'],
  genit: ['genit.ai']
}
export function cookieBelongs(platform: DirectPlatformId, domain: string): boolean {
  const host = domain.replace(/^\./, '').toLowerCase()
  return COOKIE_DOMAINS[platform].some((root) => host === root || host.endsWith('.' + root))
}

type Need = 'auth' | 'renewal' | 'route' | 'queries'
// What a finished capture holds. A site that stops short of these after 25 seconds
// is still tried: the first collection decides whether the account is signed in.
const NEEDS: Record<DirectPlatformId, Need[]> = {
  eden: ['auth', 'renewal'],
  babe: ['auth', 'renewal'],
  crack: ['auth', 'renewal'],
  rplay: ['auth', 'renewal', 'route'],
  teapot: ['auth', 'renewal', 'queries'],
  elyn: ['auth', 'renewal'],
  genit: [],
  neko: [],
  luna: []
}
export function captureComplete(
  platform: DirectPlatformId,
  profile: SessionProfile | undefined
): boolean {
  if (!profile) return false
  return NEEDS[platform].every((need) =>
    need === 'auth'
      ? !!profile.headers?.authorization
      : need === 'renewal'
        ? !!profile.renewal
        : need === 'route'
          ? !!profile.routes?.['/account/getuser']
          : teapotQueries(profile).length > 0
  )
}
export function sessionReady(
  platform: DirectPlatformId,
  profile: SessionProfile | undefined
): boolean {
  return (
    !!profile &&
    (platform !== 'teapot' || teapotQueries(profile).length > 0) &&
    (platform !== 'rplay' || !!profile.routes?.['/account/getuser'])
  )
}
// Luna has no API session: its alarm page is read with the site's cookies alone.
export const cookieOnly = (): SessionProfile => ({
  headers: {},
  headersByOrigin: {},
  routes: {},
  queries: []
})

export function hostBelongs(platform: DirectPlatformId, url: string): boolean {
  try {
    return cookieBelongs(platform, new URL(url).hostname)
  } catch {
    return false
  }
}

// Analytics and preference cookies come and go on every page view; they say nothing
// about whether the person signed in.
const NOISE =
  /^(?:_ga|_gid|_gat|_gcl|_fbp|_fbc|_clck|_clsk|_hj|__cf|cf_|amp_|ajs_|mp_|_tt|NEXT_LOCALE|locale|lang|theme)/i
// Only which cookies exist, never their values.
export function cookieNames(
  platform: DirectPlatformId,
  cookies: { name: string; domain: string }[]
): string {
  return [
    ...new Set(
      cookies
        .filter((c) => cookieBelongs(platform, c.domain) && !NOISE.test(c.name))
        .map((c) => c.name)
    )
  ]
    .sort()
    .join('\n')
}

export interface LoginWatch {
  created: number
  baseline: string | null
  pending: string | null
  pendingSince: number
  leftSite: boolean
  lastAttempt: number
}
export const startWatch = (now: number): LoginWatch => ({
  created: now,
  baseline: null,
  pending: null,
  pendingSince: 0,
  leftSite: false,
  lastAttempt: now
})
const SETTLE = 6_000,
  STEADY = 3_000,
  RETRY = 15_000
// Decides, from tab addresses and cookie names alone, whether a sign-in just finished:
// the tab came back from Google to the platform, or the platform gained a new cookie
// that has stayed put. Attempts are spaced so a false alarm costs one quiet check.
export function loginSignal(
  platform: DirectPlatformId,
  watch: LoginWatch,
  seen: { names: string; urls: string[] },
  now: number
): { watch: LoginWatch; fire: boolean } {
  const next = { ...watch }
  // The sign-in page sets its own cookies while it loads; start comparing after that.
  if (next.baseline === null) {
    if (now - next.created >= SETTLE) next.baseline = seen.names
    return { watch: next, fire: false }
  }
  const atGoogle = seen.urls.some((url) => /^https:\/\/accounts\.google\.com\//.test(url))
  const onSite = seen.urls.some((url) => hostBelongs(platform, url))
  next.leftSite ||= atGoogle
  if (seen.names === next.baseline) next.pending = null
  else if (seen.names !== next.pending) {
    next.pending = seen.names
    next.pendingSince = now
  }
  const returned = next.leftSite && onSite && !atGoogle
  const settled = next.pending !== null && now - next.pendingSince >= STEADY
  const fire = (returned || settled) && now - next.lastAttempt >= RETRY
  if (fire) {
    next.lastAttempt = now
    next.leftSite = false
  }
  return { watch: next, fire }
}
