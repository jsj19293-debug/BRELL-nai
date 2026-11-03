import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { convertFileSrc } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { ArrowDown, ArrowUp, BookmarkPlus, Check, Copy, Layers, Loader2, Maximize, Plus, Redo, Save, Settings2, Trash2, Undo, Wand2, X } from 'lucide-react'
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
import { fileToDataUrl, postprocessImages, thumbnailOf, type BalloonBridge } from '@/services/postprocess-render'
import { ensureEngine, hideEngine, showEngineAt, type CatalogItem, type EngineSelection, type PostprocessEngine } from '@/services/postprocess-engine'
import { PostprocessTemplateManager } from '@/components/postprocess/PostprocessTemplateManager'

type ApplyMode = 'all' | 'some'
type Section = 'balloon' | 'asset' | 'template'

const BALLOON_TABS: Array<[string, string]> = [['thin', '얇은 선'], ['thick', '굵은 선'], ['translucent', '반투명'], ['emotion', '떨림·움찔'], ['handdrawn', '손그림'], ['references', '참고 56종']]
const ASSET_TABS: Array<[string, string]> = [['builtin', '기본 에셋'], ['ogok', '오곡전도사'], ['reactions', '히토미 켜라'], ['censor', '검열'], ['beta-censor', '베타검열'], ['cross-section', '단면도'], ['custom', '내 에셋']]
const TEMPLATE_TABS: Array<[string, string]> = [['window', '윈도우 창 · 이동형 8종'], ['frame', '프레임·템플릿']]
const WINDOW_FIELDS: Array<[string, string, boolean?]> = [['dw-title', '창 제목'], ['dw-lead', '강조 문구'], ['dw-body', '본문', true], ['dw-footer', '추가 안내'], ['dw-button0', '버튼 1'], ['dw-button1', '버튼 2'], ['dw-button2', '버튼 3'], ['dw-code', '중지 코드']]

/**
 * 이미지 오른쪽 클릭 → 후처리. 수동검열처럼 뜨는 NAIS 창:
 * 왼쪽 말풍선 · 에셋 · 이미지 템플릿 목록, 가운데 그림판, 오른쪽 고른 것 고치기(대사 · 창 문구),
 * 아래 후처리 저장 · 이 이미지만 적용 · 씬에 적용(전체 / 일부).
 */
export function PostprocessPopupHost() {
    const path = usePostprocessPopup(state => state.path)
    const close = usePostprocessPopup(state => state.close)
    return path ? <PostprocessPopup key={path} path={path} onClose={close} /> : null
}

