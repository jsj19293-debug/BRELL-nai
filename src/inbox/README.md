# 알림 모아보기 (다른 플랫폼 댓글 관리)

에덴·베이비챗·루나·엘린·네코·티팟·크랙·알플레이·젠잇의 댓글·답글·좋아요·팔로우를 한 화면에 모으고,
댓글에는 앱에서 바로 답글을 답니다. 화면은 `src/pages/Inbox.tsx`입니다.

## 출처

[NAIS3-Custom](https://github.com/seotk0319/NAIS3-Custom)(커밋 `05b3313`, GPL-3.0,
[sunanakgo/NAIS3](https://github.com/sunanakgo/NAIS3) 기반)의 `src/main/notifications`를 옮겼습니다.

| 파일 | 상태 |
| --- | --- |
| `core/api/*.mjs`, `core/api/capture.js`, `core/schedule.mjs`, `direct/engine.mjs` | 그대로 |
| `shared.ts`, `query.ts`, `replied.ts`, `work-images.ts`, `direct/replies.ts`, `direct/babe-reply.ts`, `direct/platforms.ts`, `direct/work-image-routes.ts`, `direct/cdp.ts` | import 경로 등 최소 수정 |
| `core/store.ts`, `direct/collector.ts`, `direct/login-browser.ts`, `direct/vault.ts`, `service.ts` | Electron → Tauri로 다시 연결 (판단 로직은 같음) |
| `native.ts`, `direct/http.ts`, `direct/cookie-jar.ts`, `view-model.ts`, `index.ts` | 새로 작성 |

AI 자동 답글과 DeepL 번역은 옮기지 않았습니다.

## Electron과 다른 점

- **요청 전송**: Electron 세션의 `fetch` 대신 Rust 커맨드 `inbox_http`(reqwest)가 보냅니다.
  허용된 플랫폼 호스트로만 나가고 리다이렉트는 따라가지 않습니다. 쿠키는 `direct/cookie-jar.ts`가 관리합니다.
  크롬과 TLS 지문이 달라서, 봇 차단이 켜진 사이트는 막힐 수 있습니다. 그 경우 "수집 오류 · 보안 확인"으로 표시되고
  로그인은 유지됩니다.
- **로그인 정보 저장**: `safeStorage` 대신 Windows DPAPI(`src-tauri/src/inbox_native.rs`)로 암호화해
  `<앱 데이터>/creator-inbox/direct-sessions.bin`에 둡니다. Windows가 아니면 저장하지 않고 안내만 합니다.
- **로그인 브라우저**: 크롬(없으면 엣지)을 앱 전용 프로필(`<앱 데이터>/moa-login/browser-profile`)로 실행합니다.
  로그인 창은 평범한 창이고, 닫힌 뒤에만 DevTools로 다시 열어 세션을 읽습니다. DevTools 연결은 웹뷰의 WebSocket으로 합니다.
- **썸네일**: 전용 프로토콜 없이 https 이미지를 웹뷰가 직접 불러옵니다.
- **수집 시점**: 수집기는 웹뷰 안에서 돌기 때문에 앱이 켜져 있는 동안만 모읍니다.

## 검사

```
npm run check:inbox
cargo test --manifest-path src-tauri/Cargo.toml inbox_native
```

엔진(플랫폼 응답 해석·갱신·답글 규칙)은 NAIS3-Custom의 테스트(`tests/engine.test.mjs`, `tests/inbox*.test.ts` 등)로
검증된 코드를 그대로 쓰고, `check:inbox`는 NAIS2-Forge에서 새로 맡은 부분을 가짜 네이티브 연결로 검사합니다.
