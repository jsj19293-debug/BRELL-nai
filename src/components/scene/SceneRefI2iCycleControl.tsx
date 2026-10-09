// 씬 모드 도구 모음: "레퍼런스 → i2i" 자동 싸이클 스위치와 설정.
import { useTranslation } from 'react-i18next'
import { Repeat2, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Tip } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSettingsStore } from '@/stores/settings-store'
import { useSceneI2iCycleStatus } from '@/services/scene-ref-i2i-cycle'
import { SCENE_I2I_MAX_STRENGTH, SCENE_I2I_MIN_STRENGTH } from '@/lib/scene-i2i-cycle'

export function SceneRefI2iCycleControl({ isGenerating }: { isGenerating: boolean }) {
    const { t } = useTranslation()
    const enabled = useSettingsStore(state => state.sceneRefI2iCycleEnabled)
    const strength = useSettingsStore(state => state.sceneRefI2iStrength)
    const noise = useSettingsStore(state => state.sceneRefI2iNoise)
    const disableVibes = useSettingsStore(state => state.sceneRefI2iDisableVibes)
    const setCycle = useSettingsStore(state => state.setSceneRefI2iCycle)
    const phase = useSceneI2iCycleStatus(state => state.phase)
    const done = useSceneI2iCycleStatus(state => state.done)
    const total = useSceneI2iCycleStatus(state => state.total)

    const running = isGenerating && phase !== 'idle'
    const status = !running
        ? null
        : phase === 'first'
            ? t('sceneI2iCycle.phaseFirst', '1단계 · 레퍼런스')
            : t('sceneI2iCycle.phaseSecond', '2단계 · i2i {{done}}/{{total}}', { done, total })

    return (
        <Tip content={t('sceneI2iCycle.tooltip', '레퍼런스로 전체 생성 → 끝나면 레퍼런스를 끄고 각 이미지를 i2i로 한 번 더 생성')}>
            <div className={cn(
                'flex items-center gap-2 rounded-xl border border-white/10 px-2 h-10 bg-white/5',
                enabled && 'border-primary/40 bg-primary/10',
            )}>
                <Repeat2 className={cn('h-4 w-4', enabled ? 'text-primary' : 'text-muted-foreground')} />
                {status && <span className="whitespace-nowrap text-xs font-medium tabular-nums text-primary">{status}</span>}
                <Switch
                    checked={enabled}
                    onChange={event => setCycle({ sceneRefI2iCycleEnabled: event.target.checked })}
                    disabled={isGenerating}
                    aria-label={t('sceneI2iCycle.toggle', '레퍼런스 → i2i 자동 싸이클')}
                />
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={isGenerating}
                            aria-label={t('sceneI2iCycle.settings', '싸이클 설정')}
                        >
                            <SlidersHorizontal className="h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80 space-y-4">
                        <div>
                            <p className="text-sm font-semibold">{t('sceneI2iCycle.title', '레퍼런스 → i2i 자동 싸이클')}</p>
                            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
                                <li>{t('sceneI2iCycle.step1', '예약된 씬을 지금 설정(캐릭터 레퍼런스 포함)으로 모두 생성')}</li>
                                <li>{t('sceneI2iCycle.step2', '레퍼런스를 빼고, 방금 나온 이미지마다 i2i로 한 장씩 더 생성')}</li>
                                <li>{t('sceneI2iCycle.step3', '씬마다 1단계 이미지와 i2i 이미지가 둘 다 남고 싸이클 종료')}</li>
                            </ol>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span>{t('sceneI2iCycle.strength', 'i2i 변화 강도')}</span>
                                <span className="tabular-nums text-muted-foreground">{strength.toFixed(2)}</span>
                            </div>
                            <Slider
                                value={[strength]}
                                onValueChange={([value]: number[]) => setCycle({ sceneRefI2iStrength: value })}
                                min={SCENE_I2I_MIN_STRENGTH}
                                max={SCENE_I2I_MAX_STRENGTH}
                                step={0.01}
                                className="w-full"
                            />
                            <div className="flex gap-1.5">
                                {[0.55, 0.58, 0.6].map(preset => (
                                    <Button
                                        key={preset}
                                        type="button"
                                        size="sm"
                                        variant={Math.abs(strength - preset) < 0.005 ? 'default' : 'outline'}
                                        className="h-7 flex-1 px-0 text-xs"
                                        onClick={() => setCycle({ sceneRefI2iStrength: preset })}
                                    >
                                        {preset.toFixed(2)}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span>{t('sceneI2iCycle.noise', '노이즈')}</span>
                                <span className="tabular-nums text-muted-foreground">{noise.toFixed(2)}</span>
                            </div>
                            <Slider
                                value={[noise]}
                                onValueChange={([value]: number[]) => setCycle({ sceneRefI2iNoise: value })}
                                min={0}
                                max={0.99}
                                step={0.01}
                                className="w-full"
                            />
                        </div>
                        <label className="flex items-center justify-between gap-3 text-sm">
                            <span>
                                {t('sceneI2iCycle.disableVibes', '2단계에서 바이브 트랜스퍼도 끄기')}
                                <span className="block text-xs text-muted-foreground">
                                    {t('sceneI2iCycle.disableVibesHelp', '캐릭터 레퍼런스는 2단계에서 항상 빠집니다.')}
                                </span>
                            </span>
                            <Switch
                                checked={disableVibes}
                                onChange={event => setCycle({ sceneRefI2iDisableVibes: event.target.checked })}
                            />
                        </label>
                        <p className="text-xs text-muted-foreground">
                            {t('sceneI2iCycle.note', '2단계는 1단계와 같은 시드·프롬프트·캐릭터를 씁니다. 레퍼런스 켜짐 상태는 바꾸지 않아서, 끝나면 그대로 다음 작업을 할 수 있어요. 생성 횟수가 두 배가 됩니다.')}
                        </p>
                    </PopoverContent>
                </Popover>
            </div>
        </Tip>
    )
}
