// 로그인 브라우저에서 가져온 쿠키를 담아 두고, 요청마다 Cookie 헤더를 만든다.
// NAIS3-Custom은 Electron 세션의 쿠키 저장소를 썼다. Tauri에는 그게 없어서 같은 규칙
// (도메인·경로·secure·만료)을 여기서 직접 적용한다. 값은 보관함(vault)에 암호화되어 저장된다.

export interface JarCookie {
  name: string
  value: string
  /** 앞의 점 없이 소문자 호스트 */
  domain: string
  /** true면 그 호스트에만, false면 하위 도메인에도 보낸다 */
  hostOnly: boolean
  path: string
  secure: boolean
  httpOnly: boolean
  /** 만료 시각 (Unix 초) */
  expires: number
}

export interface BrowserCookieLike {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  secure: boolean
  httpOnly: boolean
  session?: boolean
  partitionKey?: unknown
}

const MONTH = 30 * 86_400

/** 브라우저 쿠키를 저장용으로 바꾼다. 세션 쿠키는 한 달 보관하고, 유효한지는 사이트가 판단한다. */
export function fromBrowserCookie(cookie: BrowserCookieLike, now = Date.now()): JarCookie | null {
  if (!cookie || typeof cookie.name !== 'string' || typeof cookie.value !== 'string') return null
  if (typeof cookie.domain !== 'string' || !cookie.domain || cookie.partitionKey) return null
  const month = Math.floor(now / 1000) + MONTH
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain.replace(/^\./, '').toLowerCase(),
    hostOnly: !cookie.domain.startsWith('.'),
    path: cookie.path || '/',
    secure: cookie.secure === true,
    httpOnly: cookie.httpOnly === true,
    expires: cookie.session || !(cookie.expires > 0) ? month : Math.floor(cookie.expires)
  }
}

function domainMatches(cookie: JarCookie, host: string): boolean {
  if (host === cookie.domain) return true
  return !cookie.hostOnly && host.endsWith('.' + cookie.domain)
}

// RFC 6265 5.1.4
function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === requestPath) return true
  if (!requestPath.startsWith(cookiePath)) return false
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/'
}

/** 이 주소로 보낼 쿠키. 더 구체적인 경로가 앞에 온다. */
export function cookiesFor(jar: JarCookie[], url: string, now = Date.now()): JarCookie[] {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return []
  }
  if (target.protocol !== 'https:') return []
  const host = target.hostname.toLowerCase()
  const path = target.pathname || '/'
  const seconds = now / 1000
  return jar
    .filter(
      (cookie) =>
        cookie.expires > seconds && domainMatches(cookie, host) && pathMatches(cookie.path, path)
    )
    .sort((a, b) => b.path.length - a.path.length)
}

export function cookieHeader(jar: JarCookie[], url: string, now = Date.now()): string {
  return cookiesFor(jar, url, now)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')
}

/** 응답의 Set-Cookie 한 줄을 읽는다. 다른 사이트용 쿠키(Domain 불일치)는 버린다. */
export function parseSetCookie(header: string, url: string, now = Date.now()): JarCookie | null {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return null
  }
  const host = target.hostname.toLowerCase()
  const parts = header.split(';')
  const first = parts.shift() || ''
  const split = first.indexOf('=')
  if (split <= 0) return null
  const name = first.slice(0, split).trim()
  const value = first.slice(split + 1).trim()
  if (!name) return null
  const defaultPath = target.pathname.lastIndexOf('/') > 0 ? target.pathname.slice(0, target.pathname.lastIndexOf('/')) : '/'
  const cookie: JarCookie = {
    name,
    value,
    domain: host,
    hostOnly: true,
    path: defaultPath,
    secure: false,
    httpOnly: false,
    expires: Math.floor(now / 1000) + MONTH
  }
  let maxAge: number | null = null
  for (const part of parts) {
    const at = part.indexOf('=')
    const key = (at < 0 ? part : part.slice(0, at)).trim().toLowerCase()
    const attribute = at < 0 ? '' : part.slice(at + 1).trim()
    if (key === 'domain' && attribute) {
      const domain = attribute.replace(/^\./, '').toLowerCase()
      if (host !== domain && !host.endsWith('.' + domain)) return null
      cookie.domain = domain
      cookie.hostOnly = false
    } else if (key === 'path' && attribute.startsWith('/')) cookie.path = attribute
    else if (key === 'secure') cookie.secure = true
    else if (key === 'httponly') cookie.httpOnly = true
    else if (key === 'max-age' && /^-?\d+$/.test(attribute)) maxAge = Number(attribute)
    else if (key === 'expires' && maxAge === null) {
      const at = Date.parse(attribute)
      if (Number.isFinite(at)) cookie.expires = Math.floor(at / 1000)
    }
  }
  if (maxAge !== null) cookie.expires = Math.floor(now / 1000) + maxAge
  return cookie
}

const sameCookie = (a: JarCookie, b: JarCookie): boolean =>
  a.name === b.name && a.domain === b.domain && a.path === b.path

/** 쿠키를 넣거나 바꾼다. 이미 만료된 쿠키는 지우라는 뜻이다. 바뀐 게 있으면 새 배열을 돌려준다. */
export function storeCookie(jar: JarCookie[], cookie: JarCookie, now = Date.now()): JarCookie[] {
  const rest = jar.filter((existing) => !sameCookie(existing, cookie))
  return cookie.expires > now / 1000 ? [...rest, cookie] : rest
}

/** 만료된 쿠키를 걸러 낸다. */
export function pruneCookies(jar: JarCookie[], now = Date.now()): JarCookie[] {
  const seconds = now / 1000
  return jar.filter((cookie) => cookie.expires > seconds)
}
