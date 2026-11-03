import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { convertFileSrc } from '@tauri-apps/api/core'
import { BookmarkPlus, Check, Layers, Loader2, Save, Settings2, Wand2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tip } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { usePostprocessStore } from '@/stores/postprocess-store'
import { usePostprocessPopup } from '@/stores/postprocess-popup-store'
import { useSceneStore } from '@/stores/scene-store'
import { findSceneImageOwner } from '@/lib/scene-path'
import { pathKey } from '@/lib/scene-folder-sync'
import { sameAspect } from '@/lib/postprocess'
import { BALLOON_STUDIO_URL, fileToDataUrl, postprocessImages, thumbnailOf, waitForBridge, type BalloonBridge } from '@/services/postprocess-render'
import { PostprocessTemplateManager } from '@/components/postprocess/PostprocessTemplateManager'

type ApplyMode = 'all' | 'some'

/**
 * 이미지 오른쪽 클릭 → 후처리: 수동검열처럼 뜨는 창.
 * 말풍선 · 에셋 · 이미지 템플릿만 쓰는 말풍선 공방에서 작업하고, 그 내용을 후처리로 저장해
 * 이 이미지가 속한 씬에 전체(앞으로 뽑는 이미지 포함) 또는 일부(고른 이미지) 적용한다.
 */
export function PostprocessPopupHost() {
    const path = usePostprocessPopup(state => state.path)
    const close = usePostprocessPopup(state => state.close)
    return path ? <PostprocessPopup key={path} path={path} onClose={close} /> : null
}