function PostprocessPopup({ path, onClose }: { path: string; onClose: () => void }) {
    const { t } = useTranslation()
    const stageRef = useRef<HTMLDivElement>(null)
    const [engine, setEngine] = useState<PostprocessEngine | null>(null)
    const [bridge, setBridge] = useState<BalloonBridge | null>(null)
    const [section, setSection] = useState<Section>('asset')
    const [tab, setTab] = useState<Record<Section, string>>({ balloon: 'thin', asset: 'builtin', template: 'window' })
    const [catalogs, setCatalogs] = useState<Record<string, CatalogItem[]>>({})
    const [selection, setSelection] = useState<EngineSelection>({ version: 0, type: 'none' })
    const [draft, setDraft] = useState<Record<string, string>>({})
    const focusedRef = useRef<string | null>(null)
    const templates = usePostprocessStore(state => state.templates)
    const applied = usePostprocessStore(state => state.applied)
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
    const current = templates.find(template => template.id === currentId) ?? null
    const group = section === 'template' ? tab.template : `${section}:${tab[section]}`

    // 미리 떠 있는 엔진을 받아 이 이미지로 새로 시작한다.
    useEffect(() => {
        let cancelled = false
        ensureEngine().then(async ({ engine: found, bridge: foundBridge }) => {
            await found.reset(await fileToDataUrl(path))
            if (cancelled) return
            setEngine(found)
            setBridge(foundBridge)
        }).catch(error => {
            if (!cancelled) toast({ title: t('postprocess.loadFailed', '후처리를 열지 못했어요'), description: String(error), variant: 'destructive' })
        })
        return () => { cancelled = true; hideEngine() }
    }, [path, t])

    // 그림판을 가운데 자리에 겹쳐 보여 준다 (씬에 적용 단계에서는 치운다).
    useLayoutEffect(() => {
        const stage = stageRef.current
        if (!engine || !stage) return
        if (step !== 'edit') { hideEngine(); return }
        const place = () => showEngineAt(stage.getBoundingClientRect())
        place()
        const observer = new ResizeObserver(place)
        observer.observe(stage)
        window.addEventListener('resize', place)
        const timer = window.setTimeout(() => { place(); engine.action('fit') }, 50)
        const timer2 = window.setTimeout(() => { place(); engine.action('fit') }, 350)
        return () => { observer.disconnect(); window.removeEventListener('resize', place); window.clearTimeout(timer); window.clearTimeout(timer2) }
    }, [engine, step])

    // 목록은 처음 볼 때 한 번 읽어 둔다.
    useEffect(() => {
        if (!engine || catalogs[group]) return
        setCatalogs(previous => ({ ...previous, [group]: engine.catalog(group) }))
    }, [engine, group, catalogs])

    // 고른 것을 따라간다 (입력 중인 칸은 덮어쓰지 않는다).
    useEffect(() => {
        if (!engine) return
        const timer = window.setInterval(() => {
            const next = engine.selection()
            setSelection(previous => {
                if (previous.version === next.version && previous.type === next.type && previous.text === next.text && JSON.stringify(previous.fields) === JSON.stringify(next.fields)) return previous
                setDraft(old => {
                    const values: Record<string, string> = { ...(next.fields ?? {}), text: next.text ?? '' }
                    const keep = focusedRef.current
                    return keep ? { ...values, [keep]: old[keep] ?? values[keep] } : values
                })
                return next
            })
        }, 300)
        return () => window.clearInterval(timer)
    }, [engine])

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [busy, onClose])

    const add = async (item: CatalogItem) => {
        if (!engine) return
        await engine.choose(group, item.index)
        setSelection(engine.selection())
    }

    const edit = (key: string, value: string) => {
        setDraft(previous => ({ ...previous, [key]: value }))
        engine?.update({ [key]: value })
    }

    const registerCustom = async () => {
        if (!engine) return
        const picked = await openDialog({ multiple: true, filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] }).catch(() => null)
        const files = Array.isArray(picked) ? picked : picked ? [picked] : []
        for (const file of files) {
            try {
                const list = await engine.addCustomAsset(await fileToDataUrl(file), file.split(/[\\/]/).pop() || 'asset.png')
                setCatalogs(previous => ({ ...previous, 'asset:custom': list }))
            } catch (error) {
                toast({ title: t('postprocess.customFailed', '내 에셋을 등록하지 못했어요'), description: String(error), variant: 'destructive' })
            }
        }
    }

    /** 지금 구성을 후처리로 저장. 불러온/저장한 후처리가 있고 새 이름을 안 적었으면 덮어쓴다. */
    const saveCurrent = useCallback(async (): Promise<string | null> => {
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
    }, [bridge, current, name, scene])

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
        if (!sameAspect(template, size)) toast({ title: t('postprocess.aspect', '이미지와 후처리의 가로세로 비율이 달라요'), description: `${template.width}×${template.height} · ${size.width}×${size.height}` })
        await bridge.applyTemplate(template.doc)
        setCurrentId(template.id)
    }

    const runApply = async (targets: string[], all: boolean) => {
        setBusy(true)
        try {
            const id = await saveCurrent()
            if (!id) return
            const templateName = usePostprocessStore.getState().templates.find(item => item.id === id)?.name ?? ''
            if (all && owner) usePostprocessStore.getState().setSceneTemplate(owner.presetId, owner.sceneId, id)
            const result = await postprocessImages(id, targets)
            toast({
                title: all
                    ? t('postprocess.appliedAll', '"{{scene}}" 전체에 "{{name}}" 적용 ({{n}}장) · 앞으로 뽑는 이미지에도 자동 적용', { scene: scene?.name, name: templateName, n: result.done })
                    : t('postprocess.appliedSome2', '{{n}}장에 "{{name}}" 적용', { name: templateName, n: result.done }),
                description: result.skipped > 0 ? t('scenePost.skipped', '{{n}}장은 입히지 못했어요 (비율이 다르거나 파일이 없음).', { n: result.skipped }) : t('postprocess.whereSaved', '같은 폴더 안 "후처리" 폴더에 저장했어요. 원본은 그대로예요.'),
                variant: result.skipped > 0 ? 'destructive' : 'success',
            })
            if (result.done > 0) onClose()
        } catch (error) {
            toast({ title: t('postprocess.applyFailed', '적용하지 못했어요'), description: String(error), variant: 'destructive' })
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
    const someTargets = sceneImages.filter(image => checked.has(pathKey(image.url))).map(image => image.url)
    const items = catalogs[group]
    const tabs = section === 'balloon' ? BALLOON_TABS : section === 'asset' ? ASSET_TABS : TEMPLATE_TABS
    const textKey = (key: string) => ({ onFocus: () => { focusedRef.current = key }, onBlur: () => { focusedRef.current = null } })

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" data-postprocess-popup>
            <div className="flex h-full w-full max-w-[1800px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl">
                {/* 위: 제목 · 불러오기 · 되돌리기 */}
                <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><Wand2 className="h-4 w-4 text-primary" />{t('postprocess.title', '후처리')}</span>
                    {scene && <span className="max-w-[12rem] truncate text-xs text-muted-foreground">{scene.name}</span>}
                    {current && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary" data-postprocess-current>{current.name}</span>}
                    <div className="mx-2 flex items-center gap-0.5">
                        {([['undo', Undo, '되돌리기'], ['redo', Redo, '다시 실행'], ['duplicate', Copy, '복제'], ['forward', ArrowUp, '앞으로'], ['backward', ArrowDown, '뒤로'], ['delete', Trash2, '삭제'], ['fit', Maximize, '화면 맞춤']] as const).map(([action, Icon, label]) => (
                            <Tip key={action} content={t(`postprocess.action.${action}`, label)}>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => engine && setSelection(engine.action(action))} disabled={!engine || step !== 'edit'} data-postprocess-action={action}>
                                    <Icon className="h-4 w-4" />
                                </Button>
                            </Tip>
                        ))}
                    </div>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} disabled={busy} aria-label={t('common.close', '닫기')}><X className="h-4 w-4" /></Button>
                </div>

                <div className="flex min-h-0 flex-1">
                    {/* 왼쪽: 넣을 것 */}
                    <aside className="flex w-72 shrink-0 flex-col border-r border-border/40" data-postprocess-catalog>
                        <div className="grid grid-cols-3 gap-1 p-2">
                            {([['balloon', '말풍선'], ['asset', '에셋'], ['template', '이미지 템플릿']] as Array<[Section, string]>).map(([key, label]) => (
                                <button key={key} type="button" onClick={() => setSection(key)} className={cn('rounded-lg px-2 py-1.5 text-xs font-semibold', section === key ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground')} data-postprocess-section={key}>
                                    {t(`postprocess.section.${key}`, label)}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-1 px-2 pb-2">
                            {tabs.map(([key, label]) => (
                                <button key={key} type="button" onClick={() => setTab(previous => ({ ...previous, [section]: key }))} className={cn('rounded-md border px-2 py-1 text-[11px]', tab[section] === key ? 'border-primary text-primary' : 'border-border/60 text-muted-foreground hover:text-foreground')} data-postprocess-tab={key}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        {group === 'asset:custom' && (
                            <div className="px-2 pb-2">
                                <Button variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => void registerCustom()} disabled={!engine}><Plus className="mr-1 h-3.5 w-3.5" />{t('postprocess.addCustom', '내 에셋 등록 (PNG · JPG · WebP)')}</Button>
                            </div>
                        )}
                        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                            {!engine || !items ? (
                                <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                            ) : items.length === 0 ? (
                                <p className="py-8 text-center text-xs text-muted-foreground">{group === 'asset:custom' ? t('postprocess.noCustom', '등록한 에셋이 없어요.') : t('postprocess.empty', '목록이 비어 있어요.')}</p>
                            ) : (
                                <div className="grid grid-cols-2 gap-1.5">
                                    {items.map(item => (
                                        <button key={item.index} type="button" onClick={() => void add(item)} title={item.label} className="group overflow-hidden rounded-lg border border-border/50 bg-muted/20 text-left hover:border-primary/60" data-postprocess-item>
                                            {item.thumb
                                                ? <img src={item.thumb} alt="" loading="lazy" className="aspect-[4/3] w-full bg-white/5 object-contain" />
                                                : <div className="flex aspect-[4/3] w-full items-center justify-center bg-white/5 text-[10px] text-muted-foreground">{item.label}</div>}
                                            <span className="block truncate px-1.5 py-1 text-[10px] text-muted-foreground group-hover:text-foreground">{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </aside>

                    {/* 가운데: 그림판 (엔진이 이 자리에 겹쳐 보인다) */}
                    <div className="relative min-w-0 flex-1 bg-[#0b0d10]">
                        <div ref={stageRef} className="absolute inset-2" data-postprocess-stage />
                        {!engine && (
                            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />{t('postprocess.loading', '여는 중…')}
                            </div>
                        )}
                        {step === 'apply' && owner && (
                            <div className="absolute inset-0 z-10 flex flex-col bg-background p-4" data-postprocess-apply-panel>
                                <p className="text-sm font-semibold">{t('postprocess.applyTitle', '"{{scene}}"에 어떻게 적용할까요?', { scene: scene?.name })}</p>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    <button type="button" onClick={() => setMode('all')} className={cn('rounded-lg border-2 p-3 text-left text-sm', mode === 'all' ? 'border-primary' : 'border-border/50')} data-postprocess-mode-all>
                                        <span className="font-semibold">{t('postprocess.modeAll', '전체 적용')}</span>
                                        <span className="mt-0.5 block text-xs text-muted-foreground">{t('postprocess.modeAllHelp', '이 씬의 이미지 {{n}}장 모두 + 앞으로 뽑는 이미지에도 자동으로', { n: sceneImages.length })}</span>
                                    </button>
                                    <button type="button" onClick={() => setMode('some')} className={cn('rounded-lg border-2 p-3 text-left text-sm', mode === 'some' ? 'border-primary' : 'border-border/50')} data-postprocess-mode-some>
                                        <span className="font-semibold">{t('postprocess.modeSome', '일부 적용')}</span>
                                        <span className="mt-0.5 block text-xs text-muted-foreground">{t('postprocess.modeSomeHelp', '아래에서 고른 이미지에만 (지금 {{n}}장)', { n: someTargets.length })}</span>
                                    </button>
                                </div>
                                {mode === 'some' && (
                                    <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
                                        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(7rem, 1fr))' }}>
                                            {sceneImages.map(image => {
                                                const on = checked.has(pathKey(image.url))
                                                return (
                                                    <button key={image.id} type="button" onClick={() => toggle(image.url)} className={cn('relative overflow-hidden rounded-lg border-2', on ? 'border-primary' : 'border-border/50')} data-postprocess-pick>
                                                        <img src={convertFileSrc(image.url)} alt="" loading="lazy" className="aspect-[2/3] w-full object-cover" />
                                                        <span className={cn('absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-white/60 bg-black/40')}>{on && <Check className="h-3.5 w-3.5" />}</span>
                                                        {applied[pathKey(image.url)] && <span className="absolute bottom-1 left-1 rounded bg-primary/85 px-1 text-[10px] font-semibold text-primary-foreground">+후처리 적용중</span>}
                                                        {image.url === path && <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">{t('postprocess.thisImage', '지금 이미지')}</span>}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                                <div className="mt-auto flex justify-end gap-2 pt-3">
                                    <Button variant="outline" onClick={() => setStep('edit')} disabled={busy}>{t('postprocess.backToEdit', '편집으로')}</Button>
                                    <Button onClick={() => void runApply(mode === 'all' ? sceneImages.map(image => image.url) : someTargets, mode === 'all')} disabled={busy || (mode === 'some' && someTargets.length === 0)} data-postprocess-apply-run>
                                        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                                        {mode === 'all' ? t('postprocess.runAll', '전체 적용') : t('postprocess.runSome', '{{n}}장에 적용', { n: someTargets.length })}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 오른쪽: 고른 것 고치기 */}
                    <aside className="w-64 shrink-0 overflow-y-auto border-l border-border/40 p-3 text-xs" data-postprocess-inspector>
                        {selection.type === 'none' ? (
                            <p className="text-muted-foreground">{t('postprocess.inspectorHint', '왼쪽에서 말풍선 · 에셋 · 템플릿을 넣고, 그림판에서 끌어 옮기거나 모서리로 크기 · 회전을 바꾸세요. 고르면 여기서 글자를 고칠 수 있어요.')}</p>
                        ) : selection.type === 'window' ? (
                            <div className="space-y-2" data-postprocess-window-fields>
                                <p className="font-semibold">{selection.name}</p>
                                {WINDOW_FIELDS.map(([key, label, multiline]) => (
                                    <label key={key} className="block space-y-1">
                                        <span className="text-muted-foreground">{t(`postprocess.field.${key}`, label)}</span>
                                        {multiline
                                            ? <textarea value={draft[key] ?? ''} onChange={event => edit(key, event.target.value)} {...textKey(key)} rows={4} className="w-full resize-none rounded-md border border-border/60 bg-transparent p-2 text-xs" data-postprocess-field={key} />
                                            : <Input value={draft[key] ?? ''} onChange={event => edit(key, event.target.value)} {...textKey(key)} className="h-8 text-xs" data-postprocess-field={key} />}
                                    </label>
                                ))}
                            </div>
                        ) : selection.type === 'layer' ? (
                            <p className="text-muted-foreground">{t('postprocess.layerHint', '이 템플릿은 그림판에서 더블클릭하면 문구를 고칠 수 있어요.')}</p>
                        ) : (
                            <div className="space-y-3" data-postprocess-text-fields>
                                <p className="font-semibold">{selection.type === 'asset' ? t('postprocess.asset', '에셋') : t('postprocess.balloon', '말풍선')}</p>
                                {selection.hasText && (
                                    <label className="block space-y-1">
                                        <span className="text-muted-foreground">{t('postprocess.text', '글자')}</span>
                                        <textarea value={draft.text ?? ''} onChange={event => edit('text', event.target.value)} {...textKey('text')} rows={4} className="w-full resize-none rounded-md border border-border/60 bg-transparent p-2 text-sm" data-postprocess-field="text" />
                                    </label>
                                )}
                                {typeof selection.fontSize === 'number' && (
                                    <label className="block space-y-1">
                                        <span className="text-muted-foreground">{t('postprocess.fontSize', '글자 크기')} · {Math.round(selection.fontSize)}</span>
                                        <input type="range" min={10} max={200} value={Math.round(selection.fontSize)} onChange={event => engine && setSelection(engine.update({ fontSize: Number(event.target.value) }))} className="w-full" />
                                    </label>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                    {selection.color && (
                                        <label className="space-y-1"><span className="block text-muted-foreground">{t('postprocess.color', '글자색')}</span>
                                            <input type="color" value={selection.color} onChange={event => engine && setSelection(engine.update({ color: event.target.value }))} className="h-8 w-full rounded" /></label>
                                    )}
                                    {selection.fill && (
                                        <label className="space-y-1"><span className="block text-muted-foreground">{t('postprocess.fill', '바탕색')}</span>
                                            <input type="color" value={selection.fill} onChange={event => engine && setSelection(engine.update({ fill: event.target.value }))} className="h-8 w-full rounded" /></label>
                                    )}
                                </div>
                                <p className="text-[11px] text-muted-foreground">{t('postprocess.dblHint', '그림판에서 더블클릭해도 글자를 바로 고칠 수 있어요.')}</p>
                            </div>
                        )}
                    </aside>
                </div>

                {/* 아래: 저장 · 적용 */}
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
                        <Button variant="outline" onClick={() => void runApply([path], false)} disabled={!bridge || busy} data-postprocess-this>
                            <Save className="mr-1.5 h-4 w-4" />{t('postprocess.onlyThis', '이 이미지만 적용')}
                        </Button>
                        {owner && (
                            <Button onClick={() => setStep('apply')} disabled={!bridge || busy || step === 'apply'} data-postprocess-to-scene>
                                <Wand2 className="mr-1.5 h-4 w-4" />{t('postprocess.toScene', '씬에 적용…')}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
            {managerOpen && <PostprocessTemplateManager open={managerOpen} onOpenChange={setManagerOpen} />}
        </div>
    )
}
