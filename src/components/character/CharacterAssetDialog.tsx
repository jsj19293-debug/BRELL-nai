import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useCharacterPromptStore } from '@/stores/character-prompt-store'
import { useCharacterStore } from '@/stores/character-store'
import { useSceneStore } from '@/stores/scene-store'
import { Switch } from '@/components/ui/switch'
import {
    CHARACTER_ASSET_MAX_QUEUE, assetCharacterName, characterAssetProgress, clampAssetQueueCount, progressPercent,
} from '@/lib/character-asset-presets'

interface CharacterAssetDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const rowClass = (checked: boolean) => cn(
    'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
    checked ? 'border-primary bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted/50',
)

function CheckMark({ checked }: { checked: boolean }) {
    return (
        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
            {checked && <Check className="h-3 w-3" />}
        </span>
    )
}

const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
}

/**
 * 캐릭터 에셋 뽑기: 캐릭터를 고르고, 레퍼런스를 넣을지 정하고, 어떤 씬 묶음(작품)을 쓸지 고르면
 * "캐릭터 이름 - 작품 이름" 캐릭터씬이 만들어진다. 그 안의 씬은 원본 작품의 씬 전체를 복제한 것이다.
 */
export function CharacterAssetDialog({ open, onOpenChange }: CharacterAssetDialogProps) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const characters = useCharacterPromptStore(state => state.characters)
    const references = useCharacterStore(state => state.characterImages)
    const presets = useSceneStore(state => state.presets)
    const activePresetId = useSceneStore(state => state.activePresetId)
    const createCharacterAssetPresets = useSceneStore(state => state.createCharacterAssetPresets)
    const setActivePreset = useSceneStore(state => state.setActivePreset)

    // 복제할 수 있는 것은 원본 작품뿐이다 (캐릭터씬을 다시 복제하지 않는다).
    const sourcePresets = useMemo(() => presets.filter(preset => !preset.characterAsset), [presets])
    const [characterIds, setCharacterIds] = useState<Set<string>>(new Set())
    const [presetIds, setPresetIds] = useState<Set<string>>(new Set())
    const [useReference, setUseReference] = useState(true)
    const [referenceIds, setReferenceIds] = useState<Set<string>>(new Set())
    const [queueCount, setQueueCount] = useState(1)
    const [i2iCycle, setI2iCycle] = useState(false)
    const [tab, setTab] = useState<'create' | 'progress'>('create')
    const progress = useMemo(() => characterAssetProgress(presets), [presets])

    // 열 때: 지금 켜져 있는 캐릭터 · 레퍼런스와, 보고 있는 작품을 미리 골라 둔다.
    useEffect(() => {
        if (!open) return
        const state = useSceneStore.getState()
        const active = state.presets.find(preset => preset.id === state.activePresetId)
        const sourceId = active?.characterAsset?.parentPresetId ?? active?.id
        setCharacterIds(new Set(useCharacterPromptStore.getState().characters.filter(character => character.enabled).map(character => character.id)))
        setPresetIds(new Set(sourceId && state.presets.some(preset => preset.id === sourceId && !preset.characterAsset) ? [sourceId] : []))
        const enabledReferences = useCharacterStore.getState().characterImages.filter(image => image.enabled !== false).map(image => image.id)
        setReferenceIds(new Set(enabledReferences))
        setUseReference(enabledReferences.length > 0)
        setQueueCount(1)
        setI2iCycle(false)
        setTab('create')
    }, [open])

    const chosenCharacters = characters
        .map((character, index) => ({ id: character.id, name: assetCharacterName(character.name, index) }))
        .filter(character => characterIds.has(character.id))
    const chosenPresets = sourcePresets.filter(preset => presetIds.has(preset.id))
    const sceneTotal = chosenPresets.reduce((sum, preset) => sum + preset.scenes.length, 0)
    const willCreate = chosenCharacters.length * chosenPresets.length
    const needsReference = useReference && referenceIds.size === 0 && references.length > 0

    const handleCreate = () => {
        if (willCreate === 0) return
        const result = createCharacterAssetPresets(
            chosenPresets.map(preset => preset.id),
            chosenCharacters,
            { referenceIds: useReference ? [...referenceIds] : [], queueCount, i2iCycle },
        )
        if (result.createdIds.length === 0) {
            toast({
                title: t('characterAsset.nothing', '새로 만든 캐릭터씬이 없습니다'),
                description: result.skipped.length > 0 ? t('characterAsset.skipped', '이미 있음: {{names}}', { names: result.skipped.join(', ') }) : undefined,
            })
            return
        }
        toast({
            title: t('characterAsset.created', '캐릭터씬 {{n}}개를 만들었어요', { n: result.createdIds.length }),
            description: result.skipped.length > 0 ? t('characterAsset.skipped', '이미 있음: {{names}}', { names: result.skipped.join(', ') }) : undefined,
            variant: 'success',
        })
        setActivePreset(result.createdIds[0])
        onOpenChange(false)
        navigate('/scenes')
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t('characterAsset.title', '캐릭터 에셋 뽑기')}</DialogTitle>
                    <DialogDescription>
                        {t('characterAsset.desc', '고른 작품의 씬 전체를 캐릭터 이름으로 복제합니다. 복제된 씬은 그 캐릭터로만 생성되고, 원본 작품은 그대로 남아요.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex gap-1">
                    {(['create', 'progress'] as const).map(value => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={tab === value}
                            onClick={() => setTab(value)}
                            className={cn(
                                'h-8 rounded-lg px-3 text-sm transition-colors',
                                tab === value ? 'bg-primary/15 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                            )}
                        >
                            {value === 'create'
                                ? t('characterAsset.tabCreate', '새로 만들기')
                                : t('characterAsset.tabProgress', '진행표 ({{n}})', { n: progress.reduce((sum, group) => sum + group.rows.length, 0) })}
                        </button>
                    ))}
                </div>

                {tab === 'progress' && (
                    <div className="grid max-h-[60vh] gap-3 overflow-y-auto py-1 pr-1" data-asset-progress>
                        {progress.length === 0 && (
                            <p className="py-10 text-center text-sm text-muted-foreground">{t('characterAsset.noProgress', '아직 만든 캐릭터씬이 없습니다.')}</p>
                        )}
                        {progress.map(group => (
                            <section key={group.characterPromptId} className="rounded-xl border border-border/60 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <h3 className="truncate text-sm font-semibold">{group.characterName}</h3>
                                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                        {t('characterAsset.groupTotal', '{{done}} / {{total}} 씬 · {{percent}}%', { done: group.doneScenes, total: group.totalScenes, percent: progressPercent(group.doneScenes, group.totalScenes) })}
                                    </span>
                                </div>
                                <ul className="mt-2 grid gap-1.5">
                                    {group.rows.map(row => {
                                        const percent = progressPercent(row.doneScenes, row.totalScenes)
                                        return (
                                            <li key={row.presetId}>
                                                <button
                                                    type="button"
                                                    data-asset-progress-row
                                                    className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                                                    title={t('characterAsset.openInScene', '씬 모드에서 열기')}
                                                    onClick={() => {
                                                        setActivePreset(row.presetId)
                                                        onOpenChange(false)
                                                        navigate('/scenes')
                                                    }}
                                                >
                                                    <span className="flex items-center justify-between gap-2 text-sm">
                                                        <span className="flex min-w-0 items-center gap-1.5">
                                                            <span className="truncate">{row.sourceName}</span>
                                                            {row.i2iCycle && <span className="shrink-0 rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary">i2i</span>}
                                                        </span>
                                                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                                            {row.doneScenes} / {row.totalScenes}
                                                            {row.queued > 0 && ` · ${t('characterAsset.queued', '예약 {{n}}장', { n: row.queued })}`}
                                                        </span>
                                                    </span>
                                                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                                                        <span className={cn('block h-full rounded-full', percent >= 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${percent}%` }} />
                                                    </span>
                                                </button>
                                            </li>
                                        )
                                    })}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}

                {tab === 'create' && <div className="grid max-h-[60vh] gap-4 overflow-y-auto py-1 pr-1">
                    <section className="grid gap-2">
                        <h3 className="text-sm font-medium">{t('characterAsset.characters', '1. 캐릭터')}</h3>
                        {characters.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t('characterAsset.noCharacters', '캐릭터 창에 캐릭터가 없습니다.')}</p>
                        ) : (
                            <div className="grid max-h-40 gap-1.5 overflow-y-auto sm:grid-cols-2">
                                {characters.map((character, index) => (
                                    <button key={character.id} type="button" data-asset-character className={rowClass(characterIds.has(character.id))} onClick={() => setCharacterIds(current => toggle(current, character.id))}>
                                        <CheckMark checked={characterIds.has(character.id)} />
                                        <span className="truncate">{assetCharacterName(character.name, index)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="grid gap-2">
                        <h3 className="text-sm font-medium">{t('characterAsset.reference', '2. 레퍼런스')}</h3>
                        <div className="flex gap-2">
                            <button type="button" className={rowClass(useReference)} onClick={() => setUseReference(true)}>
                                <CheckMark checked={useReference} />
                                {t('characterAsset.referenceOn', '레퍼런스 넣기')}
                            </button>
                            <button type="button" className={rowClass(!useReference)} onClick={() => setUseReference(false)}>
                                <CheckMark checked={!useReference} />
                                {t('characterAsset.referenceOff', '레퍼런스 없이')}
                            </button>
                        </div>
                        {useReference && (references.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t('characterAsset.noReferences', '등록된 캐릭터 레퍼런스가 없습니다. 레퍼런스 없이 만들어집니다.')}</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {references.map((image, index) => {
                                    const checked = referenceIds.has(image.id)
                                    return (
                                        <button
                                            key={image.id}
                                            type="button"
                                            data-asset-reference
                                            aria-pressed={checked}
                                            title={image.name || `${index + 1}`}
                                            onClick={() => setReferenceIds(current => toggle(current, image.id))}
                                            className={cn('relative h-16 w-16 overflow-hidden rounded-lg border-2 bg-muted/40 text-[10px] text-muted-foreground transition-colors', checked ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100')}
                                        >
                                            {image.thumbnail
                                                ? <img src={image.thumbnail} alt="" className="h-full w-full object-cover" />
                                                : <span className="flex h-full w-full items-center justify-center px-1 text-center">{image.name || index + 1}</span>}
                                            {checked && (
                                                <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                    <Check className="h-3 w-3" />
                                                </span>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        ))}
                        {needsReference && <p className="text-xs text-amber-500">{t('characterAsset.pickReference', '쓸 레퍼런스를 하나 이상 고르세요. 고르지 않으면 레퍼런스 없이 만들어집니다.')}</p>}
                    </section>

                    <section className="grid gap-2">
                        <h3 className="text-sm font-medium">{t('characterAsset.presets', '3. 쓸 씬 (작품)')}</h3>
                        <div className="grid max-h-48 gap-1.5 overflow-y-auto">
                            {sourcePresets.map(preset => (
                                <button key={preset.id} type="button" data-asset-preset className={rowClass(presetIds.has(preset.id))} onClick={() => setPresetIds(current => toggle(current, preset.id))}>
                                    <CheckMark checked={presetIds.has(preset.id)} />
                                    <span className="min-w-0 flex-1 truncate">
                                        {preset.id === 'scene-default' ? t('scene.presetDefault', '기본') : preset.name}
                                        {preset.id === activePresetId && <span className="ml-2 text-[11px] opacity-70">{t('characterAsset.current', '지금 보는 작품')}</span>}
                                    </span>
                                    <span className="shrink-0 text-xs tabular-nums opacity-70">{t('characterAsset.sceneCount', '씬 {{n}}개', { n: preset.scenes.length })}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-medium">{t('characterAsset.queue', '씬마다 뽑을 장수')}</h3>
                            <p className="text-xs text-muted-foreground">{t('characterAsset.queueHelp', '복제된 씬에 미리 예약해 둡니다. 0이면 예약하지 않아요. 생성은 씬 모드에서 직접 시작합니다.')}</p>
                        </div>
                        <Input type="number" min={0} max={CHARACTER_ASSET_MAX_QUEUE} value={queueCount} onChange={event => setQueueCount(clampAssetQueueCount(event.target.value))} className="w-20" />
                    </section>

                    <label className="flex items-center justify-between gap-3" data-asset-cycle>
                        <span>
                            <span className="block text-sm font-medium">{t('characterAsset.cycle', 'i2i 싸이클도 함께 예약')}</span>
                            <span className="block text-xs text-muted-foreground">
                                {t('characterAsset.cycleHelp', '이 캐릭터씬을 생성하면 레퍼런스로 뽑은 뒤, 뽑힌 이미지마다 레퍼런스 없는 i2i를 이어서 뽑습니다. 씬 모드의 싸이클 스위치가 꺼져 있어도 돌고, 생성 횟수는 두 배가 돼요.')}
                            </span>
                        </span>
                        <Switch checked={i2iCycle} onChange={event => setI2iCycle(event.target.checked)} />
                    </label>
                </div>}

                <DialogFooter className="items-center sm:justify-between">
                    <span className="text-xs text-muted-foreground" data-asset-summary>
                        {tab === 'progress' ? '' : willCreate > 0
                            ? t('characterAsset.summary', '캐릭터씬 {{presets}}개 · 씬 {{scenes}}개 · 예약 {{images}}장', {
                                presets: willCreate,
                                scenes: sceneTotal * chosenCharacters.length,
                                images: sceneTotal * chosenCharacters.length * queueCount * (i2iCycle ? 2 : 1),
                            })
                            : t('characterAsset.pick', '캐릭터와 작품을 하나 이상 고르세요.')}
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>{tab === 'create' ? t('common.cancel') : t('common.close', '닫기')}</Button>
                        {tab === 'create' && <Button onClick={handleCreate} disabled={willCreate === 0}>{t('characterAsset.create', '캐릭터씬 만들기')}</Button>}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
