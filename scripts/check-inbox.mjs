// 알림 모아보기(다른 플랫폼 댓글 관리)에서 NAIS2-Forge가 새로 맡은 부분의 검사:
// 쿠키 처리, fetch 모양의 전송, 수집기(가짜 네이티브 연결로 실제 엔진을 돌림), 서비스 조회.
// 플랫폼 응답 해석(엔진)은 NAIS3-Custom에서 그대로 가져왔고 그쪽 테스트로 검증돼 있다.
import assert from 'node:assert/strict'
import {
    cookieHeader, cookiesFor, fromBrowserCookie, parseSetCookie, pruneCookies, storeCookie,
} from '../src/inbox/direct/cookie-jar.ts'
import { createDirectFetch, looksLikeBotChallenge, multipartBody } from '../src/inbox/direct/http.ts'
import { createDirectCollector, tokenPayload } from '../src/inbox/direct/collector.ts'
import { allowedOrigins } from '../src/inbox/direct/login-browser.ts'
import { profileUpdate } from '../src/inbox/direct/engine.mjs'
import { createInboxService, directMessage } from '../src/inbox/service.ts'
import { createStore } from '../src/inbox/core/store.ts'
import { thumbnailFor, catalogFrom } from '../src/inbox/work-images.ts'

const NOW = Date.UTC(2026, 9, 9, 2, 0, 0)
const seconds = NOW / 1000

// ---------------------------------------------------------------- 쿠키
{
    const session = fromBrowserCookie({ name: 'sid', value: 'a', domain: '.genit.ai', path: '/', expires: -1, secure: true, httpOnly: true, session: true }, NOW)
    assert.equal(session.domain, 'genit.ai')
    assert.equal(session.hostOnly, false)
    assert.equal(session.expires, seconds + 30 * 86_400, '세션 쿠키는 한 달 보관')
    const hostOnly = fromBrowserCookie({ name: 'h', value: 'b', domain: 'api.genit.ai', path: '/api', expires: seconds + 60, secure: true, httpOnly: false }, NOW)
    assert.equal(hostOnly.hostOnly, true)
    assert.equal(fromBrowserCookie({ name: 'p', value: 'c', domain: '.genit.ai', path: '/', expires: 1, secure: true, httpOnly: false, partitionKey: {} }, NOW), null, '분할 쿠키는 가져오지 않는다')

    const jar = [session, hostOnly, { ...session, name: 'old', expires: seconds - 1 }]
    assert.equal(cookieHeader(jar, 'https://api.genit.ai/api/notifications/', NOW), 'h=b; sid=a', '구체적인 경로가 먼저, 만료된 쿠키는 제외')
    assert.equal(cookieHeader(jar, 'https://genit.ai/ko', NOW), 'sid=a')
    assert.equal(cookieHeader(jar, 'https://api.genit.ai/apix', NOW), 'sid=a', '경로는 구분자 단위로 맞춘다')
    assert.equal(cookieHeader(jar, 'https://evilgenit.ai/', NOW), '', '비슷한 이름의 다른 도메인에는 보내지 않는다')
    assert.equal(cookieHeader(jar, 'https://sub.api.genit.ai/api/x', NOW), 'sid=a', 'host-only 쿠키는 하위 도메인에 보내지 않는다')
    assert.equal(cookieHeader(jar, 'http://genit.ai/', NOW), '', 'https가 아니면 보내지 않는다')
    assert.equal(cookiesFor(jar, 'not a url', NOW).length, 0)
    assert.equal(pruneCookies(jar, NOW).length, 2)

    const set = parseSetCookie('bc__session_refresh=new; Path=/; Domain=.babechat.ai; Max-Age=3600; Secure; HttpOnly', 'https://babechat.ai/api/x', NOW)
    assert.deepEqual(set, { name: 'bc__session_refresh', value: 'new', domain: 'babechat.ai', hostOnly: false, path: '/', secure: true, httpOnly: true, expires: seconds + 3600 })
    assert.equal(parseSetCookie('a=b; Domain=other.com', 'https://babechat.ai/', NOW), null, '다른 사이트용 쿠키는 버린다')
    assert.equal(parseSetCookie('novalue', 'https://babechat.ai/', NOW), null)
    assert.equal(parseSetCookie('a=b', 'https://babechat.ai/api/v1/thing', NOW).path, '/api/v1', '기본 경로는 요청 경로의 디렉터리')
    assert.equal(parseSetCookie('a=b=c; Path=/', 'https://babechat.ai/', NOW).value, 'b=c')
    const expiresDate = parseSetCookie('a=b; Expires=Wed, 21 Oct 2026 07:28:00 GMT', 'https://babechat.ai/', NOW)
    assert.equal(expiresDate.expires, Date.parse('2026-10-21T07:28:00Z') / 1000)

    let stored = storeCookie([], set, NOW)
    stored = storeCookie(stored, { ...set, value: 'newer' }, NOW)
    assert.equal(stored.length, 1)
    assert.equal(stored[0].value, 'newer', '같은 이름·도메인·경로는 교체')
    assert.equal(storeCookie(stored, { ...set, expires: seconds - 10 }, NOW).length, 0, '만료된 Set-Cookie는 삭제를 뜻한다')
}

