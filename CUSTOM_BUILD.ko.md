# 커스텀 빌드 안내 (NAIS2-Forge v1.13.0 기반)

이 문서는 아래 기능이 추가된 소스를 내 PC에서 실행하거나 설치 파일로 만드는 방법입니다.

## 추가된 기능

| 기능 | 위치 |
| --- | --- |
| V5 잔량(%)·예상 장수·충전 속도, 구독 만료일(D-day) | 왼쪽 패널 상단, 계정 메뉴, 설정 > API |
| 알림 모아보기: 9개 플랫폼 댓글·답글·좋아요·팔로우, 앱에서 답글 | 상단 메뉴 "알림" |
| 한글 → 태그 추천 (내장 용어집 + Claude / GPT / Gemini) | 프롬프트 입력 칸, AI 프롬프트 생성 창, 설정 > API |
| 캐릭터 여러 개 선택해서 삭제 | 캐릭터 패널 검색창 옆 버튼 |
| 레퍼런스 → i2i 자동 싸이클 | 씬 모드 상단 도구 모음 |

## 준비물 (Windows)

1. [Node.js](https://nodejs.org/) LTS (22 이상)
2. [Rust](https://rustup.rs/) (rustup으로 설치, stable)
3. Microsoft C++ Build Tools ("C++를 사용한 데스크톱 개발" 워크로드) — Rust 설치 화면이 안내합니다.
4. WebView2 런타임 (Windows 10/11에는 보통 이미 있습니다)

## 실행해 보기 (설치 없이)

소스 폴더에서 명령 프롬프트나 PowerShell을 열고:

```
npm install
npm run tauri:dev
```

처음에는 Rust 빌드 때문에 10분 넘게 걸릴 수 있습니다. 개발용 실행은 "NAIS2-Forge Dev"라는 별도 앱으로 뜨고,
설치된 NAIS2-Forge와 데이터가 분리돼 있습니다 (기존 데이터를 건드리지 않습니다).

## 설치 파일 만들기

```
npm install
npm run tauri:build:local
```

끝나면 `src-tauri/target/release/bundle/nsis/` 안에 `NAIS2-Forge_1.13.0_x64-setup.exe`가 생깁니다.

- `tauri:build:local`은 업데이트 서명 없이 빌드합니다. 원본의 `tauri:build`는 제작자의 서명 키가 있어야 해서
  그대로는 마지막 단계에서 실패합니다.
- 이 설치 파일은 기존 NAIS2-Forge와 **같은 앱으로 설치**됩니다. 프리셋·씬·설정이 그대로 이어집니다.
  설치 전에 설정 > 백업에서 한 번 내보내 두는 것을 권합니다.
- **앱이 "새 버전이 있습니다"라고 물어도 업데이트하지 마세요.** 업데이트는 원본 저장소의 공식 버전으로
  바꿔 설치하므로, 여기서 추가한 기능이 사라집니다.

## 빌드 전에 검사해 보기 (선택)

```
npm run check:account-status
npm run check:inbox
npm run check:ko-tags
npm run check:character-bulk-delete
npm run check:scene-i2i-cycle
npm run build
cargo test --manifest-path src-tauri/Cargo.toml inbox_native
```

## 알아 둘 점

- **알림 모아보기**는 NAIS3-Custom의 기능을 Tauri로 옮긴 것입니다. 플랫폼 응답을 해석하는 부분은 원본 그대로이고,
  요청을 보내는 부분은 새로 만들었습니다. 사이트가 봇 차단을 걸어 둔 경우 그 플랫폼은 "수집 오류 · 보안 확인"으로
  표시될 수 있습니다. 로그인 정보는 Windows 사용자 계정으로 암호화해 이 PC에만 저장합니다 (Windows 전용).
- **한글 → 태그**에서 Claude·GPT 키를 넣으면 한글 입력을 멈출 때마다 한 번씩 요청이 나가고 요금이 듭니다.
  같은 말은 저장해 두고 다시 묻지 않습니다. 설정에서 끌 수 있고, 끄면 내장 용어집(435개)만 씁니다.
- **레퍼런스 → i2i 싸이클**을 켜면 생성 횟수가 두 배가 됩니다. 1단계 이미지와 i2i 이미지가 모두 같은 씬에 남습니다.
- 수정본을 다른 사람에게 배포하려면 GPL-3.0에 따라 이 소스도 함께 공개해야 합니다.
