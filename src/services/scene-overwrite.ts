/**
 * 씬 덮어씌우기: 고른 폴더의 하위 폴더 이미지를 이름이 맞는 씬에 넣는다.
 * 이미지는 이 작품의 씬 폴더로 복사해서 넣는다 (다른 폴더를 같이 쓰지 않게). 원본은 그대로.
 */
import { join } from '@tauri-apps/api/path'
import { exists, readFile, writeFile } from '@tauri-apps/plugin-fs'
import { useSceneStore, type SceneImage } from '@/stores/scene-store'
import { sanitizeSceneFolderName } from '@/lib/scene-path'
import { pathKey } from '@/lib/scene-folder-sync'
import { ensureFolder, listImageFiles, listWorkFolders, resolveScenePresetFolder } from '@/lib/rell-folders'
import { CENSOR_FOLDER_NAME } from '@/lib/censor-review'
import { imagesFromFolder, matchSceneFolders, type OverwriteMatch } from '@/lib/scene-overwrite'

export async function defaultOverwriteSource(presetId: string): Promise<string> {
    const preset = useSceneStore.getState().presets.find(candidate => candidate.id === presetId)
    return preset ? resolveScenePresetFolder(preset.name) : ''
}

/** 고른 폴더 안의 하위 폴더(이미지가 있는 것만)를 지금 작품의 씬과 짝짓는다. */
export async function scanOverwriteSource(presetId: string, sourceFolder: string): Promise<OverwriteMatch[]> {
    const preset = useSceneStore.getState().presets.find(candidate => candidate.id === presetId)
    if (!preset || !sourceFolder) return []
    const folders = (await listWorkFolders(sourceFolder))
        .filter(folder => folder.imageCount > 0 && folder.name !== CENSOR_FOLDER_NAME)
    return matchSceneFolders(preset.scenes, folders)
}

/**
 * 체크한 씬마다 그 폴더의 이미지를 이 작품의 씬 폴더로 복사하고, 씬 목록을 씬 폴더와 맞춘다.
 * 원본 폴더는 건드리지 않는다. 같은 이름의 파일이 이미 씬 폴더에 있으면 그 파일은 건너뛴다.
 */
export async function applySceneOverwrite(presetId: string, matches: readonly OverwriteMatch[]): Promise<{ scenes: number; images: number; copied: number }> {
    const picked = matches.filter(match => match.folder)
    const preset = useSceneStore.getState().presets.find(candidate => candidate.id === presetId)
    if (picked.length === 0 || !preset) return { scenes: 0, images: 0, copied: 0 }
    const presetFolder = await resolveScenePresetFolder(preset.name)
    const sources = await listImageFiles(picked.map(match => match.folder!.path))
    const stamp = Date.now()
    const updates: Record<string, { images: SceneImage[]; folderPath: string }> = {}
    let images = 0
    let copied = 0
    for (const [index, match] of picked.entries()) {
        const scene = preset.scenes.find(candidate => candidate.id === match.sceneId)
        const source = sources[index]
        if (!scene || !source?.exists || source.files.length === 0) continue
        const ownFolder = await join(presetFolder, sanitizeSceneFolderName(scene.name))
        await ensureFolder(ownFolder)
        for (const file of source.files) {
            const target = await join(ownFolder, file.name)
            if (pathKey(target) === pathKey(file.path) || await exists(target)) continue
            await writeFile(target, await readFile(file.path))
            copied++
        }
        const [own] = await listImageFiles([ownFolder])
        const next = imagesFromFolder(own?.files ?? [], scene.images, fileIndex => `ow-${stamp}-${index}-${fileIndex}`)
        updates[scene.id] = { images: next, folderPath: ownFolder }
        images += next.length
    }
    useSceneStore.getState().applySceneFolderSync(presetId, updates)
    return { scenes: Object.keys(updates).length, images, copied }
}
