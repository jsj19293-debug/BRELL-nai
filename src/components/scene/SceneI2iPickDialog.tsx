import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { convertFileSrc } from '@tauri-apps/api/core'
import { Check, ListChecks, WandSparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useSceneStore } from '@/stores/scene-store'
import { useSettingsStore } from '@/stores/settings-store'
import { startSceneI2iConvert } from '@/services/scene-ref-i2i-cycle'
import { SCENE_I2I_MAX_STRENGTH, SCENE_I2I_MIN_STRENGTH, clampSceneI2iStrength, latestImagePerScene } from '@/lib/scene-i2i-cycle'

/**
 * "씬 골라 I2I": 지금 작품의 씬을 체크해서, 체크한 씬만 가장 최근 이미지 1장씩 I2I로 변형한다.
 */
export function SceneI2iPickDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const { t } = useTranslation()
    const activePresetId = useSceneStore(state => state.activePresetId)
    const preset = useSceneStore(state => state.presets.find(candidate => candidate.id === state.activePresetId))
    const strength = useSettingsStore(state => state.sceneRefI2iStrength)
    const setCycle = useSettingsStore(state => state.setSceneRefI2iCycle)
    const [checked, setChecked] = useState<Set<string>>(new Set())
    const [search, setSearch] = useState('')

    /** 씬마다 가장 최근 이미지 (없는 씬은 고를 수 없다) */
    const latest = useMemo(() => new Map((preset ? latestImagePerScene(preset.scenes) : []).map(pick => [pick.sceneId, pick.path])), [preset])
    const scenes = useMemo(() => {
        const needle = search.trim().toLowerCase()
        return (preset?.scenes ?? []).filter(scene => !needle || scene.name.toLowerCase().includes(needle))
    }, [preset, search])

    useEffect(() => {
        if (open) { setChecked(new Set()); setSearch('') }
    }, [open, activePresetId])

    const toggle = (id: string) => setChecked(current => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })
    const selectableVisible = scenes.filter(scene => latest.has(scene.id)).map(scene => scene.id)
    const allVisibleChecked = selectableVisible.length > 0 && selectableVisible.every(id => checked.has(id))

    const start = () => {
        if (!activePresetId || checked.size === 0) return
        const outcome = startSceneI2iConvert(activePresetId, [...checked])
        if (outcome === 'started') {
            toast({ title: t('sceneI2iPick.started', '고른 씬 {{n}}개를 I2I로 변형합니다', { n: checked.size }), variant: 'success' })
            onOpenChange(false)
        } else if (outcome === 'queued') {
            toast({ title: t('sceneI2iCycle.convertQueued', '예약된 씬이 남아 있습니다'), description: t('sceneI2iCycle.convertQueuedHelp', '예약을 먼저 생성하거나 비운 뒤에 눌러 주세요.'), variant: 'destructive' })
        } else if (outcome === 'busy') {
            toast({ title: t('sceneI2iCycle.convertBusy', '다른 생성이 진행 중입니다'), variant: 'destructive' })
        } else {
            toast({ title: t('sceneI2iCycle.convertEmpty', '변형할 이미지가 없습니다') })
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl" data-scene-i2i-pick>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-primary" />{t('sceneI2iPick.title', '씬 골라 I2I')}</DialogTitle>
                    <DialogDescription>
                        {t('sceneI2iPick.desc', '체크한 씬만, 씬마다 가장 최근 이미지 1장을 원본으로 I2I를 한 장씩 만듭니다. 캐릭터 레퍼런스는 쓰지 않고, 원본은 그대로 둔 채 같은 씬에 새 이미지로 추가됩니다.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap items-center gap-2">
                    <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('scene.searchByName', '씬 이름 검색')} className="h-8 w-48" />
                    <Button variant="outline" size="sm" className="h-8" disabled={selectableVisible.length === 0} onClick={() => setChecked(current => {
                        const next = new Set(current)
                        if (allVisibleChecked) selectableVisible.forEach(id => next.delete(id))
                        else selectableVisible.forEach(id => next.add(id))
                        return next
                    })} data-scene-i2i-pick-all>
                        {allVisibleChecked ? t('sceneI2iPick.none', '보이는 것 모두 해제') : t('sceneI2iPick.all', '보이는 것 모두 선택')}
                    </Button>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground" data-scene-i2i-pick-count>
                        {t('sceneI2iPick.count', '{{n}}개 선택', { n: checked.size })}
                    </span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(7.5rem, 1fr))' }}>
                        {scenes.map(scene => {
                            const path = latest.get(scene.id)
                            const isChecked = checked.has(scene.id)
                            const index = (preset?.scenes ?? []).indexOf(scene)
                            return (
                                <button
                                    key={scene.id}
                                    type="button"
                                    disabled={!path}
                                    onClick={() => toggle(scene.id)}
                                    data-scene-i2i-pick-item
                                    className={cn(
                                        'relative overflow-hidden rounded-lg border-2 bg-muted/30 text-left transition-colors',
                                        isChecked ? 'border-primary' : 'border-border/50 hover:border-primary/50',
                                        !path && 'cursor-not-allowed opacity-40',
                                    )}
                                    title={path ? scene.name : t('sceneI2iPick.noImage', '이미지가 없는 씬')}
                                >
                                    {path
                                        ? <img src={convertFileSrc(path)} alt="" loading="lazy" decoding="async" className="aspect-[2/3] w-full object-cover" />
                                        : <span className="flex aspect-[2/3] items-center justify-center text-[11px] text-muted-foreground">{t('sceneI2iPick.noImage', '이미지 없음')}</span>}
                                    <span className={cn('absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded border', isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-white/60 bg-black/40')}>
                                        {isChecked && <Check className="h-3.5 w-3.5" />}
                                    </span>
                                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] tabular-nums text-white">{index + 1}</span>
                                    <span className="block truncate px-1.5 py-1 text-[11px]">{scene.name}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                <DialogFooter className="flex-wrap items-center gap-3 sm:justify-between">
                    <label className="flex items-center gap-2 text-xs">
                        <span className="font-medium">{t('sceneI2iCycle.strength', 'i2i 변화 강도')}</span>
                        <input
                            type="range"
                            min={SCENE_I2I_MIN_STRENGTH}
                            max={SCENE_I2I_MAX_STRENGTH}
                            step={0.01}
                            value={strength}
                            onChange={event => setCycle({ sceneRefI2iStrength: clampSceneI2iStrength(Number(event.target.value)) })}
                            className="w-40"
                        />
                        <span className="w-10 tabular-nums text-muted-foreground">{strength.toFixed(2)}</span>
                    </label>
                    <Button onClick={start} disabled={checked.size === 0} data-scene-i2i-pick-start>
                        <WandSparkles className="mr-1.5 h-4 w-4" />
                        {t('sceneI2iPick.start', '선택한 {{n}}개 I2I 시작', { n: checked.size })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
