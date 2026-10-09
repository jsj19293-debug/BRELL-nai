// 알림 모아보기가 쓰는 네이티브(Tauri) 기능 연결. 플랫폼 로직은 이 파일 밖에 있고,
// 테스트에서는 이 인터페이스를 가짜로 바꿔 끼운다.
import { invoke } from '@tauri-apps/api/core'

export interface NativeHttpRequest {
  url: string
  method: string
  headers: [string, string][]
  body?: string
  timeoutMs?: number
}
export interface NativeHttpResponse {
  status: number
  headers: [string, string][]
  body: string
}

export interface InboxNative {
  http(request: NativeHttpRequest): Promise<NativeHttpResponse>
  readFile(name: string): Promise<string | null>
  writeFile(name: string, data: string): Promise<void>
  vaultLoad(): Promise<string | null>
  vaultSave(data: string): Promise<void>
  profileInUse(): Promise<boolean>
  openSignIn(url: string): Promise<void>
  launchDebugBrowser(origins: string): Promise<void>
  debugEndpoint(): Promise<[number, string] | null>
  debugBrowserAlive(): Promise<boolean>
  waitDebugBrowserExit(timeoutMs: number): Promise<boolean>
  killDebugBrowser(): Promise<void>
}

/** Rust 커맨드는 오류를 문자열로 던진다. 코드가 그대로 message가 되게 Error로 감싼다. */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export const tauriInboxNative: InboxNative = {
  http: (request) => call('inbox_http', { request }),
  readFile: (name) => call('inbox_file_read', { name }),
  writeFile: (name, data) => call('inbox_file_write', { name, data }),
  vaultLoad: () => call('inbox_vault_load'),
  vaultSave: (data) => call('inbox_vault_save', { data }),
  profileInUse: () => call('inbox_profile_in_use'),
  openSignIn: (url) => call('inbox_open_sign_in', { url }),
  launchDebugBrowser: (origins) => call('inbox_launch_debug_browser', { origins }),
  debugEndpoint: () => call('inbox_debug_endpoint'),
  debugBrowserAlive: () => call('inbox_debug_browser_alive'),
  waitDebugBrowserExit: (timeout) => call('inbox_wait_debug_browser_exit', { timeout }),
  killDebugBrowser: () => call('inbox_kill_debug_browser')
}
