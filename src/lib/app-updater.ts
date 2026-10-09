import type { Update } from '@tauri-apps/plugin-updater'

// NAIS 2 RELL은 공식 NAIS2-Forge 릴리스로 자동 업데이트하지 않는다. 공식 설치 파일로 덮이면
// 이 빌드에만 있는 기능이 사라지기 때문이다. 새 버전은 직접 받은 설치 파일로 올린다.
export async function checkForAppUpdate(): Promise<Update | null> {
    return null
}
