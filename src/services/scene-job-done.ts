/**
 * 씬 모드 "작업완료하기".
 * 1) 작품 폴더(씬 폴더들이 든 폴더)의 모든 파일 · 폴더를 <보관 폴더>/<작품명 날짜시각> 으로 옮긴다.
 *    옮기기는 저장 위치 변경 기능과 같은 방식: 전부 복사 → 크기 확인 → 그다음에 원본을 지운다. 하나라도 실패하면 원본은 그대로.
 * 2) 씬마다 빈 씬 폴더를 다시 만들고, 씬의 이미지 목록만 비운다 (씬 · 프롬프트는 그대로).
 */
import { join } from '@tauri-apps/api/path'
import { exists } from '@tauri-apps/plugin-fs'
import { useSceneStore, type SceneImage } from '@/stores/scene-store'
import { ensureFolder, listImageFiles, listWorkFolders, resolveScenePresetFolder } from '@/lib/rell-folders'
import { sanitizeSceneFolderName } from '@/lib/scene-path'
import { migrateFolders } from '@/lib/storage-migration'
import { jobFolderName, planJobDone, uniqueName } from '@/lib/scene-job-done'

export interface JobDoneSummary {
    presetFolder: string
    folders: number
    images: number
}

/** 확인 창에 보여 줄 개수: 작품 폴더 안의 하위 폴더 수와 이미지 수 */
export async function summarizeJob(presetId: string): Promise<JobDoneSummary | null> {
    const preset = useSceneStore.getState().presets.find(candidate => candidate.id === presetId)
    if (!preset) return null
    const presetFolder = await resolveScenePresetFolder(preset.name)
    if (!(await exists(presetFolder).catch(() => false))) return { presetFolder, folders: 0, images: 0 }
    const [children, [root]] = await Promise.all([
        listWorkFolders(presetFolder).catch(() => []),
        listImageFiles([presetFolder]),
    ])
    return {
        presetFolder,
        folders: children.length,
        images: children.reduce((sum, child) => sum + child.imageCount, 0) + (root?.files.length ?? 0),
    }
}

export type JobDoneResult =
    | { ok: true; jobFolder: string; filesMoved: number; cleanupFailures: number }
    | { ok: false; reason: 'busy' | 'no-preset' | 'no-archive' | 'nothing' | 'destination-inside-work' | 'work-inside-destination' | 'failed'; error?: string }

export async function finishSceneJob(presetId: string, archiveFolder: string): Promise<JobDoneResult> {
    const scenes = useSceneStore.getState()
    if (scenes.isGenerating || scenes.getTotalQueueCount(presetId) > 0) return { ok: false, reason: 'busy' }
    const preset = scenes.presets.find(candidate => candidate.id === presetId)
    if (!preset) return { ok: false, reason: 'no-preset' }
    if (!archiveFolder.trim()) return { ok: false, reason: 'no-archive' }

    const presetFolder = await resolveScenePresetFolder(preset.name)
    // 작품 폴더만 옮긴다. 씬이 다른 곳(출력 폴더 · 다른 작품 등)을 가리켜도 그 폴더는 건드리지 않는다.
    if (!(await exists(presetFolder).catch(() => false))) return { ok: false, reason: 'nothing' }

    await ensureFolder(archiveFolder)
    const taken = new Set((await listWorkFolders(archiveFolder).catch(() => [])).map(folder => folder.name))
    const jobFolder = await join(archiveFolder, uniqueName(jobFolderName(preset.name, new Date()), taken))
    const plan = planJobDone(presetFolder, jobFolder)
    if (!plan.ok) return { ok: false, reason: plan.reason }
    const moves = plan.moves

    let filesMoved = 0
    let cleanupFailures = 0
    try {
        const result = await migrateFolders(moves)
        filesMoved = result.filesMoved
        cleanupFailures = result.cleanupFailures
    } catch (error) {
        return { ok: false, reason: 'failed', error: String(error) }
    }

    // 다음 작업을 위해 빈 씬 폴더를 다시 만들고, 씬의 이미지 목록을 비운다.
    const updates: Record<string, { images: SceneImage[]; folderPath: string }> = {}
    for (const scene of preset.scenes) {
        const folder = await join(presetFolder, sanitizeSceneFolderName(scene.name))
        await ensureFolder(folder).catch(error => console.warn('Failed to recreate the scene folder:', folder, error))
        updates[scene.id] = { images: [], folderPath: folder }
    }
    useSceneStore.getState().applySceneFolderSync(presetId, updates)
    return { ok: true, jobFolder, filesMoved, cleanupFailures }
}
