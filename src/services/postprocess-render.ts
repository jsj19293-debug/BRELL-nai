/**
 * 말풍선 공방(public/balloon) 연결.
 * - 화면에 띄우는 편집기(검열 탭 → 후처리)와, 씬 자동 후처리용으로 보이지 않게 띄우는 렌더러가 같은 다리(bridge)를 쓴다.
 * - 같은 출처라서 iframe 안의 window.nightmareBridge 를 바로 부른다.
 */
import { join } from '@tauri-apps/api/path'
import { mkdir, readFile, writeFile, exists, remove } from '@tauri-apps/plugin-fs'
import { useSceneStore } from '@/stores/scene-store'
import { usePostprocessStore } from '@/stores/postprocess-store'
import { bytesToDataUrl, imageMimeForPath } from '@/lib/scene-i2i-cycle'
import { POSTPROCESS_FOLDER_NAME, isPostprocessOutput, postprocessOutputName, sameAspect, splitPath } from '@/lib/postprocess'
import { pathKey } from '@/lib/scene-folder-sync'

export const BALLOON_STUDIO_URL = '/balloon/index.html'

export interface BalloonBridge {
    version: number
    ready: boolean
    openImage: (dataUrl: string, title?: string) => Promise<{ width: number; height: number }>
    templateDoc: () => unknown
    applyTemplate: (doc: unknown) => Promise<void>
    exportPNG: () => Promise<string>
    render: (doc: unknown, dataUrl: string) => Promise<string>
    size: () => { width: number; height: number; hasImage: boolean }
}

/** iframe 의 다리가 준비될 때까지 기다린다. */
export function waitForBridge(frame: HTMLIFrameElement, timeoutMs = 60_000): Promise<BalloonBridge> {
    return new Promise((resolve, reject) => {
        const started = Date.now()
        const check = () => {
            try {
                const bridge = (frame.contentWindow as (Window & { nightmareBridge?: BalloonBridge }) | null)?.nightmareBridge
                if (bridge?.ready) return resolve(bridge)
            } catch (error) {
                return reject(error)
            }
            if (Date.now() - started > timeoutMs) return reject(new Error('말풍선 공방을 불러오지 못했어요.'))
            setTimeout(check, 200)
        }
        check()
    })
}

export async function fileToDataUrl(path: string): Promise<string> {
    return bytesToDataUrl(await readFile(path), imageMimeForPath(path))
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    return bytes
}

/** 미리보기용 작은 JPEG (가로 maxWidth) */
export async function thumbnailOf(dataUrl: string, maxWidth = 220): Promise<string> {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('미리보기를 만들지 못했어요.')); image.src = dataUrl })
    const scale = Math.min(1, maxWidth / image.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
}

// ---- 보이지 않는 렌더러 (씬 자동 후처리) ----
let hiddenFrame: HTMLIFrameElement | null = null
let hiddenBridge: Promise<BalloonBridge> | null = null

function rendererBridge(): Promise<BalloonBridge> {
    if (hiddenBridge) return hiddenBridge
    hiddenFrame = document.createElement('iframe')
    hiddenFrame.src = `${BALLOON_STUDIO_URL}?mode=engine`
    hiddenFrame.title = 'postprocess-renderer'
    hiddenFrame.setAttribute('aria-hidden', 'true')
    hiddenFrame.tabIndex = -1
    // display:none 이면 글꼴 · 캔버스 준비가 늦을 수 있어 화면 밖에 둔다.
    Object.assign(hiddenFrame.style, { position: 'fixed', left: '-20000px', top: '0', width: '1280px', height: '900px', opacity: '0', pointerEvents: 'none', border: '0' })
    document.body.appendChild(hiddenFrame)
    hiddenBridge = waitForBridge(hiddenFrame).catch(error => {
        hiddenFrame?.remove()
        hiddenFrame = null
        hiddenBridge = null
        throw error
    })
    return hiddenBridge
}

let queue: Promise<unknown> = Promise.resolve()

export type PostprocessOutcome = { ok: true; path: string } | { ok: false; reason: 'no-template' | 'aspect' | 'failed'; error?: string }

/**
 * 이미지 한 장에 템플릿을 입혀 <그 이미지 폴더>/후처리/<이름>_후처리_<시각>.png 로 저장하고, 그 씬 맨 앞에 새 이미지로 넣는다. 원본은 그대로.
 * 한 번에 하나씩 차례로 처리한다.
 */
