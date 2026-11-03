import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { join } from '@tauri-apps/api/path'
import { exists, mkdir, writeFile } from '@tauri-apps/plugin-fs'
import { ArrowLeft, BookmarkPlus, Layers, Loader2, RefreshCw, Save, Settings2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tip } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import { usePostprocessStore } from '@/stores/postprocess-store'
import { BALLOON_STUDIO_URL, dataUrlToBytes, fileToDataUrl, thumbnailOf, waitForBridge, type BalloonBridge } from '@/services/postprocess-render'
import { POSTPROCESS_FOLDER_NAME, postprocessFileName, sameAspect } from '@/lib/postprocess'
import { PostprocessTemplateManager } from '@/components/postprocess/PostprocessTemplateManager'

export interface PostprocessTarget {
    /** 편집할 그림 파일 (검열본이 있으면 검열본) */
    path: string
    /** 화면에 보여 줄 이름 ("2 - 웃음/a.png") */
    name: string
    /** 결과를 저장할 폴더의 기준 (검열 탭에서 연 폴더). 그 안의 후처리/<하위폴더> 에 저장한다. */
    baseFolder: string
}

/**
 * 검열 탭 → 후처리: 말풍선 공방을 띄워 지금 이미지에 말풍선 · 대사 · 효과를 넣고,
 * 그 구성을 템플릿으로 저장하거나 저장해 둔 템플릿을 입힌다.
 */
