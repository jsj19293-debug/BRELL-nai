// 앱 전체에서 하나만 쓰는 알림 모아보기 서비스. 화면을 열지 않아도 앱이 켜져 있는 동안 주기적으로 모은다.
import { getVersion } from '@tauri-apps/api/app'
import { tauriInboxNative } from './native.ts'
import { CAPTURE_SCRIPT } from './direct/capture-script.ts'
import { createInboxService, type InboxService } from './service.ts'

let service: InboxService | null = null
let pending: Promise<InboxService> | null = null

export function getInboxService(): Promise<InboxService> {
  if (service) return Promise.resolve(service)
  if (!pending)
    pending = getVersion()
      .catch(() => '')
      .then((version) => {
        service = createInboxService({
          native: tauriInboxNative,
          version,
          origin: typeof window === 'undefined' ? null : window.location.origin,
          captureScript: CAPTURE_SCRIPT
        })
        return service
      })
  return pending
}

/** 앱 시작 시 한 번 부른다. 연결된 플랫폼이 없으면 아무 요청도 보내지 않는다. */
export function startInboxInBackground(): void {
  void getInboxService()
    .then((inbox) => inbox.start())
    .catch(() => undefined)
}