export function postprocessImageFile(templateId: string, imagePath: string): Promise<PostprocessOutcome> {
    const run = queue.then(async (): Promise<PostprocessOutcome> => {
        const template = usePostprocessStore.getState().templates.find(item => item.id === templateId)
        if (!template) return { ok: false, reason: 'no-template' }
        try {
            const dataUrl = await fileToDataUrl(imagePath)
            const size = await imageSize(dataUrl)
            if (!sameAspect(template, size)) return { ok: false, reason: 'aspect' }
            const bridge = await rendererBridge()
            const png = await bridge.render(template.doc, dataUrl)
            const { folder, name } = splitPath(imagePath)
            // 후처리본에 또 입히면 같은 후처리 폴더에 둔다 (후처리/후처리 로 겹치지 않게).
            const outFolder = isPostprocessOutput(imagePath) ? folder : await join(folder, POSTPROCESS_FOLDER_NAME)
            if (!(await exists(outFolder))) await mkdir(outFolder, { recursive: true })
            const stamp = Date.now()
            const outPath = await join(outFolder, postprocessOutputName(name, stamp))
            await writeFile(outPath, dataUrlToBytes(png))
            const previous = usePostprocessStore.getState().applied[pathKey(imagePath)]?.output
            usePostprocessStore.getState().markApplied(imagePath, templateId, outPath)
            addOutputToScenes(imagePath, outPath, stamp, previous)
            // 같은 원본에 다시 입히면 예전 후처리본은 새것으로 바뀐다 (후처리 폴더 안의 것만 지운다).
            if (previous && pathKey(previous) !== pathKey(outPath) && isPostprocessOutput(previous)) {
                await remove(previous).catch(error => console.warn('Failed to remove the old postprocess output:', previous, error))
            }
            return { ok: true, path: outPath }
        } catch (error) {
            console.warn('Postprocess failed:', imagePath, error)
            return { ok: false, reason: 'failed', error: String(error) }
        }
    })
    queue = run.catch(() => undefined)
    return run
}

/** 원본이 들어 있는 씬마다 후처리본을 새 이미지로 맨 앞(최신)에 넣는다. */
function addOutputToScenes(sourcePath: string, outPath: string, stamp: number, previousOutput?: string): void {
    const sourceKey = pathKey(sourcePath)
    const outKey = pathKey(outPath)
    const previousKey = previousOutput ? pathKey(previousOutput) : null
    useSceneStore.setState(state => ({
        presets: state.presets.map(preset => {
            if (!preset.scenes.some(scene => scene.images.some(image => pathKey(image.url) === sourceKey))) return preset
            return {
                ...preset,
                scenes: preset.scenes.map(scene => {
                    if (!scene.images.some(image => pathKey(image.url) === sourceKey)) return scene
                    if (scene.images.some(image => pathKey(image.url) === outKey)) return scene
                    const image = { id: `post-${stamp}-${Math.random().toString(36).slice(2, 8)}`, url: outPath, timestamp: stamp, isFavorite: false }
                    const rest = previousKey ? scene.images.filter(item => pathKey(item.url) !== previousKey) : scene.images
                    return { ...scene, images: [image, ...rest] }
                }),
            }
        }),
    }))
}

async function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('이미지를 읽지 못했어요.')); image.src = dataUrl })
    return { width: image.naturalWidth, height: image.naturalHeight }
}

/**
 * 씬에 지정된 템플릿. 캐릭터씬 · 예약대형으로 복제한 씬은 자기 지정이 없으면 원본 작품의 같은 씬 지정을 따른다.
 */
export function sceneTemplateFor(presetId: string, sceneId: string): string | null {
    const assigned = usePostprocessStore.getState().sceneTemplates
    const own = assigned[presetId]?.[sceneId]
    if (own) return own
    const presets = useSceneStore.getState().presets
    const preset = presets.find(item => item.id === presetId)
    const parentId = preset?.characterAsset?.parentPresetId
    const parent = parentId ? presets.find(item => item.id === parentId) : undefined
    const scene = preset?.scenes.find(item => item.id === sceneId)
    if (!preset || !parent || !scene) return null
    let sourceId = scene.sourceSceneId
    if (!sourceId) {
        const match = /-scene-(\d+)$/.exec(sceneId)
        const candidate = parent.scenes[match ? Number(match[1]) : preset.scenes.indexOf(scene)]
        sourceId = candidate && candidate.name === scene.name ? candidate.id : parent.scenes.find(item => item.name === scene.name)?.id
    }
    return sourceId ? assigned[parent.id]?.[sourceId] ?? null : null
}

/** 씬에 후처리 템플릿이 지정돼 있으면 방금 뽑은 이미지에 입힌다 (생성은 기다리지 않는다). */
export function postprocessAfterSceneGeneration(presetId: string, sceneId: string, imagePath: string): void {
    const templateId = sceneTemplateFor(presetId, sceneId)
    if (!templateId || imagePath.startsWith('data:')) return
    void postprocessImageFile(templateId, imagePath).then(result => {
        if (!result.ok && result.reason === 'aspect') console.warn('Postprocess skipped: the template and the image have different aspect ratios', imagePath)
    })
}

/** 씬에 이미 있는 이미지들에도 입힌다. 성공 수를 돌려준다. */
export async function postprocessExistingSceneImages(presetId: string, sceneId: string, templateId: string): Promise<{ done: number; skipped: number }> {
    const scene = useSceneStore.getState().presets.find(preset => preset.id === presetId)?.scenes.find(item => item.id === sceneId)
    let done = 0
    let skipped = 0
    for (const image of scene?.images ?? []) {
        if (image.url.startsWith('data:') || isPostprocessOutput(image.url)) continue
        const result = await postprocessImageFile(templateId, image.url)
        if (result.ok) done++
        else skipped++
    }
    return { done, skipped }
}

/** 고른 이미지들에만 입힌다 (씬 "일부 적용"). */
export async function postprocessImages(templateId: string, imagePaths: readonly string[]): Promise<{ done: number; skipped: number }> {
    let done = 0
    let skipped = 0
    for (const path of imagePaths) {
        if (path.startsWith('data:')) continue
        const result = await postprocessImageFile(templateId, path)
        if (result.ok) done++
        else skipped++
    }
    return { done, skipped }
}
