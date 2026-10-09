import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { join } from '@tauri-apps/api/path'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { FolderOpen, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useSceneStore, type SceneCard } from '@/stores/scene-store'
import { characterExportFolderName, characterExportTargets } from '@/lib/character-asset-presets'
import { useFolderStore } from '@/stores/folder-store'
import { useSettingsStore } from '@/stores/settings-store'
import { openFolder, resolveWorkRoot } from '@/lib/rell-folders'
import { sanitizeSceneFolderName } from '@/lib/scene-path'
import {
    clampExportStart, formatBytes, planSceneWebpExport, previewExportNames, sanitizeExportPrefix,
} from '@/lib/scene-webp-export'

interface SceneWebpExportDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    presetId: string
    presetName: string
    /** 씬 모드에 보이는 순서 그대로 */
    scenes: SceneCard[]
}

interface FolderExportResult {
    exportedCount: number
    skippedCount: number
    skipped: string[]
    bytesBefore: number
    bytesAfter: number
}

interface ExportProgress {
    exportId: string
    completed: number
    total: number
}

const choiceClass = (active: boolean) => cn(
    'flex-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
    active ? 'border-primary bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted/50',
)

/**
 * 씬 모드의 이미지를 한 폴더로 내보낸다: 메타데이터(EXIF·프롬프트)를 지우고 WebP로 줄이고,
 * 씬 순서대로 1, 2, 3 … 또는 A1, A2 … 로 이름을 붙인다. 원본은 건드리지 않는다.
 */