// ---------------------------------------------------------------- multipart
{
    const { body, contentType } = multipartBody({ csrf_token: 't', content: '안녕 "하세요"\n둘째 줄' }, 'seed')
    assert.equal(contentType, 'multipart/form-data; boundary=----NAIS2ForgeFormBoundaryseed')
    assert.ok(body.startsWith('------NAIS2ForgeFormBoundaryseed\r\nContent-Disposition: form-data; name="csrf_token"\r\n\r\nt\r\n'))
    assert.ok(body.includes('name="content"\r\n\r\n안녕 "하세요"\n둘째 줄\r\n'))
    assert.ok(body.endsWith('------NAIS2ForgeFormBoundaryseed--\r\n'))
    // 값 안에 경계 문자열이 있으면 겹치지 않는 경계로 바꾼다.
    const clash = multipartBody({ a: '----NAIS2ForgeFormBoundaryseed' }, 'seed')
    assert.ok(clash.contentType.endsWith('seedx'))
}

// ---------------------------------------------------------------- fetch 모양 전송
function fakeNative(handler, files = {}) {
    const log = []
    let vault = null
    return {
        log,
        files,
        get vault() { return vault },
        set vault(value) { vault = value },
        native: {
            async http(request) {
                log.push(request)
                const result = await handler(request)
                return { status: 200, headers: [['content-type', 'application/json']], body: '', ...result }
            },
            async readFile(name) { return name in files ? files[name] : null },
            async writeFile(name, data) { files[name] = data },
            async vaultLoad() { return vault },
            async vaultSave(data) { vault = data },
            async profileInUse() { return false },
            async openSignIn() { throw new Error('BROWSER_NOT_FOUND') },
            async launchDebugBrowser() { throw new Error('BROWSER_NOT_FOUND') },
            async debugEndpoint() { return null },
            async debugBrowserAlive() { return false },
            async waitDebugBrowserExit() { return true },
            async killDebugBrowser() {},
        },
    }
}
const json = (value, status = 200, headers = []) => ({ status, headers: [['content-type', 'application/json'], ...headers], body: JSON.stringify(value) })

