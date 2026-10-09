/** 폴더 관리자·씬 폴더 새로고침이 쓰는 파일 시스템 호출 모음. */
import { invoke } from '@tauri-apps/api/core'
import { join, pictureDir } from '@tauri-apps/api/path'
import { exists, mkdir } from '@tauri-apps/plugin-fs'
import { Command } from '@tauri-apps/plugin-shell'
import { useFolderStore } from '@/stores/folder-store'
import { useSettingsStore } from '@/stores/settings-store'
import { getSceneFolderFromImages, sanitizeSceneFolderName } from '@/lib/scene-path'
import { pathKey, type FolderFile } from '@/lib/scene-folder-sync'

export const DEFAULT_WORK_ROOT_NAME = 'NAIS2_RELL'

export interface WorkFolder {
    name: string
    path: string
    imageCount: number
    modifiedMs: number
}

export interface FolderImages {
    folder: string
    exists: boolean
    files: FolderFile[]
}

/** 작품 폴더들을 모아 두는 위치 (설정하지 않았으면 사진 폴더 아래 NAIS2_RELL). */
export async function resolveWorkRoot(): Promise<string> {
    const configured = useFolderStore.getState().rootPath
    return configured || join(await pictureDir(), DEFAULT_WORK_ROOT_NAME)
}

export async function ensureFolder(path: string): Promise<void> {
    if (!(await exists(path))) await mkdir(path, { recursive: true })
}

export async function openFolder(path: string): Promise<void> {
    await ensureFolder(path)
    await Command.create('explorer', [path]).execute()
}

export async function listWorkFolders(root: string): Promise<WorkFolder[]> {
    await ensureFolder(root)
    return invoke<WorkFolder[]>('rell_list_subfolders', { root })
}

export function listImageFiles(folders: string[]): Promise<FolderImages[]> {
    return invoke<FolderImages[]>('rell_list_image_files', { folders })
}

/** 새 작품 폴더를 만든다. 같은 이름이 있으면 그 폴더를 그대로 쓴다. */
export async function createWorkFolder(root: string, name: string): Promise<string> {
    const safeName = sanitizeSceneFolderName(name, '').replace(/[. ]+$/, '')
    if (!safeName) throw new Error('EMPTY_NAME')
    const path = await join(root, safeName)
    await ensureFolder(path)
    return path
}

/** 씬 이미지가 저장되는 원본 폴더 위치: <저장 위치>/NAIS_Scene/<작품 이름> */
export async function resolveScenePresetFolder(presetName: string): Promise<string> {
    const { savePath, useAbsolutePath } = useSettingsStore.getState()
    const base = useAbsolutePath && savePath ? savePath : await pictureDir()
    return join(base, 'NAIS_Scene', sanitizeSceneFolderName(presetName, 'Default'))
}

interface SceneFolderSource {
    name: string
    folderPath?: string
    images: Array<{ url: string }>
}

/** 한 씬의 폴더로 볼 수 있는 후보들 (기억해 둔 폴더 → 이미지가 있던 폴더 → 이름으로 찾은 폴더). */
export async function sceneFolderCandidates(presetName: string, scene: SceneFolderSource): Promise<string[]> {
    const byName = await join(await resolveScenePresetFolder(presetName), sanitizeSceneFolderName(scene.name))
    const candidates = [scene.folderPath, getSceneFolderFromImages(scene.images), byName]
    const seen = new Set<string>()
    return candidates.filter((path): path is string => {
        if (!path) return false
        const key = pathKey(path)
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}
