import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { WandSparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useSceneStore } from '@/stores/scene-store'
import { useSettingsStore } from '@/stores/settings-store'
import { startFolderI2iToScenes } from '@/services/scene-ref-i2i-cycle'
import { SCENE_I2I_MAX_STRENGTH, SCENE_I2I_MIN_STRENGTH, clampSceneI2iStrength } from '@/lib/scene-i2i-cycle'

interface CensorI2iDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    folderName: string
    /** 지금 폴더의 이미지 (화면에 보이는 순서 = 이름순) */
    imagePaths: string[]
}

/**
 * 검열 탭 "씬으로 I2I": 폴더 이미지를 고른 작품의 씬에 순서대로 짝지어(1번 이미지 ↔ 1번 씬 …)
 * 그 씬의 프롬프트로 I2I를 돌린다. 결과는 각 씬에 새 이미지로 저장된다.
 */
export function CensorI2iDialog({ open, onOpenChange, folderName, imagePaths }: CensorI2iDialogProps) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const allPresets = useSceneStore(state => state.presets)
    const sceneGenerating = useSceneStore(state => state.isGenerating)
    const strength = useSettingsStore(state => state.sceneRefI2iStrength)
    const setCycle = useSettingsStore(state => state.setSceneRefI2iCycle)
    const presets = useMemo(() => allPresets.filter(preset => !preset.characterAsset?.reservation && preset.scenes.length > 0), [allPresets])
    const [presetId, setPresetId] = useState<string | null>(null)
    const selected = presets.find(preset => preset.id === presetId) ?? null
    const count = selected ? Math.min(selected.scenes.length, imagePaths.length) : 0

    const start = () => {
        if (!selected) return
        const { outcome, count: started } = startFolderI2iToScenes(selected.id, imagePaths)
        if (outcome === 'started') {
            toast({
                title: t('censorI2i.started', 'I2I를 시작했어요 ({{n}}장)', { n: started }),
                description: t('censorI2i.startedBody', '결과는 씬 모드 "{{name}}"의 각 씬에 들어갑니다.', { name: selected.name }),
                variant: 'success',
            })
            onOpenChange(false)
        } else if (outcome === 'queued') {
            toast({ title: t('censorI2i.queued', '그 작품에 예약된 씬이 남아 있습니다'), description: t('censorI2i.queuedHelp', '씬 모드에서 예약을 비우거나 먼저 생성한 뒤 다시 눌러 주세요.'), variant: 'destructive' })
        } else if (outcome === 'busy') {
            toast({ title: t('censorI2i.busy', '다른 생성이 진행 중입니다'), variant: 'destructive' })
        } else {
            toast({ title: t('censorI2i.empty', '짝지을 이미지나 씬이 없습니다') })
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg" data-censor-i2i>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><WandSparkles className="h-5 w-5 text-primary" />{t('censorI2i.title', '씬으로 I2I')}</DialogTitle>
                    <DialogDescription>
                        {t('censorI2i.desc', '"{{folder}}"의 이미지를 고른 작품의 씬에 순서대로 짝지어(1번 이미지 ↔ 1번 씬 …) 그 씬의 프롬프트로 I2I를 한 장씩 만듭니다. 캐릭터 레퍼런스는 쓰지 않습니다.', { folder: folderName })}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid max-h-72 gap-1.5 overflow-y-auto pr-1">
                    {presets.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('censorI2i.noPresets', '씬 모드에 씬이 있는 작품이 없습니다.')}</p>}
                    {presets.map(preset => (
                        <button
                            key={preset.id}
                            type="button"
                            data-censor-i2i-preset
                            onClick={() => setPresetId(preset.id)}
                            className={cn(
                                'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                                preset.id === presetId ? 'border-primary bg-primary/10' : 'border-border/60 hover:bg-muted/50',
                            )}
                        >
                            <span className="min-w-0 truncate">{preset.id === 'scene-default' ? t('scene.presetDefault', '기본') : preset.name}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t('censorI2i.sceneCount', '씬 {{n}}개', { n: preset.scenes.length })}</span>
                        </button>
                    ))}
                </div>

                {selected && (
                    <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs" data-censor-i2i-summary>
                        <p>
                            {t('censorI2i.summary', '이미지 {{images}}장 ↔ 씬 {{scenes}}개 → I2I {{n}}장', { images: imagePaths.length, scenes: selected.scenes.length, n: count })}
                        </p>
                        {imagePaths.length !== selected.scenes.length && (
                            <p className="text-amber-500">{t('censorI2i.mismatch', '개수가 달라서 앞에서부터 {{n}}개만 짝짓습니다.', { n: count })}</p>
                        )}
                        <label className="flex items-center gap-2">
                            <span className="w-24 shrink-0 font-medium">{t('sceneI2iCycle.strength', 'i2i 변화 강도')}</span>
                            <input
                                type="range"
                                min={SCENE_I2I_MIN_STRENGTH}
                                max={SCENE_I2I_MAX_STRENGTH}
                                step={0.01}
                                value={strength}
                                onChange={event => setCycle({ sceneRefI2iStrength: clampSceneI2iStrength(Number(event.target.value)) })}
                                className="flex-1"
                            />
                            <span className="w-10 tabular-nums text-muted-foreground">{strength.toFixed(2)}</span>
                        </label>
                    </div>
                )}

                <DialogFooter className="gap-2 sm:justify-between">
                    <Button variant="outline" onClick={() => { onOpenChange(false); navigate('/scenes') }} disabled={!sceneGenerating}>
                        {t('censorI2i.watch', '씬 모드에서 진행 보기')}
                    </Button>
                    <Button onClick={start} disabled={!selected || count === 0 || sceneGenerating} data-censor-i2i-start>
                        <WandSparkles className="mr-1.5 h-4 w-4" />
                        {t('censorI2i.start', 'I2I 시작 ({{n}}장)', { n: count })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
