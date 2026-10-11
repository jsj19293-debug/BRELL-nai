import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { convertFileSrc } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { open as openDialog, save } from '@tauri-apps/plugin-dialog'
import { exists, mkdir, readDir, readFile, writeFile } from '@tauri-apps/plugin-fs'
import { ArrowDown, ArrowUp, Eraser, Film, FolderOpen, FolderSearch, GripVertical, ImagePlus, Loader2, Play, RotateCcw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { bytesToImageDataUrl, stripImageMetadata, type ExifOutputFormat } from '@/lib/exif-stripper'
import { openFolder } from '@/lib/rell-folders'
import { buildAnimatedWebp, fitRect, sizeForRatio, slideshowSize } from '@/lib/webp-anim'
import {
    STRIP_FOLDER_NAME, clampSeconds, commonParent, fileNameOf, isImageName, moveItem, relativeDir, stripOutputName,
} from '@/lib/file-tools'

type ToolTab = 'strip' | 'slideshow'
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

const chip = (active: boolean) => cn(
    'h-8 rounded-lg border px-3 text-xs transition-colors',
    active ? 'border-primary bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted/50',
)

async function pickImages(): Promise<string[]> {
    const selected = await openDialog({ multiple: true, filters: [{ name: 'Image', extensions: IMAGE_EXTENSIONS }] })
    if (!selected) return []
    return (Array.isArray(selected) ? selected : [selected]).filter((path): path is string => typeof path === 'string')
}

/** 폴더 안의 이미지를 하위 폴더까지 모두 찾는다. skip 폴더(결과 폴더)는 들어가지 않는다. */
async function collectImages(folder: string, skip: string, found: string[] = [], depth = 0): Promise<string[]> {
    if (depth > 8) return found
    for (const entry of await readDir(folder)) {
        const path = await join(folder, entry.name)
        if (entry.isDirectory) {
            if (entry.name === skip) continue
            await collectImages(path, skip, found, depth + 1)
        } else if (isImageName(entry.name)) {
            found.push(path)
        }
    }
    return found
}

/** 아랫줄 1픽셀을 잘라 낸 PNG (data URL). 손실 없이 자르고, 형식 변환은 그다음에 한 번만 한다. */
async function cropBottomRow(dataUrl: string): Promise<string> {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('이미지를 읽지 못했습니다'))
        image.src = dataUrl
    })
    if (image.naturalHeight < 2) return dataUrl
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight - 1
    try {
        canvas.getContext('2d')?.drawImage(image, 0, 0)
        return canvas.toDataURL('image/png')
    } finally {
        canvas.width = canvas.height = 0
    }
}

// ───────────────────────── 메타데이터 제거 ─────────────────────────