function PostprocessPopup({ path, onClose }: { path: string; onClose: () => void }) {
    const { t } = useTranslation()
    const frameRef = useRef<HTMLIFrameElement>(null)
    const [bridge, setBridge] = useState<BalloonBridge | null>(null)
    const templates = usePostprocessStore(state => state.templates)
    const [currentId, setCurrentId] = useState<string | null>(null)
    const [picked, setPicked] = useState('')
    const [name, setName] = useState('')
    const [managerOpen, setManagerOpen] = useState(false)
    const [step, setStep] = useState<'edit' | 'apply'>('edit')
    const [mode, setMode] = useState<ApplyMode>('all')
    const [checked, setChecked] = useState<Set<string>>(new Set([pathKey(path)]))
    const [busy, setBusy] = useState(false)

    const owner = useMemo(() => findSceneImageOwner(useSceneStore.getState().presets, path), [path])
    const scene = useSceneStore(state => owner ? state.presets.find(preset => preset.id === owner.presetId)?.scenes.find(item => item.id === owner.sceneId) ?? null : null)
    const sceneImages = useMemo(() => (scene?.images ?? []).filter(image => !image.url.startsWith('data:')), [scene])
    const applied = usePostprocessStore(state => state.applied)
    const current = templates.find(template => template.id === currentId) ?? null

    useEffect(() => {
        const frame = frameRef.current
        if (!frame) return
        let cancelled = false
        waitForBridge(frame).then(async found => {
            if (cancelled) return
            await found.openImage(await fileToDataUrl(path))
            if (!cancelled) setBridge(found)
        }).catch(error => {
            if (!cancelled) toast({ title: t('postprocess.loadFailed', '말풍선 공방을 불러오지 못했어요'), description: String(error), variant: 'destructive' })
        })
        return () => { cancelled = true }
    }, [path, t])

    /** 지금 화면의 구성을 후처리로 저장한다. 불러온/저장한 후처리가 있고 이름을 새로 안 적었으면 그것을 덮어쓴다. */
    const saveCurrent = async (): Promise<string | null> => {
        if (!bridge) return null
        const doc = bridge.templateDoc()
        const size = bridge.size()
        const thumbnail = await thumbnailOf(await bridge.exportPNG())
        const store = usePostprocessStore.getState()
        const typed = name.trim()
        if (current && (!typed || typed === current.name)) {
            store.updateTemplate(current.id, { doc, width: size.width, height: size.height, thumbnail })
            return current.id
        }
        const id = store.addTemplate({ name: typed || (scene ? `${scene.name} 후처리` : ''), doc, width: size.width, height: size.height, thumbnail })
        setCurrentId(id)
        setPicked(id)
        setName('')
        return id
    }

    const handleSave = async () => {
        try {
            const id = await saveCurrent()
            const saved = usePostprocessStore.getState().templates.find(item => item.id === id)
            if (saved) toast({ title: t('postprocess.saved2', '후처리 "{{name}}"을 저장했어요', { name: saved.name }), variant: 'success' })
        } catch (error) {
            toast({ title: t('postprocess.templateFailed', '후처리를 저장하지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    const handleLoad = async () => {
        const template = templates.find(item => item.id === picked)
        if (!bridge || !template) return
        const size = bridge.size()
        if (!sameAspect(template, size)) {
            toast({ title: t('postprocess.aspect', '이미지와 후처리의 가로세로 비율이 달라요'), description: `${template.width}×${template.height} · ${size.width}×${size.height}` })
        }
        await bridge.applyTemplate(template.doc)
        setCurrentId(template.id)
    }

    const apply = async () => {
        if (!owner) return
        setBusy(true)
        try {
            const id = await saveCurrent()
            if (!id) return
            const templateName = usePostprocessStore.getState().templates.find(item => item.id === id)?.name ?? ''
            const targets = mode === 'all' ? sceneImages.map(image => image.url) : sceneImages.filter(image => checked.has(pathKey(image.url))).map(image => image.url)
            if (mode === 'all') usePostprocessStore.getState().setSceneTemplate(owner.presetId, owner.sceneId, id)
            const result = await postprocessImages(id, targets)
            toast({
                title: mode === 'all'
                    ? t('postprocess.appliedAll', '"{{scene}}" 전체에 "{{name}}" 적용 ({{n}}장) · 앞으로 뽑는 이미지에도 자동 적용', { scene: scene?.name, name: templateName, n: result.done })
                    : t('postprocess.appliedSome', '"{{scene}}"에서 고른 {{n}}장에 "{{name}}" 적용', { scene: scene?.name, name: templateName, n: result.done }),
                description: result.skipped > 0 ? t('scenePost.skipped', '{{n}}장은 입히지 못했어요 (비율이 다르거나 파일이 없음).', { n: result.skipped }) : t('postprocess.whereSaved', '씬 폴더 안 "후처리" 폴더에 저장했어요. 원본은 그대로예요.'),
                variant: result.skipped > 0 ? 'destructive' : 'success',
            })
            onClose()
        } catch (error) {
            toast({ title: t('postprocess.applyFailed', '적용하지 못했어요'), description: String(error), variant: 'destructive' })
        } finally {
            setBusy(false)
        }
    }

    const applyOnlyThis = async () => {
        setBusy(true)
        try {
            const id = await saveCurrent()
            if (!id) return
            const result = await postprocessImages(id, [path])
            toast({ title: result.done ? t('postprocess.thisDone', '이 이미지에 후처리를 적용했어요') : t('postprocess.applyFailed', '적용하지 못했어요'), description: result.done ? t('postprocess.whereSaved2', '같은 폴더 안 "후처리" 폴더에 저장했어요. 원본은 그대로예요.') : undefined, variant: result.done ? 'success' : 'destructive' })
            if (result.done) onClose()
        } finally {
            setBusy(false)
        }
    }

    const toggle = (url: string) => setChecked(previous => {
        const next = new Set(previous)
        const key = pathKey(url)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
    })
    const someCount = sceneImages.filter(image => checked.has(pathKey(image.url))).length

    return (
        <Dialog open onOpenChange={(open: boolean) => { if (!open && !busy) onClose() }}>
            <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw]" data-postprocess-popup>
                <DialogTitle className="sr-only">{t('postprocess.title', '후처리')}</DialogTitle>
                <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-3 py-2 pr-12">
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><Wand2 className="h-4 w-4 text-primary" />{t('postprocess.title', '후처리')}</span>
                    {scene && <span className="truncate text-xs text-muted-foreground">{scene.name}</span>}
                    {current && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary" data-postprocess-current>{current.name}</span>}
                    <div className="ml-auto flex items-center gap-1 rounded-lg border border-border/60 p-0.5">
                        <select value={picked} onChange={event => setPicked(event.target.value)} className="h-7 max-w-[12rem] rounded-md bg-transparent px-1.5 text-xs outline-none" data-postprocess-template-select>
                            <option value="">{templates.length > 0 ? t('postprocess.pickSaved', '저장한 후처리 불러오기') : t('postprocess.noTemplates', '저장한 후처리 없음')}</option>
                            {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                        </select>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void handleLoad()} disabled={!bridge || !picked} data-postprocess-apply>
                            <Layers className="mr-1 h-3.5 w-3.5" />{t('postprocess.load', '불러오기')}
                        </Button>
                        <Tip content={t('postprocess.manage', '후처리 관리 (이름 바꾸기 · 지우기)')}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setManagerOpen(true)} disabled={templates.length === 0}><Settings2 className="h-3.5 w-3.5" /></Button>
                        </Tip>
                    </div>
                </div>

                <div className="relative min-h-0 flex-1">
                    {!bridge && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />{t('postprocess.loading', '여는 중…')}
                        </div>
                    )}
                    <iframe ref={frameRef} src={`${BALLOON_STUDIO_URL}?mode=post`} title="후처리" className={cn('h-full w-full border-0', step === 'apply' && 'pointer-events-none opacity-30')} data-postprocess-frame />
                    {step === 'apply' && owner && (
                        <div className="absolute inset-x-0 bottom-0 top-0 z-20 flex flex-col bg-background/95 p-4" data-postprocess-apply-panel>
                            <p className="text-sm font-semibold">{t('postprocess.applyTitle', '"{{scene}}"에 어떻게 적용할까요?', { scene: scene?.name })}</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <button type="button" onClick={() => setMode('all')} className={cn('rounded-lg border-2 p-3 text-left text-sm', mode === 'all' ? 'border-primary' : 'border-border/50')} data-postprocess-mode-all>
                                    <span className="font-semibold">{t('postprocess.modeAll', '전체 적용')}</span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">{t('postprocess.modeAllHelp', '이 씬의 이미지 {{n}}장 모두 + 앞으로 뽑는 이미지에도 자동으로', { n: sceneImages.length })}</span>
                                </button>
                                <button type="button" onClick={() => setMode('some')} className={cn('rounded-lg border-2 p-3 text-left text-sm', mode === 'some' ? 'border-primary' : 'border-border/50')} data-postprocess-mode-some>
                                    <span className="font-semibold">{t('postprocess.modeSome', '일부 적용')}</span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">{t('postprocess.modeSomeHelp', '아래에서 고른 이미지에만 (지금 {{n}}장)', { n: someCount })}</span>
                                </button>
                            </div>
                            {mode === 'some' && (
                                <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
                                    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(7rem, 1fr))' }}>
                                        {sceneImages.map(image => {
                                            const on = checked.has(pathKey(image.url))
                                            const done = !!applied[pathKey(image.url)]
                                            return (
                                                <button key={image.id} type="button" onClick={() => toggle(image.url)} className={cn('relative overflow-hidden rounded-lg border-2', on ? 'border-primary' : 'border-border/50')} data-postprocess-pick>
                                                    <img src={convertFileSrc(image.url)} alt="" loading="lazy" className="aspect-[2/3] w-full object-cover" />
                                                    <span className={cn('absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-white/60 bg-black/40')}>{on && <Check className="h-3.5 w-3.5" />}</span>
                                                    {done && <span className="absolute bottom-1 left-1 rounded bg-primary/85 px-1 text-[10px] font-semibold text-primary-foreground">+후처리 적용중</span>}
                                                    {image.url === path && <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">{t('postprocess.thisImage', '지금 이미지')}</span>}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                            <div className="mt-auto flex justify-end gap-2 pt-3">
                                <Button variant="outline" onClick={() => setStep('edit')} disabled={busy}>{t('postprocess.backToEdit', '편집으로')}</Button>
                                <Button onClick={() => void apply()} disabled={busy || (mode === 'some' && someCount === 0)} data-postprocess-apply-run>
                                    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                                    {mode === 'all' ? t('postprocess.runAll', '전체 적용') : t('postprocess.runSome', '{{n}}장에 적용', { n: someCount })}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border/40 px-3 py-2">
                    <Button variant="outline" onClick={onClose} disabled={busy}>{t('common.cancel', '취소')}</Button>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5">
                            <Input value={name} onChange={event => setName(event.target.value)} placeholder={current ? current.name : t('postprocess.templateName', '후처리 이름')} className="h-8 w-40 border-0 text-xs focus-visible:ring-0" data-postprocess-template-name />
                            <Tip content={current ? t('postprocess.saveOverTip', '이름을 비우면 "{{name}}"을 지금 내용으로 덮어써요. 새 이름을 적으면 새로 저장해요.', { name: current.name }) : t('postprocess.saveTip2', '지금 말풍선 · 에셋 · 템플릿 구성을 후처리로 저장 (그림은 저장 안 함)')}>
                                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => void handleSave()} disabled={!bridge || busy} data-postprocess-save-template>
                                    <BookmarkPlus className="mr-1 h-3.5 w-3.5" />{t('postprocess.saveTemplate2', '후처리 저장')}
                                </Button>
                            </Tip>
                        </div>
                        <Button variant="outline" onClick={() => void applyOnlyThis()} disabled={!bridge || busy} data-postprocess-this>
                            <Save className="mr-1.5 h-4 w-4" />{t('postprocess.onlyThis', '이 이미지만 적용')}
                        </Button>
                        {owner && (
                            <Button onClick={() => setStep('apply')} disabled={!bridge || busy || step === 'apply'} data-postprocess-to-scene>
                                <Wand2 className="mr-1.5 h-4 w-4" />{t('postprocess.toScene', '씬에 적용…')}
                            </Button>
                        )}
                    </div>
                </div>
                {managerOpen && <PostprocessTemplateManager open={managerOpen} onOpenChange={setManagerOpen} />}
            </DialogContent>
        </Dialog>
    )
}
