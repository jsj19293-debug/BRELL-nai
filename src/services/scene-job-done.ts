/**
 * 씬 모드 "작업완료하기".
 * 1) 씬마다 가장 최근 1장을 <보관 폴더>/<작품명 날짜 시각>/원본 에 그대로 복사하고,
 *    같은 이름으로 /WebP 에 EXIF 를 지운 고화질 WebP 를 만든다.
 * 2) 두 파일이 다 만들어진 씬만, 그 1장을 남기고 나머지 이미지를 즐겨찾기여도 지운다 (파일까지).
 */
import { invoke } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { readFile, remove, writeFile } from '@tauri-apps/plugin-fs'
import { useSceneStore } from '@/stores/scene-store'
import { useSettingsStore } from '@/stores/settings-store'
import { ensureFolder, listWorkFolders } from '@/lib/rell-folders'
import { jobFolderName, planJob, uniqueName, type JobPlan } from '@/lib/scene-job-done'

export function planSceneJob(presetId: string): JobPlan | null {
    const preset = useSceneStore.getState().presets.find(candidate => candidate.id === presetId)
    if (!preset) return null
    const { prefix, start, pad } = useSettingsStore.getState().sceneWebpExport
    return planJob(preset.scenes, { prefix, start, pad })
}

export type JobDoneResult =
    | { ok: true; jobFolder: string; exported: number; failed: string[]; deleted: number; bytesBefore: number; bytesAfter: number }
    | { ok: false; reason: 'busy' | 'no-preset' | 'no-archive' | 'nothing' | 'failed'; error?: string }

interface FolderExportResult {
    exportedCount: number
    skippedCount: number
    skipped: string[]
    bytesBefore: number
    bytesAfter: number
}

export async function finishSceneJob(presetId: string, archiveFolder: string): Promise<JobDoneResult> {
    const scenes = useSceneStore.getState()
    if (scenes.isGenerating || scenes.getTotalQueueCount(presetId) > 0) return { ok: false, reason: 'busy' }
    const preset = scenes.presets.find(candidate => candidate.id === presetId)
    if (!preset) return { ok: false, reason: 'no-preset' }
    if (!archiveFolder.trim()) return { ok: false, reason: 'no-archive' }
    const plan = planSceneJob(presetId)
    if (!plan || plan.exports.length === 0) return { ok: false, reason: 'nothing' }

    try {
        await ensureFolder(archiveFolder)
        const taken = new Set((await listWorkFolders(archiveFolder).catch(() => [])).map(folder => folder.name))
        const jobFolder = await join(archiveFolder, uniqueName(jobFolderName(preset.name, new Date()), taken))
        const originalFolder = await join(jobFolder, '원본')
        const webpFolder = await join(jobFolder, 'WebP')
        await ensureFolder(originalFolder)
        await ensureFolder(webpFolder)

        // 1-a) 원본 그대로 복사
        const failed = new Set<string>()
        for (const item of plan.exports) {
            try {
                const bytes = await readFile(item.source)
                await writeFile(await join(originalFolder, `${item.baseName}${item.originalExtension}`), bytes)
            } catch (error) {
                console.warn('Failed to copy the original image:', item.source, error)
                failed.add(item.sceneId)
            }
        }

        // 1-b) EXIF 제거 + 고화질 압축 WebP (WebP 버튼의 품질 설정을 따른다)
        const quality = useSettingsStore.getState().sceneWebpExport.quality
        const webp = await invoke<FolderExportResult>('export_scene_images_folder', {
            outputDir: webpFolder,
            entries: plan.exports.map(item => ({ source: item.source, fileName: `${item.baseName}.webp` })),
            lossless: false,
            quality,
            exportId: `job-done-${Date.now()}`,
        })
        const skippedNames = new Set(webp.skipped)
        for (const item of plan.exports) if (skippedNames.has(`${item.baseName}.webp`)) failed.add(item.sceneId)

        // 2) 두 파일이 다 만들어진 씬만 최신 1장을 남기고 정리한다.
        const deletedPaths: string[] = []
        const keepById = new Map<string, string>()
        for (const trim of plan.trims) {
            if (failed.has(trim.sceneId)) continue
            keepById.set(trim.sceneId, trim.keep.id)
            for (const image of trim.remove) {
                if (image.url.startsWith('data:')) continue
                try {
                    await remove(image.url)
                } catch (error) {
                    // 이미 없는 파일이면 목록에서만 뺀다.
                    console.warn('Failed to delete the old scene image:', image.url, error)
                }
                deletedPaths.push(image.url)
            }
        }
        if (keepById.size > 0) {
            useSceneStore.setState(state => ({
                presets: state.presets.map(candidate => candidate.id !== presetId ? candidate : {
                    ...candidate,
                    scenes: candidate.scenes.map(scene => {
                        const keepId = keepById.get(scene.id)
                        return keepId ? { ...scene, images: scene.images.filter(image => image.id === keepId) } : scene
                    }),
                }),
            }))
        }
        if (deletedPaths.length > 0) window.dispatchEvent(new CustomEvent('imageDeleted', { detail: { paths: deletedPaths } }))

        const failedNames = plan.exports.filter(item => failed.has(item.sceneId)).map(item => `${item.sceneNumber} ${item.sceneName}`)
        const deleted = plan.trims.filter(trim => keepById.has(trim.sceneId)).reduce((sum, trim) => sum + trim.remove.length, 0)
        return {
            ok: true,
            jobFolder,
            exported: plan.exports.length - failed.size,
            failed: failedNames,
            deleted,
            bytesBefore: webp.bytesBefore,
            bytesAfter: webp.bytesAfter,
        }
    } catch (error) {
        return { ok: false, reason: 'failed', error: String(error) }
    }
}

/**
 * "씬 비우기": 지금 작품의 모든 씬 이미지를 즐겨찾기까지 지운다 (파일도). 씬 · 프롬프트는 그대로.
 * 다른 작품은 건드리지 않는다.
 */
export async function clearPresetSceneImages(presetId: string): Promise<{ ok: true; deleted: number } | { ok: false; reason: 'busy' | 'no-preset' }> {
    const scenes = useSceneStore.getState()
    if (scenes.isGenerating || scenes.getTotalQueueCount(presetId) > 0) return { ok: false, reason: 'busy' }
    const preset = scenes.presets.find(candidate => candidate.id === presetId)
    if (!preset) return { ok: false, reason: 'no-preset' }
    const images = preset.scenes.flatMap(scene => scene.images)
    const deletedPaths: string[] = []
    for (const image of images) {
        if (image.url.startsWith('data:')) continue
        try {
            await remove(image.url)
        } catch (error) {
            console.warn('Failed to delete the scene image:', image.url, error)
        }
        deletedPaths.push(image.url)
    }
    useSceneStore.setState(state => ({
        presets: state.presets.map(candidate => candidate.id !== presetId ? candidate : {
            ...candidate,
            scenes: candidate.scenes.map(scene => (scene.images.length > 0 ? { ...scene, images: [] } : scene)),
        }),
    }))
    if (deletedPaths.length > 0) window.dispatchEvent(new CustomEvent('imageDeleted', { detail: { paths: deletedPaths } }))
    return { ok: true, deleted: images.length }
}