{
    let jar = [{ name: 'sid', value: 'one', domain: 'nekochat.xyz', hostOnly: false, path: '/', secure: true, httpOnly: true, expires: Date.now() / 1000 + 600 }]
    const fake = fakeNative(async request => {
        if (request.url.endsWith('/redirect')) return { status: 302, headers: [['location', 'https://www.nekochat.xyz/login']] }
        if (request.url.endsWith('/empty')) return { status: 204, headers: [] }
        return json({ ok: true }, 200, [['set-cookie', 'sid=two; Path=/; Domain=nekochat.xyz; Max-Age=600'], ['content-length', '999'], ['content-encoding', 'gzip']])
    })
    const directFetch = createDirectFetch({ native: fake.native, cookies: { get: () => jar, set: next => { jar = next } }, userAgent: () => 'TestAgent/1.0' })

    const response = await directFetch('https://www.nekochat.xyz/api/notifications?limit=5', { headers: { Authorization: 'Bearer x' } })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
    assert.equal(response.headers.get('content-encoding'), null, '본문 해석을 흐트러뜨리는 헤더는 뺀다')
    const sent = Object.fromEntries(fake.log[0].headers)
    assert.equal(sent['user-agent'], 'TestAgent/1.0')
    assert.equal(sent.authorization, 'Bearer x', '헤더 이름은 소문자로 한 번만')
    assert.equal(sent.cookie, 'sid=one')
    assert.equal(fake.log[0].method, 'GET')
    assert.equal(jar[0].value, 'two', 'Set-Cookie가 저장소에 반영된다')

    await directFetch('https://www.nekochat.xyz/api/x', { cookies: false })
    assert.equal(Object.fromEntries(fake.log[1].headers).cookie, undefined, 'cookies:false면 쿠키를 붙이지 않는다')

    await assert.rejects(directFetch('https://www.nekochat.xyz/redirect'), /UNEXPECTED_REDIRECT/)
    assert.equal((await directFetch('https://www.nekochat.xyz/empty')).status, 204)

    await directFetch('https://lunatalk.chat/character/api', { method: 'post', form: { action: 'get_comments' } })
    const formRequest = fake.log.at(-1)
    assert.equal(formRequest.method, 'POST')
    assert.match(Object.fromEntries(formRequest.headers)['content-type'], /^multipart\/form-data; boundary=/)
    assert.ok(formRequest.body.includes('name="action"\r\n\r\nget_comments\r\n'))
}

{
    const html = new Response('<html><title>Just a moment...</title></html>', { status: 403, headers: { 'content-type': 'text/html; charset=UTF-8' } })
    assert.equal(looksLikeBotChallenge(html, '<html><title>Just a moment...</title>'), true)
    assert.equal(looksLikeBotChallenge(new Response('{}', { status: 403, headers: { 'content-type': 'application/json' } }), '{}'), false, '평범한 403은 로그인 만료다')
    assert.equal(looksLikeBotChallenge(new Response('x', { status: 200, headers: { 'cf-mitigated': 'challenge' } }), 'x'), true)
    assert.equal(looksLikeBotChallenge(new Response('<html>Just a moment</html>', { status: 200, headers: { 'content-type': 'text/html' } }), '<html>Just a moment</html>'), false)
}

// ---------------------------------------------------------------- 작은 도우미
{
    const token = 'x.' + Buffer.from(JSON.stringify({ sub: 'user-1', name: '한글' })).toString('base64url') + '.y'
    assert.deepEqual(tokenPayload('Bearer ' + token), { sub: 'user-1', name: '한글' })
    assert.equal(tokenPayload('not-a-token'), null)
    assert.equal(tokenPayload(''), null)
    assert.equal(allowedOrigins('http://localhost:9090'), 'http://tauri.localhost,https://tauri.localhost,tauri://localhost,http://localhost:9090')
    assert.equal(allowedOrigins('http://tauri.localhost'), 'http://tauri.localhost,https://tauri.localhost,tauri://localhost')
    assert.equal(allowedOrigins('x --flag'), 'http://tauri.localhost,https://tauri.localhost,tauri://localhost', '출처 모양이 아니면 넣지 않는다')
    assert.match(directMessage('BROWSER_NOT_FOUND'), /크롬이나 엣지/)
    assert.match(directMessage('BROWSER_START_TIMEOUT: os error 5'), /로그인 창을 열지 못했어요/)
    assert.match(directMessage('SOMETHING_ELSE'), /SOMETHING_ELSE/)
    // 썸네일은 전용 프로토콜 없이 https 주소 그대로
    const catalog = catalogFrom([{ id: 'w1', name: '작품', mainImage: 'https://cdn.example.com/a.webp' }])
    assert.equal(thumbnailFor({ platform: 'babe', work: { id: 'w1' } }, catalog), 'https://cdn.example.com/a.webp')
}

