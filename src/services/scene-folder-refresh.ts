/**
 * 씬 폴더 새로고침: 작품의 모든 씬에 대해 씬 폴더를 다시 읽고, 실제로 있는 파일에 맞춰
 * 이미지 목록을 고친다. 파일을 지웠다가 다시 넣어 "없음"으로 뜨는 씬을 되살린다.
 */
import { useSceneStore, type SceneImage } from '@/stores/scene-store'
import { ensureFolder, listImageFiles, sceneFolderCandidates } from '@/lib/rell-folders'
import { syncSceneImages } from '@/lib/scene-folder-sync'

export interface SceneFolderRefreshResult {
    scenes: number
    added: number
    removed: number
    /** 폴더를 찾지 못한 씬 이름 */
    missingFolders: string[]
    /** 폴더가 없어서 이번에 새로 만든 씬 폴더 수 */
    createdFolders: number
}

export async function refreshPresetFromFolders(presetId: string): Promise<SceneFolderRefreshResult> {
    const preset = useSceneStore.getState().presets.find(candidate => candidate.id === presetId)
    const result: SceneFolderRefreshResult = { scenes: 0, added: 0, removed: 0, missingFolders: [], createdFolders: 0 }
    if (!preset) return result

    const candidates = await Promise.all(preset.scenes.map(scene => sceneFolderCandidates(preset.name, scene)))
    const listed = await listImageFiles([...new Set(candidates.flat())])
    const byFolder = new Map(listed.map(entry => [entry.folder, entry]))

    // 읽는 동안 목록이 바뀌었을 수 있으니 (생성 중 등) 지금 상태를 다시 읽어 맞춘다.
    const current = useSceneStore.getState().presets.find(candidate => candidate.id === presetId)
    if (!current) return result
    const updates: Record<string, { images: SceneImage[]; folderPath: string }> = {}
    /** 폴더가 없는 씬의 폴더를 만들 위치 (작품 폴더 / 씬 이름) */
    const foldersToCreate = new Set<string>()
    const stamp = Date.now()

    preset.scenes.forEach((scene, sceneIndex) => {
        const latest = current.scenes.find(candidate => candidate.id === scene.id)
        if (!latest) return
        result.scenes++
        // 이미지가 있는 폴더를 먼저, 없으면 있는 폴더 아무거나.
        const existing = candidates[sceneIndex].map(folder => byFolder.get(folder)).filter(entry => entry?.exists)
        const folder = existing.find(entry => entry!.files.length > 0) || existing[0]
        if (!folder) {
            // 폴더가 없는 씬: 이름에 맞는 빈 폴더를 만들어 둔다. 거기에 이미지를 넣고 다시 새로고침하면 씬에 들어온다.
            if (latest.images.length > 0) result.missingFolders.push(scene.name)
            const byName = candidates[sceneIndex][candidates[sceneIndex].length - 1]
            if (byName) foldersToCreate.add(byName)
            return
        }
        const synced = syncSceneImages(latest.images, folder.folder, folder.files, (file, timestamp, index) => ({
            id: `sync-${stamp}-${sceneIndex}-${index}`,
            url: file.path,
            timestamp,
            isFavorite: false,
        }))
        if (synced.added === 0 && synced.removed === 0) return
        result.added += synced.added
        result.removed += synced.removed
        updates[scene.id] = { images: synced.images, folderPath: folder.folder }
    })

    for (const folder of foldersToCreate) {
        try {
            await ensureFolder(folder)
            result.createdFolders++
        } catch (error) {
            console.warn('Failed to create the scene folder:', folder, error)
        }
    }

    useSceneStore.getState().applySceneFolderSync(presetId, updates)
    return result
}
