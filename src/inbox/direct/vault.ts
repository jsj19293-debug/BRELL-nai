// Ported from NAIS3-Custom (seotk0319/NAIS3-Custom @ 05b3313, based on sunanakgo/NAIS3), GPL-3.0.
// Electron safeStorage 대신 Rust 쪽 Windows DPAPI로 암호화한다 (src-tauri/src/inbox_native.rs).
import type { InboxNative } from '../native.ts'
import type { JarCookie } from './cookie-jar.ts'
import type { SessionProfile } from './engine.mjs'

export interface DirectPlatform {
  profile: SessionProfile
  connectedAt: string
}
export interface DirectState {
  version: 1
  userAgent: string | null
  platforms: Partial<Record<string, DirectPlatform>>
  checkpoints: Record<string, { complete?: boolean; next?: string | null; page?: number | null } | undefined>
  lastRun: Record<string, number>
  /** 로그인 브라우저에서 가져온 플랫폼 쿠키 (Electron 세션 쿠키 저장소를 대신한다) */
  cookies: JarCookie[]
}
export const emptyDirectState = (): DirectState => ({
  version: 1,
  userAgent: null,
  platforms: {},
  checkpoints: {},
  lastRun: {},
  cookies: []
})

// Session profiles hold bearer and refresh tokens, so they are only ever written
// encrypted with the operating system's user key.
export function createVault(native: InboxNative): {
  load(): Promise<DirectState>
  save(state: DirectState): Promise<void>
} {
  let chain: Promise<void> = Promise.resolve()
  return {
    async load() {
      const raw = await native.vaultLoad()
      if (raw === null) return emptyDirectState()
      let value: Partial<DirectState> | null
      try {
        value = JSON.parse(raw)
      } catch {
        throw new Error('UNSUPPORTED_SESSION_STORE')
      }
      if (value?.version !== 1) throw new Error('UNSUPPORTED_SESSION_STORE')
      return {
        ...emptyDirectState(),
        ...value,
        cookies: Array.isArray(value.cookies) ? value.cookies : []
      }
    },
    save(state) {
      // 직렬화는 호출 시점의 상태로 한다: 뒤이은 변경이 앞선 저장에 섞이지 않는다.
      const data = JSON.stringify(state)
      const run = chain.then(() => native.vaultSave(data))
      chain = run.catch(() => undefined)
      return run
    }
  }
}