// ---------------------------------------------------------------- 수집기: 저장된 세션으로 실제 엔진을 돌린다
const teaToken = claims => 'test.' + Buffer.from(JSON.stringify({
    iss: 'https://securetoken.google.com/chat-ai-7a275', aud: 'chat-ai-7a275', sub: 'test-self', ...claims,
})).toString('base64url') + '.test'
const memoryStore = files => createStore({ read: async () => files['inbox.json'] ?? null, write: async data => { files['inbox.json'] = data } })
const vaultWith = platforms => JSON.stringify({ version: 1, userAgent: 'Mozilla/5.0 Chrome/140', platforms, checkpoints: {}, lastRun: {}, cookies: [] })

{
    // 티팟: 내 알림은 읽히고 전체 공지만 거절되면 연결을 유지한다.
    const exp = Math.floor(Date.now() / 1000) + 3600
    const profile = profileUpdate('teapot', { origin: 'https://firestore.googleapis.com', headers: { authorization: 'Bearer ' + teaToken({ exp }) } })
    const fake = fakeNative(async request => {
        if (request.url.includes('/documents/users/')) {
            return json([{ document: { name: 'projects/chat-ai-7a275/databases/(default)/documents/users/test-self/notice/n1', fields: {
                tag: { stringValue: '댓글' }, title: { stringValue: "'작품' 새 댓글" }, content: { stringValue: '재밌어요' },
                by_name: { stringValue: '독자' }, character_id: { stringValue: 'oc1' }, comment_id: { stringValue: 'c1' },
                time_created: { timestampValue: '2026-10-09T01:00:00Z' },
            } } }])
        }
        if (request.url.includes('/documents/notice/v1:runQuery')) return json({ error: { status: 'PERMISSION_DENIED' } }, 403)
        throw new Error('UNEXPECTED_REQUEST ' + request.url)
    })
    fake.vault = vaultWith({ teapot: { profile, connectedAt: new Date().toISOString() } })
    const store = await memoryStore(fake.files)
    const collector = createDirectCollector({ native: fake.native, store, version: 'test', captureScript: '' })
    await collector.collect()
    const view = await store.view()
    assert.equal(view.items.length, 1)
    assert.equal(view.items[0].platform, 'teapot')
    assert.equal(view.items[0].event, 'comment')
    assert.equal(view.platforms.teapot.status, 'ok')
    assert.equal(fake.log.length, 2)
    assert.equal(fake.log[0].method, 'POST')
    const sent = Object.fromEntries(fake.log[0].headers)
    assert.match(sent.authorization, /^Bearer test\./)
    assert.equal(sent['user-agent'], 'Mozilla/5.0 Chrome/140')
    assert.equal(sent['content-type'], 'application/json')
    assert.equal((await collector.status()).platforms.teapot.connected, true)
    // 방금 수집했으므로 5분 안에는 다시 요청하지 않는다.
    await collector.collect()
    assert.equal(fake.log.length, 2)
    // "지금 수집"은 그 간격과 상관없이 다시 읽는다.
    await collector.collectAll()
    assert.equal(fake.log.length, 4)
    await collector.stop()
}