function StripTab() {
    const { t } = useTranslation()
    const [paths, setPaths] = useState<string[]>([])
    /** 폴더로 골랐으면 그 폴더 (하위 폴더 구조를 그대로 옮기는 기준) */
    const [root, setRoot] = useState('')
    const [outDir, setOutDir] = useState('')
    const [format, setFormat] = useState<ExifOutputFormat>('png')
    const [quality, setQuality] = useState(92)
    const [crop, setCrop] = useState(true)
    const [running, setRunning] = useState(false)
    const [done, setDone] = useState(0)
    const [failed, setFailed] = useState<string[]>([])
    const [finishedDir, setFinishedDir] = useState('')
    const cancelRef = useRef(false)

    const base = root || commonParent(paths)

    const setSources = async (next: string[], nextRoot: string) => {
        setPaths(next)
        setRoot(nextRoot)
        setDone(0)
        setFailed([])
        setFinishedDir('')
        const parent = nextRoot || commonParent(next)
        setOutDir(parent ? await join(parent, STRIP_FOLDER_NAME) : '')
    }

    const handlePickImages = async () => {
        try {
            const picked = await pickImages()
            if (picked.length > 0) await setSources(picked, '')
        } catch (error) {
            toast({ title: t('fileTools.pickFailed', '파일을 고르지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }
    const handlePickFolder = async () => {
        try {
            const folder = await openDialog({ directory: true, multiple: false })
            if (!folder || typeof folder !== 'string') return
            const found = await collectImages(folder, STRIP_FOLDER_NAME)
            if (found.length === 0) {
                toast({ title: t('fileTools.noImages', '그 폴더에 이미지가 없습니다') })
                return
            }
            await setSources(found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), folder)
        } catch (error) {
            toast({ title: t('fileTools.pickFailed', '파일을 고르지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }
    const handlePickOutput = async () => {
        const folder = await openDialog({ directory: true, multiple: false, defaultPath: outDir || undefined }).catch(() => null)
        if (folder && typeof folder === 'string') setOutDir(folder)
    }

    const handleRun = async () => {
        if (paths.length === 0 || !outDir || running) return
        setRunning(true)
        setDone(0)
        setFailed([])
        setFinishedDir('')
        cancelRef.current = false
        const errors: string[] = []
        const made = new Set<string>()
        try {
            for (let index = 0; index < paths.length; index++) {
                if (cancelRef.current) break
                const path = paths[index]
                const name = fileNameOf(path)
                try {
                    let source = await bytesToImageDataUrl(await readFile(path), name)
                    if (crop) source = await cropBottomRow(source)
                    // 자른 뒤에는 반드시 다시 인코딩한다 (원본 바이트를 그대로 쓰면 잘리지 않는다).
                    const result = await stripImageMetadata(source, format, format === 'png' ? 1 : quality / 100, crop)
                    const sub = relativeDir(path, base)
                    const folder = sub ? await join(outDir, ...sub.split('/')) : outDir
                    if (!made.has(folder)) {
                        if (!(await exists(folder))) await mkdir(folder, { recursive: true })
                        made.add(folder)
                    }
                    await writeFile(await join(folder, stripOutputName(name, result.extension)), new Uint8Array(await result.blob.arrayBuffer()))
                } catch (error) {
                    console.error('Failed to strip metadata:', path, error)
                    errors.push(name)
                }
                setDone(index + 1)
            }
            setFailed(errors)
            setFinishedDir(outDir)
            toast({
                title: cancelRef.current
                    ? t('fileTools.strip.stopped', '중지했습니다')
                    : t('fileTools.strip.done', '메타데이터를 지운 이미지 {{n}}장을 저장했어요', { n: paths.length - errors.length }),
                description: errors.length > 0 ? t('fileTools.strip.failedSome', '실패 {{n}}장: {{names}}', { n: errors.length, names: errors.slice(0, 3).join(', ') }) : outDir,
                variant: errors.length > 0 ? 'destructive' : 'success',
            })
        } finally {
            setRunning(false)
        }
    }

    return (
        <div className="flex min-h-0 flex-1 gap-4 p-4">
            <div className="flex w-[24rem] shrink-0 flex-col gap-4 overflow-y-auto">
                <p className="text-xs text-muted-foreground">
                    {t('fileTools.strip.desc', '이미지에 들어 있는 생성 정보(프롬프트 · 시드 등 메타데이터, 숨은 정보 포함)를 지워 새 파일로 저장합니다. 원본은 그대로 둡니다.')}
                </p>
                <div className="flex gap-2">
                    <Button variant="outline" className="h-9 flex-1" onClick={() => void handlePickImages()} disabled={running} data-strip-pick>
                        <ImagePlus className="mr-1.5 h-4 w-4" />
                        {t('fileTools.pickImages', '이미지 고르기')}
                    </Button>
                    <Button variant="outline" className="h-9 flex-1" onClick={() => void handlePickFolder()} disabled={running}>
                        <FolderSearch className="mr-1.5 h-4 w-4" />
                        {t('fileTools.pickFolder', '폴더 고르기')}
                    </Button>
                </div>
                <div className="grid gap-1.5">
                    <span className="text-xs font-medium">{t('fileTools.strip.format', '저장 형식')}</span>
                    <div className="flex gap-1.5">
                        <button type="button" className={chip(format === 'png')} onClick={() => setFormat('png')} disabled={running}>PNG · {t('fileTools.strip.lossless', '무손실')}</button>
                        <button type="button" className={chip(format === 'jpeg')} onClick={() => setFormat('jpeg')} disabled={running}>JPEG · {t('fileTools.strip.small', '작은 용량')}</button>
                        <button type="button" className={chip(format === 'webp')} onClick={() => setFormat('webp')} disabled={running}>WebP · {t('fileTools.strip.compact', '고압축')}</button>
                    </div>
                </div>
                {format !== 'png' && (
                    <label className="flex items-center gap-2 text-xs">
                        <span className="w-16 shrink-0 font-medium">{t('fileTools.quality', '품질')}</span>
                        <input type="range" min={50} max={100} value={quality} disabled={running} onChange={event => setQuality(Number(event.target.value))} className="flex-1" />
                        <span className="w-8 tabular-nums text-muted-foreground">{quality}</span>
                    </label>
                )}
                <label className="flex cursor-pointer items-start gap-2 text-xs">
                    <input type="checkbox" checked={crop} disabled={running} onChange={event => setCrop(event.target.checked)} className="mt-0.5" data-strip-crop />
                    <span>
                        <span className="font-medium">{t('fileTools.strip.crop', '아랫줄 1픽셀 자르기')}</span>
                        <span className="block text-muted-foreground">{t('fileTools.strip.cropHelp', '이미지 높이가 1픽셀 줄어듭니다. 끄면 크기는 그대로 두고 메타데이터만 지웁니다.')}</span>
                    </span>
                </label>
                <div className="grid gap-1.5">
                    <span className="text-xs font-medium">{t('fileTools.outputFolder', '저장 폴더')}</span>
                    <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 text-xs text-muted-foreground" title={outDir}>{outDir || t('fileTools.outputEmpty', '이미지를 고르면 정해집니다')}</span>
                        <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => void handlePickOutput()} disabled={running || paths.length === 0}>{t('fileTools.change', '변경')}</Button>
                    </div>
                    {root && <span className="text-[11px] text-muted-foreground">{t('fileTools.strip.keepTree', '하위 폴더 구조를 그대로 옮깁니다.')}</span>}
                </div>
                <div className="mt-auto flex gap-2">
                    {running ? (
                        <Button variant="destructive" className="h-10 flex-1" onClick={() => { cancelRef.current = true }}>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t('fileTools.strip.stop', '중지 ({{done}} / {{total}})', { done, total: paths.length })}
                        </Button>
                    ) : (
                        <Button className="h-10 flex-1" onClick={() => void handleRun()} disabled={paths.length === 0 || !outDir} data-strip-run>
                            <Eraser className="mr-2 h-4 w-4" />
                            {t('fileTools.strip.run', '메타데이터 지우고 저장 ({{n}}장)', { n: paths.length })}
                        </Button>
                    )}
                    <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => void setSources([], '')} disabled={running || paths.length === 0} title={t('fileTools.reset', '초기화')}>
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                </div>
                {finishedDir && !running && (
                    <Button variant="outline" className="h-9" onClick={() => void openFolder(finishedDir).catch(() => undefined)}>
                        <FolderOpen className="mr-1.5 h-4 w-4" />
                        {t('fileTools.openOutput', '저장 폴더 열기')}
                    </Button>
                )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/50 bg-background/40 p-3">
                {paths.length === 0 ? (
                    <p className="py-20 text-center text-sm text-muted-foreground">{t('fileTools.strip.empty', '왼쪽에서 이미지나 폴더를 고르세요. 여러 장을 한 번에 고를 수 있습니다.')}</p>
                ) : (
                    <>
                        <p className="mb-2 text-xs text-muted-foreground" data-strip-count>
                            {t('fileTools.strip.count', '이미지 {{n}}장', { n: paths.length })}
                            {done > 0 && ` · ${t('fileTools.strip.progress', '{{done}}장 처리', { done })}`}
                            {failed.length > 0 && ` · ${t('fileTools.strip.failedCount', '실패 {{n}}장', { n: failed.length })}`}
                        </p>
                        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(7rem, 1fr))' }}>
                            {paths.slice(0, 120).map((path, index) => (
                                <div key={path} className={cn('overflow-hidden rounded-lg border bg-muted/30', index < done ? (failed.includes(fileNameOf(path)) ? 'border-red-500' : 'border-emerald-500') : 'border-border/50')} title={path}>
                                    <img src={convertFileSrc(path)} alt="" loading="lazy" decoding="async" className="aspect-[2/3] w-full object-cover" />
                                    <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">{relativeDir(path, base) ? `${relativeDir(path, base)}/` : ''}{fileNameOf(path)}</p>
                                </div>
                            ))}
                        </div>
                        {paths.length > 120 && <p className="mt-2 text-center text-xs text-muted-foreground">{t('fileTools.strip.more', '… 외 {{n}}장', { n: paths.length - 120 })}</p>}
                    </>
                )}
            </div>
        </div>
    )
}

// ───────────────────────── 슬라이드쇼 WebP ─────────────────────────

interface Slide {
    id: string
    path: string
    /** 이 사진만의 표시 시간(초). 비어 있으면 기본 표시 시간 */
    seconds: string
}

const RATIOS: Array<{ label: string; w: number; h: number }> = [
    { label: '바베 1:1', w: 1, h: 1 },
    { label: '에덴 2:3', w: 2, h: 3 },
    { label: '젠잇 3:4', w: 3, h: 4 },
]

async function loadBitmap(path: string): Promise<ImageBitmap> {
    const bytes = await readFile(path)
    return createImageBitmap(new Blob([bytes as unknown as BlobPart]))
}

function SlideshowTab() {
    const { t } = useTranslation()
    const [slides, setSlides] = useState<Slide[]>([])
    const [width, setWidth] = useState(0)
    const [height, setHeight] = useState(0)
    const [fit, setFit] = useState<'cover' | 'contain'>('contain')
    const [seconds, setSeconds] = useState(1.5)
    const [quality, setQuality] = useState(85)
    const [building, setBuilding] = useState(false)
    const [progress, setProgress] = useState(0)
    const [result, setResult] = useState<{ url: string; bytes: Uint8Array; width: number; height: number } | null>(null)
    const dragId = useRef<string | null>(null)
    const resultRef = useRef(result)
    resultRef.current = result

    useEffect(() => () => { if (resultRef.current) URL.revokeObjectURL(resultRef.current.url) }, [])
    const clearResult = () => setResult(previous => {
        if (previous) URL.revokeObjectURL(previous.url)
        return null
    })

    const totalSeconds = useMemo(
        () => slides.reduce((sum, slide) => sum + clampSeconds(slide.seconds, seconds), 0),
        [slides, seconds],
    )

    const handleAdd = async () => {
        try {
            const picked = await pickImages()
            if (picked.length === 0) return
            const sorted = [...picked].sort((a, b) => fileNameOf(a).localeCompare(fileNameOf(b), undefined, { numeric: true }))
            setSlides(current => [...current, ...sorted.map((path, index) => ({ id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`, path, seconds: '' }))])
            clearResult()
        } catch (error) {
            toast({ title: t('fileTools.pickFailed', '파일을 고르지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    const move = (from: number, to: number) => {
        setSlides(current => moveItem(current, from, to))
        clearResult()
    }

    const applyRatio = async (ratioWidth: number, ratioHeight: number) => {
        if (slides.length === 0) return
        try {
            const bitmap = await loadBitmap(slides[0].path)
            const size = sizeForRatio({ width: bitmap.width, height: bitmap.height }, ratioWidth, ratioHeight)
            bitmap.close()
            setWidth(size.width)
            setHeight(size.height)
            setFit('cover')
            clearResult()
        } catch (error) {
            toast({ title: t('fileTools.slideshow.readFailed', '사진을 읽지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    const handleBuild = async () => {
        if (slides.length === 0 || building) return
        setBuilding(true)
        setProgress(0)
        clearResult()
        const canvas = document.createElement('canvas')
        try {
            let size: { width: number; height: number } | null = null
            const frames: Array<{ bytes: Uint8Array; durationMs: number }> = []
            for (let index = 0; index < slides.length; index++) {
                const bitmap = await loadBitmap(slides[index].path)
                try {
                    if (!size) {
                        size = slideshowSize({ width: bitmap.width, height: bitmap.height }, width, height)
                        canvas.width = size.width
                        canvas.height = size.height
                    }
                    const context = canvas.getContext('2d')
                    if (!context) throw new Error('Canvas is not available')
                    context.fillStyle = '#000000'
                    context.fillRect(0, 0, size.width, size.height)
                    const rect = fitRect({ width: bitmap.width, height: bitmap.height }, size, fit)
                    context.imageSmoothingQuality = 'high'
                    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height)
                } finally {
                    bitmap.close()
                }
                const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
                    value => value && value.type === 'image/webp' ? resolve(value) : reject(new Error('WebP 인코딩을 지원하지 않습니다')),
                    'image/webp',
                    quality / 100,
                ))
                frames.push({ bytes: new Uint8Array(await blob.arrayBuffer()), durationMs: clampSeconds(slides[index].seconds, seconds) * 1000 })
                setProgress(index + 1)
            }
            if (!size) return
            const bytes = buildAnimatedWebp(frames, size.width, size.height)
            setResult({ url: URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'image/webp' })), bytes, width: size.width, height: size.height })
        } catch (error) {
            console.error('Failed to build the slideshow:', error)
            toast({ title: t('fileTools.slideshow.failed', 'WebP를 만들지 못했어요'), description: String(error), variant: 'destructive' })
        } finally {
            canvas.width = canvas.height = 0
            setBuilding(false)
        }
    }

    const handleSave = async () => {
        if (!result) return
        try {
            const first = slides[0] ? fileNameOf(slides[0].path).replace(/\.[^.]+$/, '') : 'slideshow'
            const path = await save({ defaultPath: `${first}_슬라이드쇼.webp`, filters: [{ name: 'WebP', extensions: ['webp'] }] })
            if (!path) return
            await writeFile(path, result.bytes)
            toast({ title: t('fileTools.slideshow.saved', '슬라이드쇼 WebP를 저장했어요'), description: path, variant: 'success' })
        } catch (error) {
            toast({ title: t('fileTools.saveFailed', '저장하지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    const numberInput = (value: number, onChange: (value: number) => void, props: { min?: number; max?: number; step?: number } = {}) => (
        <Input
            type="number"
            value={value}
            min={props.min ?? 0}
            max={props.max}
            step={props.step ?? 1}
            disabled={building}
            onChange={event => { onChange(Math.max(props.min ?? 0, Number(event.target.value) || 0)); clearResult() }}
            className="h-8 w-24"
        />
    )

    return (
        <div className="flex min-h-0 flex-1 gap-4 p-4">
            <div className="flex w-[24rem] shrink-0 flex-col gap-3 overflow-y-auto">
                <p className="text-xs text-muted-foreground">
                    {t('fileTools.slideshow.desc', '여러 사진을 순서대로 재생하는 움직이는 WebP 한 파일을 만듭니다. 목록에서 끌어서 순서를 바꾸고, 사진마다 표시 시간을 따로 줄 수 있습니다.')}
                </p>
                <Button variant="outline" className="h-9" onClick={() => void handleAdd()} disabled={building} data-slide-add>
                    <ImagePlus className="mr-1.5 h-4 w-4" />
                    {t('fileTools.slideshow.add', '사진 추가')}
                </Button>
                <div className="grid gap-1.5">
                    <span className="text-xs font-medium">{t('fileTools.slideshow.size', '출력 크기 (0 = 첫 사진 크기)')}</span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {numberInput(width, setWidth, { max: 16382 })}
                        <span>×</span>
                        {numberInput(height, setHeight, { max: 16382 })}
                        <span>px</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {RATIOS.map(ratio => (
                            <button key={ratio.label} type="button" className={chip(false)} disabled={building || slides.length === 0} onClick={() => void applyRatio(ratio.w, ratio.h)} data-slide-ratio>
                                {ratio.label}
                            </button>
                        ))}
                        <button type="button" className={chip(false)} disabled={building} onClick={() => { setWidth(0); setHeight(0); setFit('contain'); clearResult() }}>{t('fileTools.slideshow.original', '원래 크기')}</button>
                    </div>
                    <div className="flex gap-1.5">
                        <button type="button" className={chip(fit === 'cover')} disabled={building} onClick={() => { setFit('cover'); clearResult() }}>{t('fileTools.slideshow.cover', '가운데 기준으로 자르기')}</button>
                        <button type="button" className={chip(fit === 'contain')} disabled={building} onClick={() => { setFit('contain'); clearResult() }}>{t('fileTools.slideshow.contain', '전부 보이게 (여백)')}</button>
                    </div>
                </div>
                <label className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 font-medium">{t('fileTools.slideshow.seconds', '기본 표시 시간(초)')}</span>
                    {numberInput(seconds, setSeconds, { min: 0.05, max: 600, step: 0.1 })}
                </label>
                <label className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 font-medium">{t('fileTools.slideshow.quality', 'WebP 품질')}</span>
                    <input type="range" min={30} max={100} value={quality} disabled={building} onChange={event => { setQuality(Number(event.target.value)); clearResult() }} className="flex-1" />
                    <span className="w-8 tabular-nums text-muted-foreground">{quality}</span>
                </label>

                <ul className="min-h-[6rem] flex-1 space-y-1 overflow-y-auto rounded-xl border border-border/50 bg-background/40 p-1.5" data-slide-list>
                    {slides.length === 0 && <li className="px-2 py-8 text-center text-xs text-muted-foreground">{t('fileTools.slideshow.empty', '사진을 추가하세요. 두 장 이상이면 슬라이드쇼가 됩니다.')}</li>}
                    {slides.map((slide, index) => (
                        <li
                            key={slide.id}
                            data-slide
                            draggable={!building}
                            onDragStart={() => { dragId.current = slide.id }}
                            onDragOver={event => event.preventDefault()}
                            onDrop={event => {
                                event.preventDefault()
                                const from = slides.findIndex(item => item.id === dragId.current)
                                dragId.current = null
                                if (from >= 0 && from !== index) move(from, index)
                            }}
                            className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/40 p-1"
                        >
                            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                            <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                            <img src={convertFileSrc(slide.path)} alt="" draggable={false} loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
                            <span className="min-w-0 flex-1 truncate text-xs" title={slide.path}>{fileNameOf(slide.path)}</span>
                            <Input
                                value={slide.seconds}
                                onChange={event => { const value = event.target.value.replace(/[^0-9.]/g, '').slice(0, 6); setSlides(current => current.map(item => item.id === slide.id ? { ...item, seconds: value } : item)); clearResult() }}
                                placeholder={String(seconds)}
                                disabled={building}
                                title={t('fileTools.slideshow.perSlide', '이 사진의 표시 시간(초). 비우면 기본 시간')}
                                className="h-7 w-14 px-1.5 text-center text-xs"
                                data-slide-seconds
                            />
                            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={building || index === 0} onClick={() => move(index, index - 1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={building || index === slides.length - 1} onClick={() => move(index, index + 1)} data-slide-down><ArrowDown className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-500" disabled={building} onClick={() => { setSlides(current => current.filter(item => item.id !== slide.id)); clearResult() }}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </li>
                    ))}
                </ul>

                <div className="flex gap-2">
                    <Button className="h-10 flex-1" onClick={() => void handleBuild()} disabled={slides.length === 0 || building} data-slide-build>
                        {building ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        {building
                            ? t('fileTools.slideshow.building', '만드는 중 {{done}} / {{total}}', { done: progress, total: slides.length })
                            : t('fileTools.slideshow.build', 'WebP 만들기 ({{n}}장 · {{s}}초)', { n: slides.length, s: Math.round(totalSeconds * 10) / 10 })}
                    </Button>
                    <Button variant="outline" size="icon" className="h-10 w-10" disabled={building || slides.length === 0} onClick={() => { setSlides([]); clearResult() }} title={t('fileTools.reset', '초기화')}>
                        <RotateCcw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-border/50 bg-background/40 p-4">
                {result ? (
                    <>
                        <img src={result.url} alt="" className="min-h-0 max-w-full flex-1 rounded-lg object-contain" data-slide-result />
                        <p className="text-xs text-muted-foreground" data-slide-info>
                            {result.width} × {result.height} · {t('fileTools.slideshow.frames', '{{n}}장', { n: slides.length })} · {result.bytes.length >= 1024 * 1024 ? `${(result.bytes.length / 1024 / 1024).toFixed(2)} MB` : `${Math.max(1, Math.round(result.bytes.length / 1024))} KB`}
                        </p>
                        <Button className="h-10 px-6" onClick={() => void handleSave()} data-slide-save>
                            <Save className="mr-2 h-4 w-4" />
                            {t('fileTools.slideshow.save', 'WebP 저장')}
                        </Button>
                    </>
                ) : (
                    <p className="text-center text-sm text-muted-foreground">
                        {building ? t('fileTools.slideshow.wait', '만드는 중입니다…') : t('fileTools.slideshow.previewEmpty', '"WebP 만들기"를 누르면 여기에서 재생해 보고 저장할 수 있습니다.')}
                    </p>
                )}
            </div>
        </div>
    )
}

/**
 * 파일 도구: 메타데이터 제거(아랫줄 1픽셀 자르기 포함)와 슬라이드쇼 WebP 만들기.
 * 모든 처리는 이 PC 안에서만 한다.
 */
export default function FileTools() {
    const { t } = useTranslation()
    const [tab, setTab] = useState<ToolTab>('strip')
    const tabs: Array<{ id: ToolTab; label: string; icon: typeof Eraser }> = [
        { id: 'strip', label: t('fileTools.strip.title', '메타데이터 제거'), icon: Eraser },
        { id: 'slideshow', label: t('fileTools.slideshow.title', '슬라이드쇼 WebP'), icon: Film },
    ]
    return (
        <div className="flex h-full min-h-0 flex-col p-3" data-file-tools>
            <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border/60 bg-card/40">
                <div className="flex items-center gap-1 border-b border-border/40 px-3 py-2">
                    {tabs.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            data-file-tab={item.id}
                            onClick={() => setTab(item.id)}
                            className={cn(
                                'flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors',
                                tab === item.id ? 'bg-primary/15 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </button>
                    ))}
                    <span className="ml-auto text-[11px] text-muted-foreground">{t('fileTools.local', '모든 처리는 이 PC 안에서만 합니다')}</span>
                </div>
                {/* 탭을 오가도 고른 파일과 설정이 남도록 둘 다 그려 두고 숨긴다. */}
                <div className={cn('min-h-0 flex-1', tab === 'strip' ? 'flex' : 'hidden')}><StripTab /></div>
                <div className={cn('min-h-0 flex-1', tab === 'slideshow' ? 'flex' : 'hidden')}><SlideshowTab /></div>
            </section>
        </div>
    )
}
