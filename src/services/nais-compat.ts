/**
 * NAIS 호환: 예전 NAIS 형식 폴더(NAIS_Scene 등)를 Nightmare 형식으로 옮기고,
 * 앱이 기억하는 이미지 위치(씬, 라이브러리, 히스토리)를 새 위치로 고친 뒤 저장 형식을 바꾼다.
 * 파일 옮기기는 원래 있던 저장 위치 변경 기능(migrate_folders)을 그대로 쓴다:
 * 같은 이름의 파일이 이미 있으면 아무것도 옮기지 않고 오류로 끝난다.
 */
import { pictureDir } from '@tauri-apps/api/path'
import { exists } from '@tauri-apps/plugin-fs'
import { flushAllPendingWrites } from '@/lib/indexed-db'
import { createHistoryIndexScope, moveHistoryIndexPathPrefix } from '@/lib/history-index'
import { migrateFolders, remapLibraryItems, type FolderMigrationResult } from '@/lib/storage-migration'
import { planNaisToNightmare, remapMovedPath, type CompatMove, type CompatPlan } from '@/lib/storage-names'
import { useGenerationStore } from '@/stores/generation-store'
import { useLibraryStore } from '@/stores/library-store'
import { useSceneStore, type ScenePreset } from '@/stores/scene-store'
import { useSettingsStore } from '@/stores/settings-store'

export interface CompatPreview {
    plan: CompatPlan
    /** 실제로 있는(옮길 것이 있는) 폴더만 */
    existing: CompatMove[]
}

export async function previewNaisCompat(): Promise<CompatPreview> {
    const settings = useSettingsStore.getState()
    const plan = planNaisToNightmare(settings, await pictureDir())
    const existing: CompatMove[] = []
    for (const move of plan.moves) {
        if (await exists(move.sourcePath).catch(() => false)) existing.push(move)
    }
    return { plan, existing }
}

/** 씬이 기억하는 이미지 위치 · 씬 폴더 · 예약대형 i2i 폴더를 새 위치로 고친다. */
export function remapScenePresets(presets: ScenePreset[], moves: readonly CompatMove[]): ScenePreset[] {
    let changed = false
    const next = presets.map(preset => {
        let presetChanged = false
        const scenes = preset.scenes.map(scene => {
            let sceneChanged = false
            const images = scene.images.map(image => {
                const url = remapMovedPath(image.url, moves)
                if (url === image.url) return image
                sceneChanged = true
                return { ...image, url }
            })
            const folderPath = scene.folderPath ? remapMovedPath(scene.folderPath, moves) : scene.folderPath
            if (folderPath !== scene.folderPath) sceneChanged = true
            if (!sceneChanged) return scene
            presetChanged = true
            return { ...scene, images, folderPath }
        })
        const asset = preset.characterAsset
        const i2iFolderRoot = asset?.i2iFolderRoot ? remapMovedPath(asset.i2iFolderRoot, moves) : asset?.i2iFolderRoot
        const assetChanged = !!asset && i2iFolderRoot !== asset.i2iFolderRoot
        if (!presetChanged && !assetChanged) return preset
        changed = true
        return { ...preset, scenes, ...(assetChanged && asset ? { characterAsset: { ...asset, i2iFolderRoot } } : {}) }
    })
    return changed ? next : presets
}

export function isGenerationRunning(): boolean {
    return useGenerationStore.getState().isGenerating || useSceneStore.getState().isGenerating
}

/** 옮기고, 위치를 고치고, 저장 형식을 Nightmare로 바꾼다. */
export async function runNaisCompat(): Promise<FolderMigrationResult> {
    if (isGenerationRunning()) throw new Error('GENERATING')
    const before = useSettingsStore.getState()
    const { plan, existing } = await previewNaisCompat()

    const result = await migrateFolders(existing.map(move => ({ sourcePath: move.sourcePath, destinationPath: move.destinationPath })))

    // 파일이 옮겨졌으니 앱이 기억하는 위치를 맞춘다. 없던 폴더의 경로도 함께 고쳐야 새 저장 위치와 어긋나지 않는다.
    const sceneState = useSceneStore.getState()
    const presets = remapScenePresets(sceneState.presets, plan.moves)
    if (presets !== sceneState.presets) useSceneStore.setState({ presets })

    const libraryState = useLibraryStore.getState()
    const items = remapLibraryItems(libraryState.items, plan.moves.map(move => ({ oldPath: move.sourcePath, newPath: move.destinationPath })))
    if (items !== libraryState.items) libraryState.setItems(items)

    const historyScope = createHistoryIndexScope(before.useAbsolutePath, before.savePath)
    for (const move of plan.moves) {
        await moveHistoryIndexPathPrefix(historyScope, move.sourcePath, move.destinationPath).catch(error => {
            console.warn('[NaisCompat] history index was not updated:', error)
        })
    }

    useSettingsStore.getState().applyStorageNaming('nightmare', plan.settings)
    await flushAllPendingWrites()
    return result
}