export function SceneWebpExportDialog({ open, onOpenChange, presetId, presetName, scenes }: SceneWebpExportDialogProps) {
    const { t } = useTranslation()
    const options = useSettingsStore(state => state.sceneWebpExport)
    const setOptions = useSettingsStore(state => state.setSceneWebpExport)
    const linkedFolder = useFolderStore(state => state.links[presetId])
    const linkFolder = useFolderStore(state => state.linkFolder)
    const [folder, setFolder] = useState('')
    // 캐릭터씬이면 그 캐릭터의 캐릭터씬을 전부 한 번에 내보낼 수 있다 (릭/A, 릭/B).
    const presets = useSceneStore(state => state.presets)
    const characterAsset = presets.find(preset => preset.id === presetId)?.characterAsset
    const characterTargets = useMemo(
        () => (characterAsset ? characterExportTargets(presets, characterAsset.characterPromptId) : []),
        [presets, characterAsset],
    )
    const [exportAllOfCharacter, setExportAllOfCharacter] = useState(false)
    const batch = !!characterAsset && exportAllOfCharacter && characterTargets.length > 0
    const [isExporting, setIsExporting] = useState(false)
    const [progress, setProgress] = useState(0)

    // 열 때마다 저장 위치를 정한다: 연결된 작품 폴더, 없으면 <작품 폴더 위치>/<작품 이름>.
    useEffect(() => {
        if (!open) return
        let cancelled = false
        setProgress(0)
        if (batch && characterAsset) {
            // 캐릭터 폴더를 고르면 그 아래에 작품별 폴더가 만들어진다.
            void (async () => {
                const base = await join(await resolveWorkRoot(), characterExportFolderName(characterAsset))
                if (!cancelled) setFolder(base)
            })().catch(() => { if (!cancelled) setFolder('') })
            return () => { cancelled = true }
        }
        if (linkedFolder) {
            setFolder(linkedFolder)
            return
        }
        void (async () => {
            const root = await resolveWorkRoot()
            const own = characterTargets.find(target => target.preset.id === presetId)
            const fallback = characterAsset && own
                ? await join(root, characterExportFolderName(characterAsset), own.folderName)
                : await join(root, sanitizeSceneFolderName(presetName, 'Default'))
            if (!cancelled) setFolder(fallback)
        })().catch(() => { if (!cancelled) setFolder('') })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, linkedFolder, presetName, batch])

    useEffect(() => {
        if (open) setExportAllOfCharacter(false)
    }, [open, presetId])

    const plan = useMemo(() => planSceneWebpExport(scenes, {
        prefix: options.prefix,
        start: options.start,
        pad: options.pad,
        scope: options.scope,
    }), [scenes, options.prefix, options.start, options.pad, options.scope])

    // 일괄 내보내기: 캐릭터씬마다 같은 이름 규칙으로 따로 번호를 붙인다.
    const batchPlans = useMemo(() => (batch
        ? characterTargets.map(target => ({
            folderName: target.folderName,
            presetId: target.preset.id,
            plan: planSceneWebpExport((target.preset as { scenes: SceneCard[] }).scenes, {
                prefix: options.prefix, start: options.start, pad: options.pad, scope: options.scope,
            }),
        }))
        : []), [batch, characterTargets, options.prefix, options.start, options.pad, options.scope])
    const batchImageCount = batchPlans.reduce((sum, item) => sum + item.plan.entries.length, 0)
    const exportCount = batch ? batchImageCount : plan.entries.length

    const handleBrowse = async () => {
        const selected = await openDialog({ directory: true, multiple: false, defaultPath: folder || undefined })
        if (selected && typeof selected === 'string') setFolder(selected)
    }

    const handleExport = async () => {
        if (exportCount === 0 || !folder.trim()) return
        setIsExporting(true)
        setProgress(0)
        const exportId = `scene-webp-${Date.now()}`
        let unlisten: (() => void) | null = null
        try {
            // 한 폴더 또는 (일괄일 때) 작품별 폴더 여러 개
            const jobs = batch
                ? await Promise.all(batchPlans.filter(item => item.plan.entries.length > 0).map(async item => ({
                    outputDir: await join(folder.trim(), item.folderName),
                    entries: item.plan.entries,
                })))
                : [{ outputDir: folder.trim(), entries: plan.entries }]
            let finishedBefore = 0
            unlisten = await listen<ExportProgress>('scene-zip-progress', ({ payload }) => {
                if (payload.exportId === exportId) setProgress(Math.round(((finishedBefore + payload.completed) / exportCount) * 100))
            })
            const result: FolderExportResult = { exportedCount: 0, skippedCount: 0, skipped: [], bytesBefore: 0, bytesAfter: 0 }
            for (const job of jobs) {
                const part = await invoke<FolderExportResult>('export_scene_images_folder', {
                    outputDir: job.outputDir,
                    entries: job.entries.map(entry => ({ source: entry.source, fileName: entry.fileName })),
                    lossless: options.lossless,
                    quality: options.quality,
                    exportId,
                })
                finishedBefore += job.entries.length
                result.exportedCount += part.exportedCount
                result.skippedCount += part.skippedCount
                result.skipped.push(...part.skipped)
                result.bytesBefore += part.bytesBefore
                result.bytesAfter += part.bytesAfter
            }
            if (result.exportedCount === 0) {
                toast({ title: t('scene.webpExport.nothing', '내보낸 이미지가 없습니다'), variant: 'destructive' })
                return
            }
            // 다음에도 같은 폴더를 쓰도록 이 작품에 연결해 둔다 (일괄일 때는 캐릭터 폴더라 연결하지 않는다).
            if (!batch) linkFolder(presetId, folder.trim())
            const saved = result.bytesBefore > 0 ? Math.round((1 - result.bytesAfter / result.bytesBefore) * 100) : 0
            toast({
                title: t('scene.webpExport.done', '{{n}}장을 WebP로 내보냈어요', { n: result.exportedCount }),
                description: [
                    t('scene.webpExport.size', '{{before}} → {{after}} ({{saved}}% 감소)', {
                        before: formatBytes(result.bytesBefore),
                        after: formatBytes(result.bytesAfter),
                        saved,
                    }),
                    result.skippedCount > 0
                        ? t('scene.webpExport.skipped', '{{n}}장은 내보내지 못했어요: {{names}}', {
                            n: result.skippedCount,
                            names: result.skipped.slice(0, 5).join(', '),
                        })
                        : '',
                ].filter(Boolean).join(' · '),
                variant: result.skippedCount > 0 ? 'default' : 'success',
            })
            onOpenChange(false)
            void openFolder(folder.trim()).catch(() => undefined)
        } catch (error) {
            console.error('Scene WebP export failed:', error)
            toast({ title: t('scene.webpExport.failed', '내보내기에 실패했어요'), description: String(error), variant: 'destructive' })
        } finally {
            unlisten?.()
            setIsExporting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(value: boolean) => !isExporting && onOpenChange(value)}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('scene.webpExport.title', 'EXIF 제거 + WebP로 내보내기')}</DialogTitle>
                    <DialogDescription>
                        {t('scene.webpExport.desc', '씬 순서대로 번호를 붙여 한 폴더에 모읍니다. 프롬프트 같은 메타데이터는 지워지고, 원본 이미지는 그대로 남아요.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    {characterAsset && characterTargets.length > 0 && (
                        <label className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm" data-character-batch>
                            <span>
                                {t('scene.webpExport.characterAll', "'{{name}}'의 캐릭터씬 {{n}}개 모두 내보내기", { name: characterAsset.characterName, n: characterTargets.length })}
                                <span className="block text-xs text-muted-foreground">
                                    {t('scene.webpExport.characterAllHelp', '캐릭터 폴더 아래에 작품별 폴더로 나눠 담습니다: {{folders}}', {
                                        folders: characterTargets.slice(0, 3).map(target => `${characterExportFolderName(characterAsset)}/${target.folderName}`).join(', ') + (characterTargets.length > 3 ? ' …' : ''),
                                    })}
                                </span>
                            </span>
                            <Switch checked={exportAllOfCharacter} onChange={event => setExportAllOfCharacter(event.target.checked)} disabled={isExporting} />
                        </label>
                    )}
                    <div className="grid gap-2">
                        <Label>{t('scene.webpExport.naming', '파일 이름')}</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                value={options.prefix}
                                onChange={event => setOptions({ prefix: sanitizeExportPrefix(event.target.value) })}
                                placeholder={t('scene.webpExport.prefixPlaceholder', '앞 글자 (예: A) · 비우면 번호만')}
                                disabled={isExporting}
                                className="flex-1"
                            />
                            <span className="shrink-0 text-xs text-muted-foreground">{t('scene.webpExport.startAt', '시작 번호')}</span>
                            <Input
                                type="number"
                                min={0}
                                value={options.start}
                                onChange={event => setOptions({ start: clampExportStart(event.target.value) })}
                                disabled={isExporting}
                                className="w-20"
                            />
                        </div>
                        <label className="flex items-center justify-between gap-3 text-sm">
                            <span>{t('scene.webpExport.pad', '자릿수 맞추기 (1 → 001)')}</span>
                            <Switch checked={options.pad} onChange={event => setOptions({ pad: event.target.checked })} disabled={isExporting} />
                        </label>
                        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                            {batch
                                ? batchPlans.map(item => (
                                    <span key={item.presetId} className="block">
                                        {item.folderName}: {item.plan.entries.length > 0
                                            ? `${previewExportNames(item.plan.entries)} (${t('scene.webpExport.count', '{{n}}장', { n: item.plan.entries.length })})`
                                            : t('scene.webpExport.noImages', '내보낼 이미지가 없습니다')}
                                    </span>
                                ))
                                : plan.entries.length > 0
                                    ? `${previewExportNames(plan.entries)}  (${t('scene.webpExport.count', '{{n}}장', { n: plan.entries.length })})`
                                    : t('scene.webpExport.noImages', '내보낼 이미지가 없습니다')}
                            {!batch && plan.emptyScenes.length > 0 && (
                                <span className="mt-1 block">
                                    {t('scene.webpExport.empty', '이미지가 없는 씬 {{n}}개는 번호만 비워 둡니다.', { n: plan.emptyScenes.length })}
                                </span>
                            )}
                        </p>
                    </div>

                    <div className="grid gap-2">
                        <Label>{t('scene.webpExport.scope', '씬마다 내보낼 이미지')}</Label>
                        <div className="flex gap-2">
                            <button type="button" disabled={isExporting} className={choiceClass(options.scope === 'representative')} onClick={() => setOptions({ scope: 'representative' })}>
                                {t('scene.webpExport.scopeOne', '대표 1장')}
                                <span className="block text-xs opacity-70">{t('scene.webpExport.scopeOneHelp', '즐겨찾기, 없으면 가장 최근 이미지')}</span>
                            </button>
                            <button type="button" disabled={isExporting} className={choiceClass(options.scope === 'all')} onClick={() => setOptions({ scope: 'all' })}>
                                {t('scene.webpExport.scopeAll', '전부')}
                                <span className="block text-xs opacity-70">{t('scene.webpExport.scopeAllHelp', '오래된 순으로 A1-1, A1-2 …')}</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label>{t('scene.webpExport.quality', '화질')}</Label>
                        <div className="flex gap-2">
                            <button type="button" disabled={isExporting} className={choiceClass(options.lossless)} onClick={() => setOptions({ lossless: true })}>
                                {t('scene.webpExport.lossless', '무손실')}
                                <span className="block text-xs opacity-70">{t('scene.webpExport.losslessHelp', '화질 그대로 · 용량은 조금 줄어요')}</span>
                            </button>
                            <button type="button" disabled={isExporting} className={choiceClass(!options.lossless)} onClick={() => setOptions({ lossless: false })}>
                                {t('scene.webpExport.lossy', '고화질 압축')}
                                <span className="block text-xs opacity-70">{t('scene.webpExport.lossyHelp', '눈으로 거의 구분 안 됨 · 용량 크게 감소')}</span>
                            </button>
                        </div>
                        {!options.lossless && (
                            <div className="grid gap-2 pt-1">
                                <span className="text-xs text-muted-foreground">{t('scene.webpExport.qualityValue', '압축 품질 {{n}}%', { n: options.quality })}</span>
                                <Slider value={[options.quality]} onValueChange={(value: number[]) => setOptions({ quality: value[0] })} min={70} max={100} step={1} disabled={isExporting} />
                            </div>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <Label>{batch ? t('scene.webpExport.characterFolder', '캐릭터 폴더 (이 아래에 작품별 폴더가 생깁니다)') : t('scene.webpExport.folder', '저장할 폴더')}</Label>
                        <div className="flex gap-2">
                            <Input value={folder} onChange={event => setFolder(event.target.value)} disabled={isExporting} className="flex-1 text-xs" />
                            <Button type="button" variant="outline" size="icon" onClick={() => void handleBrowse()} disabled={isExporting} aria-label={t('scene.webpExport.browse', '폴더 선택')}>
                                <FolderOpen className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t('scene.webpExport.folderHelp', '폴더가 없으면 새로 만들고, 같은 이름의 파일이 있으면 덮어씁니다. 이 폴더는 이 작품에 연결되어 다음에도 쓰여요.')}
                        </p>
                    </div>
                </div>

                <DialogFooter className="items-center sm:justify-between">
                    <span className="text-xs text-muted-foreground">
                        {isExporting ? t('scene.webpExport.progress', '변환 중… {{n}}%', { n: progress }) : ''}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>{t('common.cancel')}</Button>
                        <Button onClick={() => void handleExport()} disabled={isExporting || exportCount === 0 || !folder.trim()}>
                            {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('scene.webpExport.run', '내보내기')}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