{
    // 네코: 쿠키 세션. 401이면 "로그인 필요"로 기록하고 저장된 알림은 건드리지 않는다.
    let mode = 'ok'
    const fake = fakeNative(async request => {
        assert.equal(new URL(request.url).pathname, '/api/notifications')
        if (mode === 'expired') return json({ error: 'unauthorized' }, 401)
        if (mode === 'challenge') return { status: 403, headers: [['content-type', 'text/html']], body: '<html><title>Just a moment...</title></html>' }
        return json({ notifications: [{ id: 'n1', type: 'comment', actor: { id: 'u1', nickname: '독자' }, payload: { character_id: 'char_1_abc', character_name: '네코 작품' }, message: '좋아요!', createdAt: '2026-10-09T01:00:00Z', isRead: false }], pagination: { hasMore: false } })
    })
    fake.vault = JSON.stringify({
        version: 1, userAgent: null, checkpoints: {}, lastRun: {},
        platforms: { neko: { profile: { headers: {}, headersByOrigin: {}, routes: {}, queries: [] }, connectedAt: new Date().toISOString() } },
        cookies: [{ name: 'session', value: 'neko-cookie', domain: 'nekochat.xyz', hostOnly: false, path: '/', secure: true, httpOnly: true, expires: Date.now() / 1000 + 3600 }],
    })
    const store = await memoryStore(fake.files)
    const collector = createDirectCollector({ native: fake.native, store, version: 'test', captureScript: '' })
    await collector.collect()
    let view = await store.view()
    assert.equal(view.items.length, 1)
    assert.equal(view.items[0].actor.name, '독자')
    assert.equal(view.items[0].work.url, 'https://www.nekochat.xyz/character/char_1_abc')
    assert.equal(Object.fromEntries(fake.log[0].headers).cookie, 'session=neko-cookie', '가져온 쿠키로 요청한다')

    // 다음 수집 주기를 흉내 내려고 마지막 실행 시각을 지운다.
    const rewind = () => { const state = JSON.parse(fake.vault); state.lastRun = {}; return state }
    const again = async nextMode => {
        mode = nextMode
        const fresh = fakeNative(async request => fake.native.http(request), fake.files)
        fresh.vault = JSON.stringify(rewind())
        const next = createDirectCollector({ native: { ...fresh.native, http: fake.native.http }, store, version: 'test', captureScript: '' })
        await next.collect()
        await next.stop()
        return (await store.view()).platforms.neko
    }
    const expired = await again('expired')
    assert.equal(expired.status, 'login')
    assert.match(expired.detail, /SESSION_EXPIRED/)
    const challenged = await again('challenge')
    assert.equal(challenged.status, 'error', '봇 확인 페이지는 로그인 만료로 취급하지 않는다')
    assert.match(challenged.detail, /BOT_CHALLENGE/)
    view = await store.view()
    assert.equal(view.items.length, 1, '실패해도 이미 모은 알림은 남는다')
    await collector.stop()
}

{
    // 크랙: 만료된 토큰은 저장된 refresh 토큰으로 한 번 갱신하고 같은 요청을 다시 보낸다.
    const jwt = exp => 'h.' + Buffer.from(JSON.stringify({ exp })).toString('base64url') + '.s'
    const old = jwt(Math.floor(Date.now() / 1000) + 3600)
    const fresh = jwt(Math.floor(Date.now() / 1000) + 7200)
    let profile = profileUpdate('crack', { origin: 'https://crack-api.wrtn.ai', url: 'https://crack-api.wrtn.ai/crack-api/alarm?page=1&limit=20', headers: { authorization: 'Bearer ' + old } })
    profile = profileUpdate('crack', { origin: 'https://crack-api.wrtn.ai', renewal: { kind: 'crack', refreshToken: 'refresh-token-0123456789' } }, profile)
    const fake = fakeNative(async request => {
        const url = new URL(request.url)
        const headers = Object.fromEntries(request.headers)
        if (url.pathname === '/auth/v2/token/refresh') {
            assert.equal(request.method, 'POST')
            assert.equal(headers.refresh, 'refresh-token-0123456789')
            assert.equal(headers.cookie, undefined, '갱신 요청에는 쿠키를 붙이지 않는다')
            return json({ access_token: fresh, refresh_token: 'rotated-token-0123456789' })
        }
        if (headers.authorization === 'Bearer ' + old) return json({ message: 'expired' }, 401)
        assert.equal(headers.authorization, 'Bearer ' + fresh)
        return json({ data: { alarms: [], hasNext: false } })
    })
    fake.vault = vaultWith({ crack: { profile, connectedAt: new Date().toISOString() } })
    const store = await memoryStore(fake.files)
    const collector = createDirectCollector({ native: fake.native, store, version: 'test', captureScript: '' })
    await collector.collect()
    assert.deepEqual(fake.log.map(request => new URL(request.url).pathname), ['/crack-api/alarm', '/auth/v2/token/refresh', '/crack-api/alarm'])
    assert.equal((await store.view()).platforms.crack.status, 'ok')
    const saved = JSON.parse(fake.vault)
    assert.equal(saved.platforms.crack.profile.headers.authorization, 'Bearer ' + fresh, '새 토큰이 보관함에 저장된다')
    assert.equal(saved.platforms.crack.profile.renewal.refreshToken, 'rotated-token-0123456789')
    await collector.stop()
}

