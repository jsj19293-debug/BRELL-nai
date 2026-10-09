/** 지금 설정된 저장 형식(NAIS / Nightmare)에 맞는 폴더 · 파일 이름. */
import { useSettingsStore } from '@/stores/settings-store'
import { storageNames } from '@/lib/storage-names'

const current = () => storageNames(useSettingsStore.getState().storageNaming)

export const sceneDirName = () => current().scene
export const outputDirName = () => current().output
export const libraryDirName = () => current().library
export const exifDirName = () => current().exif
export const fileNamePrefix = () => current().filePrefix
