/**
 * 씬 폴더 새로고침: 작품의 모든 씬에 대해 씬 폴더를 다시 읽고, 실제로 있는 파일에 맞춰
 * 이미지 목록을 고친다. 파일을 지웠다가 다시 넣어 "없음"으로 뜨는 씬을 되살린다.
 */
import { useSceneStore, type SceneImage } from '@/stores/scene-store'
import { listImageFiles, sceneFolderCandidates } from '@/lib/rell-folders'
import { syncSceneImages } from '@/lib/scene-folder-sync'

export interface SceneFolderRefreshResult {
    scenes: number
    added: number
    removed: number
    /** 폴더를 찾지 못한 씬 이름 */
    missingFolders: string[]
}

export async function refreshPresetFromFolders(presetId: string): Promise<SceneFolderRefreshResult> {
    const preset = useSceneStore.getState().presets.find(candidate => candidate.id === presetId)
    const result: SceneFolderRefreshResult = { scenes: 0, added: 0, removed: 0, missingFolders: [] }
    if (!preset) return result

    const candidates = await Promise.all(preset.scenes.map(scene => sceneFolderCandidates(preset.name, scene)))
    const listed = await listImageFiles([...new Set(candidates.flat())])
    const byFolder = new Map(listed.map(entry => [entry.folder, entry]))

    // 읽는 동안 목록이 바뀌었을 수 있으니 (생성 중 등) 지금 상태를 다시 읽어 맞춘다.
    const current = useSceneStore.getState().presets.find(candidate => candidate.id === presetId)
    if (!current) return result
    const updates: Record<string, { images: SceneImage[]; folderPath: string }> = {}
    const stamp = Date.now()

    preset.scenes.forEach((scene, sceneIndex) => {
        const latest = current.scenes.find(candidate => candidate.id === scene.id)
        if (!latest) return
        result.scenes++
        // 이미지가 있는 폴더를 먼저, 없으면 있는 폴더 아무거나.
        const existing = candidates[sceneIndex].map(folder => byFolder.get(folder)).filter(entry => entry?.exists)
        const folder = existing.find(entry => entry!.files.length > 0) || existing[0]
        if (!folder) {
            // 아직 한 장도 뽑지 않은 씬은 폴더가 없는 것이 정상이다.
            if (latest.images.length > 0) result.missingFolders.push(scene.name)
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

    useSceneStore.getState().applySceneFolderSync(presetId, updates)
    return result
}
