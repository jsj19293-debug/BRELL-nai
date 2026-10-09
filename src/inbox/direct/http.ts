// 네이티브 HTTP 전송 위에 fetch와 같은 모양(Response)을 얹는다. 엔진은 표준 Response만 본다.
// Electron 세션의 fetch가 하던 일(쿠키 붙이기, Set-Cookie 반영, 리다이렉트 거부, 제한 시간)을 여기서 한다.
import type { InboxNative } from '../native.ts'
import { cookieHeader, parseSetCookie, storeCookie, type JarCookie } from './cookie-jar.ts'

export interface DirectFetchInit {
  method?: string
  headers?: Record<string, string>
  body?: string
  /** multipart/form-data로 보낼 텍스트 필드 (루나) */
  form?: Record<string, string>
  /** false면 쿠키를 붙이지 않는다 (토큰 갱신 요청) */
  cookies?: boolean
  timeoutMs?: number
}

export interface CookieStore {
  get(): JarCookie[]
  /** Set-Cookie로 바뀐 쿠키를 저장한다 */
  set(next: JarCookie[]): void
}

/** 텍스트 필드만 있는 multipart 본문. 경계 문자열은 값과 겹치지 않게 고른다. */
export function multipartBody(fields: Record<string, string>, seed = Math.random().toString(36).slice(2)): {
  body: string
  contentType: string
} {
  let boundary = '----NAIS2ForgeFormBoundary' + seed
  while (Object.values(fields).some((value) => String(value).includes(boundary))) boundary += 'x'
  const parts = Object.entries(fields).map(
    ([name, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name.replace(/"/g, '%22')}"\r\n\r\n${value}\r\n`
  )
  return { body: parts.join('') + `--${boundary}--\r\n`, contentType: 'multipart/form-data; boundary=' + boundary }
}

/** 본문을 가질 수 없는 상태 코드 (Response 생성자가 본문을 거부한다) */
const NULL_BODY = new Set([101, 204, 205, 304])

export function createDirectFetch(options: {
  native: InboxNative
  cookies: CookieStore
  userAgent: () => string | null
}): (url: string, init?: DirectFetchInit) => Promise<Response> {
  const { native, cookies, userAgent } = options
  return async function directFetch(url, init = {}) {
    const headers = new Map<string, string>()
    const agent = userAgent()
    if (agent) headers.set('user-agent', agent)
    headers.set('accept', '*/*')
    headers.set('accept-language', 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7')
    for (const [name, value] of Object.entries(init.headers || {}))
      if (typeof value === 'string') headers.set(name.toLowerCase(), value)
    let body = init.body
    if (init.form) {
      const multipart = multipartBody(init.form)
      body = multipart.body
      headers.set('content-type', multipart.contentType)
    }
    if (init.cookies !== false) {
      const cookie = cookieHeader(cookies.get(), url)
      if (cookie) headers.set('cookie', cookie)
    }
    const result = await native.http({
      url,
      method: (init.method || 'GET').toUpperCase(),
      headers: [...headers.entries()],
      body,
      timeoutMs: init.timeoutMs ?? 15_000
    })
    // fetch의 redirect: 'error'와 같다. 로그인 페이지로 튕기는 응답을 정상 응답으로 읽지 않는다.
    if (result.status >= 300 && result.status < 400) throw new Error('UNEXPECTED_REDIRECT')
    if (init.cookies !== false) {
      let jar = cookies.get()
      let changed = false
      for (const [name, value] of result.headers) {
        if (name.toLowerCase() !== 'set-cookie') continue
        const parsed = parseSetCookie(value, url)
        if (!parsed) continue
        jar = storeCookie(jar, parsed)
        changed = true
      }
      if (changed) cookies.set(jar)
    }
    const responseHeaders = new Headers()
    for (const [name, value] of result.headers) {
      const lower = name.toLowerCase()
      // 본문은 이미 풀린 문자열이다. 길이·압축 헤더를 그대로 두면 Response가 본문을 잘못 해석한다.
      if (lower === 'set-cookie' || lower === 'content-length' || lower === 'content-encoding' || lower === 'transfer-encoding') continue
      try {
        responseHeaders.append(name, value)
      } catch {
        /* 표준에 맞지 않는 헤더 값은 버린다 */
      }
    }
    const status = result.status >= 200 && result.status <= 599 ? result.status : 502
    return new Response(NULL_BODY.has(status) ? null : result.body, { status, headers: responseHeaders })
  }
}

/** Cloudflare 같은 봇 확인 페이지인지. 로그인 문제가 아니라 접속 차단이므로 따로 알린다. */
export function looksLikeBotChallenge(response: Response, bodyStart = ''): boolean {
  if (response.headers.get('cf-mitigated')) return true
  if (response.status !== 403 && response.status !== 503) return false
  const type = response.headers.get('content-type') || ''
  return /text\/html/i.test(type) && /just a moment|cf-chl|challenge-platform|attention required/i.test(bodyStart)
}
