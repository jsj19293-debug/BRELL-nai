import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Check, Loader2, Wand2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { usePostprocessStore } from '@/stores/postprocess-store'
import { useSceneStore } from '@/stores/scene-store'
import { postprocessExistingSceneImages, sceneTemplateFor } from '@/services/postprocess-render'

/**
 * 씬 카드 오른쪽 클릭 → 후처리 적용하기.
 * 템플릿을 고르면 이 씬에서 이미지를 뽑을 때마다 마지막에 자동으로 입혀 씬 폴더/후처리 에 저장한다 (원본은 그대로).
 */
export function ScenePostprocessDialog({ open, onOpenChange, presetId, sceneId, sceneName }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    presetId: string
    sceneId: string
    sceneName: string
}) {
    const { t } = useTranslation()
    const templates = usePostprocessStore(state => state.templates)
    const own = usePostprocessStore(state => state.sceneTemplates[presetId]?.[sceneId] ?? null)
    const setSceneTemplate = usePostprocessStore(state => state.setSceneTemplate)
    const inherited = own ? null : sceneTemplateFor(presetId, sceneId)
    const [picked, setPicked] = useState<string | null>(own ?? inherited)
    const [applyExisting, setApplyExisting] = useState(false)
    const [running, setRunning] = useState(false)
    const imageCount = useSceneStore(state => state.presets.find(preset => preset.id === presetId)?.scenes.find(scene => scene.id === sceneId)?.images.filter(image => !image.url.startsWith('data:')).length ?? 0)

    const save = async () => {
        setSceneTemplate(presetId, sceneId, picked)
        const name = templates.find(template => template.id === picked)?.name
        if (!picked || !applyExisting || imageCount === 0) {
            toast({
                title: picked ? t('scenePost.set', '"{{scene}}"에 후처리 "{{name}}" 지정', { scene: sceneName, name }) : t('scenePost.cleared', '"{{scene}}" 후처리 해제', { scene: sceneName }),
                description: picked ? t('scenePost.setHelp', '이제 이 씬에서 뽑는 이미지는 마지막에 자동으로 입혀져 씬 폴더 안 "후처리" 폴더에 저장돼요.') : undefined,
                variant: 'success',
            })
            onOpenChange(false)
            return
        }
        setRunning(true)
        try {
            const result = await postprocessExistingSceneImages(presetId, sceneId, picked)
            toast({
                title: t('scenePost.appliedExisting', '"{{scene}}"에 "{{name}}" 지정 · 기존 이미지 {{n}}장에 입혔어요', { scene: sceneName, name, n: result.done }),
                description: result.skipped > 0 ? t('scenePost.skipped', '{{n}}장은 입히지 못했어요 (비율이 다르거나 파일이 없음).', { n: result.skipped }) : undefined,
                variant: result.skipped > 0 ? 'destructive' : 'success',
            })
            onOpenChange(false)
        } finally {
            setRunning(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(next: boolean) => { if (!running) onOpenChange(next) }}>
            <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl" data-scene-postprocess>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-primary" />{t('scenePost.title', '후처리 적용하기 · {{scene}}', { scene: sceneName })}</DialogTitle>
                    <DialogDescription>
                        {t('scenePost.desc', '고른 템플릿이 이 씬에서 뽑는 이미지에 마지막 단계로 자동으로 입혀집니다. 결과는 씬 폴더 안 "후처리" 폴더에 PNG로 저장되고 원본은 그대로예요.')}
                    </DialogDescription>
                </DialogHeader>

                {templates.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground" data-scene-postprocess-empty>
                        {t('scenePost.noTemplates', '저장한 템플릿이 없어요. 검열 탭 → 후처리에서 말풍선 등을 넣고 "템플릿 저장"을 누르면 여기서 고를 수 있어요.')}
                    </p>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(8rem, 1fr))' }}>
                            <button
                                type="button"
                                onClick={() => setPicked(null)}
                                className={cn('flex aspect-[2/3] flex-col items-center justify-center gap-2 rounded-lg border-2 text-xs text-muted-foreground', picked === null ? 'border-primary' : 'border-border/50 hover:border-primary/50')}
                                data-scene-postprocess-none
                            >
                                <Ban className="h-6 w-6" />
                                {t('scenePost.none', '사용 안 함')}
                            </button>
                            {templates.map(template => (
                                <button
                                    key={template.id}
                                    type="button"
                                    onClick={() => setPicked(template.id)}
                                    className={cn('relative overflow-hidden rounded-lg border-2 text-left', picked === template.id ? 'border-primary' : 'border-border/50 hover:border-primary/50')}
                                    data-scene-postprocess-template
                                >
                                    {template.thumbnail
                                        ? <img src={template.thumbnail} alt="" className="aspect-[2/3] w-full object-cover" />
                                        : <div className="aspect-[2/3] w-full bg-muted" />}
                                    {picked === template.id && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded bg-primary text-primary-foreground"><Check className="h-3.5 w-3.5" /></span>}
                                    <span className="block truncate px-1.5 py-1 text-[11px]">{template.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {inherited && !own && (
                    <p className="text-[11px] text-muted-foreground">{t('scenePost.inherited', '지금은 원본 작품의 같은 씬 지정을 이어받고 있어요.')}</p>
                )}
                {picked && imageCount > 0 && (
                    <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={applyExisting} onChange={event => setApplyExisting(event.target.checked)} disabled={running} data-scene-postprocess-existing />
                        {t('scenePost.existing', '이 씬에 이미 있는 이미지 {{n}}장에도 지금 바로 입히기', { n: imageCount })}
                    </label>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>{t('common.cancel', '취소')}</Button>
                    <Button onClick={() => void save()} disabled={running} data-scene-postprocess-save>
                        {running && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                        {t('scenePost.save', '적용')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
