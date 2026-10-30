/**
 * 씬 덮어씌우기: 고른 폴더의 하위 폴더 이미지를 이름이 맞는 씬에 넣는다.
 * 파일은 그대로 두고, 씬이 그 폴더를 바로 쓰도록 연결한다 (복사 · 이동 · 삭제 없음).
 */
import { useSceneStore, type SceneImage } from '@/stores/scene-store'
import { listImageFiles, listWorkFolders, resolveScenePresetFolder } from '@/lib/rell-folders'
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

export async function applySceneOverwrite(presetId: string, matches: readonly OverwriteMatch[]): Promise<{ scenes: number; images: number }> {
    const picked = matches.filter(match => match.folder)
    if (picked.length === 0) return { scenes: 0, images: 0 }
    const listed = await listImageFiles(picked.map(match => match.folder!.path))
    const preset = useSceneStore.getState().presets.find(candidate => candidate.id === presetId)
    if (!preset) return { scenes: 0, images: 0 }
    const stamp = Date.now()
    const updates: Record<string, { images: SceneImage[]; folderPath: string }> = {}
    let images = 0
    picked.forEach((match, index) => {
        const scene = preset.scenes.find(candidate => candidate.id === match.sceneId)
        const entry = listed[index]
        if (!scene || !entry?.exists || entry.files.length === 0) return
        const next = imagesFromFolder(entry.files, scene.images, fileIndex => `ow-${stamp}-${index}-${fileIndex}`)
        updates[scene.id] = { images: next, folderPath: entry.folder }
        images += next.length
    })
    useSceneStore.getState().applySceneFolderSync(presetId, updates)
    return { scenes: Object.keys(updates).length, images }
}