export function PostprocessPanel({ target, onClose }: { target: PostprocessTarget | null; onClose: () => void }) {
    const { t } = useTranslation()
    const frameRef = useRef<HTMLIFrameElement>(null)
    const [bridge, setBridge] = useState<BalloonBridge | null>(null)
    const [loadingImage, setLoadingImage] = useState(false)
    const [saving, setSaving] = useState(false)
    const [templateName, setTemplateName] = useState('')
    const [pickedTemplate, setPickedTemplate] = useState('')
    const [managerOpen, setManagerOpen] = useState(false)
    const templates = usePostprocessStore(state => state.templates)
    const addTemplate = usePostprocessStore(state => state.addTemplate)

    useEffect(() => {
        const frame = frameRef.current
        if (!frame) return
        let cancelled = false
        waitForBridge(frame).then(found => { if (!cancelled) setBridge(found) }).catch(error => {
            if (!cancelled) toast({ title: t('postprocess.loadFailed', '말풍선 공방을 불러오지 못했어요'), description: String(error), variant: 'destructive' })
        })
        return () => { cancelled = true }
    }, [t])

    const loadTarget = useCallback(async () => {
        if (!bridge || !target) return
        setLoadingImage(true)
        try {
            await bridge.openImage(await fileToDataUrl(target.path), target.name.replace(/\.[a-z0-9]+$/i, ''))
        } catch (error) {
            toast({ title: t('postprocess.openFailed', '이미지를 열지 못했어요'), description: String(error), variant: 'destructive' })
        } finally {
            setLoadingImage(false)
        }
    }, [bridge, target, t])

    // 다리가 준비되거나 고른 이미지가 바뀌면 그 이미지를 연다.
    useEffect(() => { void loadTarget() }, [loadTarget])

    const saveResult = async () => {
        if (!bridge || !target) return
        setSaving(true)
        try {
            const png = await bridge.exportPNG()
            const parts = target.name.split('/')
            const fileName = postprocessFileName(parts.pop() || 'image')
            const folder = await join(target.baseFolder, POSTPROCESS_FOLDER_NAME, ...parts)
            if (!(await exists(folder))) await mkdir(folder, { recursive: true })
            const outPath = await join(folder, fileName)
            await writeFile(outPath, dataUrlToBytes(png))
            toast({ title: t('postprocess.saved', '후처리 결과를 저장했어요'), description: outPath, variant: 'success' })
        } catch (error) {
            toast({ title: t('postprocess.saveFailed', '저장하지 못했어요'), description: String(error), variant: 'destructive' })
        } finally {
            setSaving(false)
        }
    }

    const saveTemplate = async () => {
        if (!bridge) return
        try {
            const doc = bridge.templateDoc()
            const size = bridge.size()
            const thumbnail = await thumbnailOf(await bridge.exportPNG())
            const id = addTemplate({ name: templateName, doc, width: size.width, height: size.height, thumbnail })
            const saved = usePostprocessStore.getState().templates.find(item => item.id === id)
            setTemplateName('')
            setPickedTemplate(id)
            toast({ title: t('postprocess.templateSaved', '템플릿 "{{name}}"을 저장했어요', { name: saved?.name ?? '' }), description: t('postprocess.templateSavedHelp', '씬 카드를 오른쪽 클릭 → 후처리 적용하기에서 고를 수 있어요.'), variant: 'success' })
        } catch (error) {
            toast({ title: t('postprocess.templateFailed', '템플릿을 저장하지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    const applyPicked = async () => {
        const template = templates.find(item => item.id === pickedTemplate)
        if (!bridge || !template) return
        const size = bridge.size()
        if (size.hasImage && !sameAspect(template, size)) {
            toast({ title: t('postprocess.aspect', '이미지와 템플릿의 가로세로 비율이 달라요'), description: t('postprocess.aspectHelp', '템플릿 {{tw}}×{{th}} · 이미지 {{iw}}×{{ih}}. 그래도 입히면 템플릿 크기에 맞춰집니다.', { tw: template.width, th: template.height, iw: size.width, ih: size.height }) })
        }
        try {
            await bridge.applyTemplate(template.doc)
        } catch (error) {
            toast({ title: t('postprocess.applyFailed', '템플릿을 입히지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-postprocess-panel>
            <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-3 py-2">
                <Button variant="outline" size="sm" className="h-8" onClick={onClose}>
                    <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                    {t('postprocess.back', '검열로')}
                </Button>
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Wand2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate" title={target?.path}>{target ? target.name : t('postprocess.noImage', '이미지 없이 열림')}</span>
                </span>
                {target && (
                    <Tip content={t('postprocess.reloadTip', '이 이미지를 다시 불러오기 (말풍선 등은 그대로)')}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void loadTarget()} disabled={!bridge || loadingImage}>
                            <RefreshCw className={loadingImage ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                        </Button>
                    </Tip>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5">
                        <select
                            value={pickedTemplate}
                            onChange={event => setPickedTemplate(event.target.value)}
                            className="h-7 max-w-[11rem] rounded-md bg-transparent px-1.5 text-xs outline-none"
                            data-postprocess-template-select
                        >
                            <option value="">{templates.length > 0 ? t('postprocess.pickTemplate', '템플릿 고르기') : t('postprocess.noTemplates', '저장한 템플릿 없음')}</option>
                            {templates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                        </select>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void applyPicked()} disabled={!bridge || !pickedTemplate} data-postprocess-apply>
                            <Layers className="mr-1 h-3.5 w-3.5" />
                            {t('postprocess.apply', '입히기')}
                        </Button>
                        <Tip content={t('postprocess.manage', '템플릿 관리 (이름 바꾸기 · 지우기)')}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setManagerOpen(true)} disabled={templates.length === 0}>
                                <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                        </Tip>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5">
                        <Input
                            value={templateName}
                            onChange={event => setTemplateName(event.target.value)}
                            placeholder={t('postprocess.templateName', '템플릿 이름')}
                            className="h-7 w-32 border-0 text-xs focus-visible:ring-0"
                            data-postprocess-template-name
                        />
                        <Tip content={t('postprocess.saveTemplateTip', '지금 구성(말풍선 · 대사 · 스티커 · 효과)을 템플릿으로 저장. 그림은 저장하지 않아요.')}>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void saveTemplate()} disabled={!bridge} data-postprocess-save-template>
                                <BookmarkPlus className="mr-1 h-3.5 w-3.5" />
                                {t('postprocess.saveTemplate', '템플릿 저장')}
                            </Button>
                        </Tip>
                    </div>
                    <Tip content={t('postprocess.saveTip', '검열 폴더 안 "후처리" 폴더에 PNG로 저장 (원본은 그대로)')}>
                        <Button size="sm" className="h-8" onClick={() => void saveResult()} disabled={!bridge || !target || saving} data-postprocess-save>
                            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                            {t('postprocess.save', '결과 저장')}
                        </Button>
                    </Tip>
                </div>
            </div>
            <div className="relative min-h-0 flex-1">
                {!bridge && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-background/70 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('postprocess.loading', '말풍선 공방을 여는 중…')}
                    </div>
                )}
                <iframe ref={frameRef} src={BALLOON_STUDIO_URL} title="말풍선 공방" className="h-full w-full border-0" data-postprocess-frame />
            </div>
            {managerOpen && <PostprocessTemplateManager open={managerOpen} onOpenChange={setManagerOpen} />}
        </div>
    )
}