{
    // 수집 경로는 읽기 전용이고, 허용된 주소 밖으로는 나가지 않는다.
    const fake = fakeNative(async () => { throw new Error('SHOULD_NOT_REQUEST') })
    fake.vault = vaultWith({ genit: { profile: { headers: {}, headersByOrigin: {}, routes: { '/api/notifications/': 'https://evil.example.com/api/notifications/' }, queries: [] }, connectedAt: new Date().toISOString() } })
    const store = await memoryStore(fake.files)
    const collector = createDirectCollector({ native: fake.native, store, version: 'test', captureScript: '' })
    await collector.collect()
    assert.equal(fake.log.length, 0)
    const status = (await store.view()).platforms.genit
    assert.equal(status.status, 'error')
    assert.match(status.detail, /UNAPPROVED_READ_ROUTE/)
    // 답글도 그 플랫폼의 댓글 주소로만 간다.
    await assert.rejects(collector.reply('genit', { platform: 'genit', sourceType: 'creator_character_comment', event: 'comment', title: '', body: 'x', at: null, actor: { name: null }, work: { id: 'w' }, commentId: 'c' }, '고마워요'), /LOGIN_REQUIRED/, 'CSRF 쿠키가 없으면 보내지 않는다')
    assert.equal(fake.log.length, 0)
    await collector.stop()
}

{
    // 연결: 브라우저가 없으면 오류 코드가 그대로 올라오고, 연결 안 된 상태로 남는다.
    const fake = fakeNative(async () => json({}))
    const store = await memoryStore(fake.files)
    const collector = createDirectCollector({ native: fake.native, store, version: 'test', captureScript: '' })
    assert.deepEqual(await collector.connect('eden'), { state: 'error', detail: 'BROWSER_NOT_FOUND' })
    assert.equal((await collector.status()).platforms.eden.connected, false)
    // 로그인 창을 열 수 있으면 "로그인 필요" 상태로 기다린다.
    const opened = []
    const waiting = createDirectCollector({ native: { ...fake.native, openSignIn: async url => { opened.push(url) } }, store, version: 'test', captureScript: '' })
    assert.deepEqual(await waiting.connect('babe'), { state: 'login-required', detail: null })
    assert.deepEqual(opened, ['https://babechat.ai/notification?tab=my'])
    const status = await waiting.status()
    assert.equal(status.platforms.babe.awaitingLogin, true)
    assert.equal(status.platforms.babe.windowOpen, true)
    await waiting.stop()
    await collector.stop()
}

// ---------------------------------------------------------------- 서비스
{
    const fake = fakeNative(async request => {
        if (request.url.includes('/api/notifications')) {
            return json({ notifications: [
                { id: 'n1', type: 'comment', actor: { id: 'u1', nickname: '독자' }, payload: { character_id: 'char_1_abc', character_name: '네코 작품' }, message: '첫 댓글', createdAt: '2026-10-09T01:00:00Z', isRead: false },
                { id: 'n2', type: 'character_like', actor: { id: 'u2', nickname: '팬' }, payload: { character_id: 'char_1_abc', character_name: '네코 작품' }, createdAt: '2026-10-09T00:30:00Z', isRead: true },
            ], pagination: { hasMore: false } })
        }
        if (request.url.includes('/api/characters/char_1_abc/comments')) {
            if (request.method === 'POST') return json({ comment: { id: 'reply-1' } })
            return json({ comments: [{ id: 'c9', content: '첫 댓글', createdAt: '2026-10-09T01:00:02Z', authorNickname: '독자' }] })
        }
        if (request.url.includes('/api/characters/char_1_abc')) return json({ character: { avatar: { url: 'https://img.nekochat.xyz/a.png' } } })
        return json({}, 404)
    })
    fake.vault = JSON.stringify({
        version: 1, userAgent: null, checkpoints: {}, lastRun: {},
        platforms: { neko: { profile: { headers: {}, headersByOrigin: {}, routes: {}, queries: [] }, connectedAt: new Date().toISOString() } },
        cookies: [],
    })
    const service = createInboxService({ native: fake.native, version: '1.13.0', origin: null, captureScript: '' })
    const empty = await service.query({})
    assert.equal(empty.available, true)
    assert.equal(empty.total, 0)
    assert.equal(empty.platforms.find(p => p.id === 'neko').appConnected, true)
    assert.equal(empty.platforms.length, 9)

    await service.collectNow()
    const all = await service.query({})
    assert.equal(all.total, 2)
    assert.equal(all.events.comment, 1)
    assert.equal(all.events.like, 1)
    const conversation = await service.query({ event: 'conversation' })
    assert.equal(conversation.items.length, 1)
    const comment = conversation.items[0]
    assert.equal(comment.canReply, true)
    assert.equal(comment.unread, true)
    assert.equal((await service.query({ search: '팬' })).items.length, 1)
    assert.equal((await service.query({ unreplied: true })).items.length, 1)
    assert.equal(await service.sourceUrl(comment.id), 'https://www.nekochat.xyz/character/char_1_abc')

    const target = await service.previewReply(comment.id)
    assert.deepEqual(target, { ok: true, message: '', author: '독자', content: '첫 댓글', at: '2026-10-09T01:00:02Z' })
    assert.deepEqual(await service.reply(comment.id, '   '), { ok: false, message: '답글은 1자 이상 1000자 이하로 써주세요.' })
    assert.deepEqual(await service.reply(comment.id, ' 고마워요! '), { ok: true, message: '답글을 달았어요.' })
    const posted = fake.log.find(request => request.method === 'POST')
    assert.deepEqual(JSON.parse(posted.body), { content: '고마워요!', parentCommentId: 'c9', isSecret: false })
    assert.equal(Object.fromEntries(posted.headers)['content-type'], 'application/json')

    const after = await service.query({ event: 'conversation' })
    assert.equal(after.items[0].replied.content, '고마워요!')
    assert.equal(after.items[0].replied.via, 'app')
    assert.equal((await service.query({ unreplied: true })).items.length, 0, '답글을 단 댓글은 "답글 안 단 것만"에서 빠진다')
    assert.equal(JSON.parse(fake.files['replied.json']).items[comment.id].content, '고마워요!')

    // 좋아요 알림에는 답글을 달 수 없다.
    const like = (await service.query({ event: 'reaction' })).items[0]
    assert.equal(like.canReply, false)
    assert.equal((await service.reply(like.id, '고마워요')).ok, false)

    // 끈 플랫폼은 목록에서 빠지지만 저장된 알림은 남는다.
    await service.select('neko', false)
    assert.equal((await service.query({})).total, 0)
    await service.select('neko', true)
    assert.equal((await service.query({})).total, 2)

    assert.deepEqual(await service.control(false), { enabled: false })
    assert.equal((await service.setInterval(30)).intervalMinutes, 30)
    await assert.rejects(service.setInterval(7), /Unsupported collection interval/)
    await assert.rejects(service.connect('not-a-platform'), /Invalid platform/)
    assert.deepEqual(await service.connect('luna'), { state: 'error', message: '크롬이나 엣지를 찾지 못했어요. 둘 중 하나를 설치한 뒤 다시 눌러주세요.' })
    await service.close()
}

{
    // 손상된 저장 파일은 덮어쓰지 않고, 화면에는 "사용할 수 없음"으로 알린다.
    const fake = fakeNative(async () => json({}), { 'inbox.json': '{not json' })
    const service = createInboxService({ native: fake.native, version: 't', origin: null, captureScript: '' })
    const result = await service.query({})
    assert.equal(result.available, false)
    assert.match(result.error, /보존/)
    assert.equal(fake.files['inbox.json'], '{not json')
    await service.close()
}

console.log('Inbox checks passed: cookies, transport, collector (collect/renew/expire/challenge/routes), service (query/reply/select).')
