import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { convertFileSrc } from '@tauri-apps/api/core'
import { CalendarClock, Check, FolderOpen, Loader2, Play, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tip } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useCharacterPromptStore } from '@/stores/character-prompt-store'
import { useCharacterStore } from '@/stores/character-store'
import { useGenerationStore } from '@/stores/generation-store'
import { useSceneStore } from '@/stores/scene-store'
import { assetCharacterName, characterAssetProgress, progressPercent } from '@/lib/character-asset-presets'
import {
    RESERVATION_ROOT_FOLDER, clampSceneLimit, clampSeed, estimateReservation, randomSeed,
    type ReservationSeedMode,
} from '@/lib/scene-reservation'
import { openFolder, resolveSceneBaseFolder } from '@/lib/rell-folders'
import { pathKey } from '@/lib/scene-folder-sync'
import { startReservationRun, stopReservationRun, useReservationRunner } from '@/services/scene-reservation-runner'
import { join } from '@tauri-apps/api/path'

const rowClass = (checked: boolean) => cn(
    'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
    checked ? 'border-primary bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted/50',
)
const chipClass = (checked: boolean) => cn(
    'h-8 rounded-lg border px-3 text-xs transition-colors',
    checked ? 'border-primary bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted/50',
)

function CheckMark({ checked }: { checked: boolean }) {
    return (
        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
            {checked && <Check className="h-3 w-3" />}
        </span>
    )
}

function StepTitle({ step, children }: { step: number; children: React.ReactNode }) {
    return (
        <h3 className="flex items-center gap-2 text-sm font-medium">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{step}</span>
            {children}
        </h3>
    )
}

const toggleIn = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
}

type ReferenceSeedChoice = 'both' | 'reference' | 'i2i' | 'none'
const REFERENCE_SEED: Record<ReferenceSeedChoice, { reference: ReservationSeedMode; i2i: ReservationSeedMode }> = {
    both: { reference: 'fixed', i2i: 'fixed' },
    reference: { reference: 'fixed', i2i: 'random' },
    i2i: { reference: 'random', i2i: 'fixed' },
    none: { reference: 'random', i2i: 'random' },
}

/**
 * 예약대형: 여러 캐릭터 × 씬 묶음을 한 번에 예약해 차례로 자동 생성하고, 결과를 이 화면에서 본다.
 * 저장 위치는 NAIS_Scene/예약대형/<캐릭터>(_레퍼 · _I2I)/<씬 이름>.
 */
export default function SceneReservation() {
    const { t } = useTranslation()
    const characters = useCharacterPromptStore(state => state.characters)
    const references = useCharacterStore(state => state.characterImages)
    const presets = useSceneStore(state => state.presets)
    const createReservation = useSceneStore(state => state.createReservation)
    const deletePreset = useSceneStore(state => state.deletePreset)
    const sceneGenerating = useSceneStore(state => state.isGenerating)
    const mainGenerating = useGenerationStore(state => state.isGenerating)
    const runner = useReservationRunner()

    const sourcePresets = useMemo(() => presets.filter(preset => !preset.characterAsset), [presets])
    const [characterIds, setCharacterIds] = useState<Set<string>>(new Set())
    /** 캐릭터 id → 쓸 레퍼런스 id들. 항목이 없거나 비어 있으면 레퍼런스 없이. */
    const [referencesByCharacter, setReferencesByCharacter] = useState<Record<string, string[]>>({})
    const [presetIds, setPresetIds] = useState<Set<string>>(new Set())
    const [limitAll, setLimitAll] = useState(true)
    const [limit, setLimit] = useState(20)
    const [plainSeed, setPlainSeed] = useState<ReservationSeedMode>('fixed')
    const [referenceSeed, setReferenceSeed] = useState<ReferenceSeedChoice>('both')
    const [seedValue, setSeedValue] = useState(() => clampSeed(useGenerationStore.getState().seed) || randomSeed())
    const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [preview, setPreview] = useState<string | null>(null)

    const chosenCharacters = characters
        .map((character, index) => ({ id: character.id, name: assetCharacterName(character.name, index), referenceIds: referencesByCharacter[character.id] ?? [] }))
        .filter(character => characterIds.has(character.id))
    const anyReference = chosenCharacters.some(character => character.referenceIds.length > 0)
    const anyPlain = chosenCharacters.some(character => character.referenceIds.length === 0)
    const sceneLimit = limitAll ? null : clampSceneLimit(limit)
    const estimate = useMemo(
        () => estimateReservation(presets, { characters: chosenCharacters, presetIds: [...presetIds], sceneLimit }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [presets, characterIds, referencesByCharacter, presetIds, sceneLimit],
    )
    const busy = runner.running || sceneGenerating || mainGenerating
    const needsFixedSeed = (anyPlain && plainSeed === 'fixed') || (anyReference && referenceSeed !== 'none')

    const progress = useMemo(() => characterAssetProgress(presets, 'reservation'), [presets])
    const selectedPreset = presets.find(preset => preset.id === selectedPresetId && preset.characterAsset?.reservation) ?? null

    // 실행 중이면 지금 돌고 있는 묶음을 따라가며 보여준다.
    useEffect(() => {
        if (runner.running && runner.currentId) setSelectedPresetId(runner.currentId)
    }, [runner.running, runner.currentId])

    const handleStart = async () => {
        if (estimate.jobs === 0 || busy) return
        try {
            const jobs = createReservation({
                characters: chosenCharacters,
                presetIds: [...presetIds],
                sceneLimit,
                seedMode: plainSeed,
                referenceSeedMode: REFERENCE_SEED[referenceSeed].reference,
                i2iSeedMode: REFERENCE_SEED[referenceSeed].i2i,
                fixedSeed: clampSeed(seedValue) || randomSeed(),
                sceneBasePath: await resolveSceneBaseFolder(),
            })
            if (startReservationRun(jobs.map(job => job.presetId))) {
                const images = jobs.reduce((sum, job) => sum + job.images, 0)
                toast({
                    title: t('reservation.started', '예약대형을 시작합니다'),
                    description: t('reservation.startedBody', '{{jobs}}묶음 · 이미지 {{images}}장을 차례로 생성합니다.', { jobs: jobs.filter(job => job.scenes > 0).length, images }),
                })
            }
        } catch (error) {
            console.error('Failed to start the reservation:', error)
            toast({ title: t('reservation.startFailed', '예약을 시작하지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    const openReservationFolder = async (path?: string) => {
        try {
            await openFolder(path ?? await join(await resolveSceneBaseFolder(), RESERVATION_ROOT_FOLDER))
        } catch (error) {
            toast({ title: t('reservation.openFailed', '폴더를 열지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    const i2iRoot = selectedPreset?.characterAsset?.i2iFolderRoot
    const isI2iImage = (url: string) => !!i2iRoot && pathKey(url).startsWith(pathKey(i2iRoot) + '/')
    const folderOf = (path: string) => path.replace(/[\\/][^\\/]*$/, '')

    return (
        <div className="flex h-full min-h-0 gap-3 p-3">
            {/* 예약 설정 */}
            <aside className="flex w-[26rem] shrink-0 flex-col rounded-2xl border border-border/60 bg-card/40">
                <div className="border-b border-border/40 px-4 py-3">
                    <h1 className="flex items-center gap-2 text-sm font-semibold">
                        <CalendarClock className="h-4 w-4 text-muted-foreground" />
                        {t('reservation.title', '예약대형')}
                    </h1>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('reservation.desc', '여러 캐릭터와 씬 묶음을 한 번에 예약하면 차례로 끝까지 자동 생성합니다. 씬 개수 제한은 없어요.')}
                    </p>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
                    <section className="grid gap-2">
                        <StepTitle step={1}>{t('reservation.characters', '캐릭터')}</StepTitle>
                        {characters.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t('reservation.noCharacters', '캐릭터 창에 캐릭터가 없습니다.')}</p>
                        ) : (
                            <div className="grid max-h-44 gap-1.5 overflow-y-auto sm:grid-cols-2">
                                {characters.map((character, index) => (
                                    <button key={character.id} type="button" data-reserve-character disabled={busy} className={rowClass(characterIds.has(character.id))} onClick={() => setCharacterIds(current => toggleIn(current, character.id))}>
                                        <CheckMark checked={characterIds.has(character.id)} />
                                        <span className="truncate">{assetCharacterName(character.name, index)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="grid gap-2">
                        <StepTitle step={2}>{t('reservation.references', '캐릭터별 레퍼런스')}</StepTitle>
                        {chosenCharacters.length === 0 && <p className="text-xs text-muted-foreground">{t('reservation.pickCharactersFirst', '먼저 캐릭터를 고르세요.')}</p>}
                        {chosenCharacters.map(character => {
                            const using = character.referenceIds.length > 0
                            return (
                                <div key={character.id} data-reserve-reference-row className="rounded-lg border border-border/50 p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-sm font-medium">{character.name}</span>
                                        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', using ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                                            {using ? t('reservation.withReference', '레퍼런스 + i2i') : t('reservation.withoutReference', '레퍼런스 없이')}
                                        </span>
                                    </div>
                                    {references.length === 0 ? (
                                        <p className="mt-1.5 text-[11px] text-muted-foreground">{t('reservation.noReferences', '등록된 캐릭터 레퍼런스가 없어서 레퍼런스 없이 뽑습니다.')}</p>
                                    ) : (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {references.map((image, index) => {
                                                const checked = character.referenceIds.includes(image.id)
                                                return (
                                                    <button
                                                        key={image.id}
                                                        type="button"
                                                        data-reserve-reference
                                                        aria-pressed={checked}
                                                        disabled={busy}
                                                        title={image.name || `${index + 1}`}
                                                        onClick={() => setReferencesByCharacter(current => {
                                                            const mine = current[character.id] ?? []
                                                            return { ...current, [character.id]: checked ? mine.filter(id => id !== image.id) : [...mine, image.id] }
                                                        })}
                                                        className={cn('relative h-12 w-12 overflow-hidden rounded-md border-2 bg-muted/40 text-[10px] text-muted-foreground transition-colors', checked ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100')}
                                                    >
                                                        {image.thumbnail
                                                            ? <img src={image.thumbnail} alt="" className="h-full w-full object-cover" />
                                                            : <span className="flex h-full w-full items-center justify-center px-0.5 text-center">{image.name || index + 1}</span>}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                                        {using
                                            ? t('reservation.referenceHelp', '레퍼런스로 먼저 뽑고, 뽑힌 이미지마다 i2i를 이어서 뽑습니다 (씬당 2장).')
                                            : t('reservation.noReferenceHelp', '레퍼런스를 고르지 않으면 원본만 뽑습니다 (씬당 1장).')}
                                    </p>
                                </div>
                            )
                        })}
                    </section>

                    <section className="grid gap-2">
                        <StepTitle step={3}>{t('reservation.seed', '시드')}</StepTitle>
                        {(anyPlain || chosenCharacters.length === 0) && (
                            <div className="grid gap-1.5" data-reserve-plain-seed>
                                <span className="text-xs text-muted-foreground">{t('reservation.seedPlain', '레퍼런스 없는 캐릭터')}</span>
                                <div className="flex gap-1.5">
                                    <button type="button" disabled={busy} className={chipClass(plainSeed === 'fixed')} onClick={() => setPlainSeed('fixed')}>{t('reservation.seedFixed', '고정 (모든 씬 같은 시드)')}</button>
                                    <button type="button" disabled={busy} className={chipClass(plainSeed === 'random')} onClick={() => setPlainSeed('random')}>{t('reservation.seedRandom', '랜덤 (씬마다 다른 시드)')}</button>
                                </div>
                            </div>
                        )}
                        {anyReference && (
                            <div className="grid gap-1.5" data-reserve-reference-seed>
                                <span className="text-xs text-muted-foreground">{t('reservation.seedReference', '레퍼런스 쓰는 캐릭터')}</span>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {([
                                        ['both', t('reservation.seedBoth', '레퍼 · i2i 둘 다 고정')],
                                        ['reference', t('reservation.seedReferenceOnly', '레퍼만 고정')],
                                        ['i2i', t('reservation.seedI2iOnly', 'i2i만 고정')],
                                        ['none', t('reservation.seedNone', '둘 다 랜덤')],
                                    ] as const).map(([value, label]) => (
                                        <button key={value} type="button" disabled={busy} className={chipClass(referenceSeed === value)} onClick={() => setReferenceSeed(value)}>{label}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {needsFixedSeed && (
                            <div className="flex items-center gap-2">
                                <span className="shrink-0 text-xs text-muted-foreground">{t('reservation.seedValue', '고정 시드 값')}</span>
                                <Input type="number" min={1} value={seedValue} disabled={busy} onChange={event => setSeedValue(clampSeed(event.target.value))} className="h-8 flex-1" />
                                <Button variant="outline" size="sm" className="h-8" disabled={busy} onClick={() => setSeedValue(randomSeed())}>{t('reservation.seedNew', '새 시드')}</Button>
                            </div>
                        )}
                    </section>

                    <section className="grid gap-2">
                        <StepTitle step={4}>{t('reservation.presets', '씬 목록')}</StepTitle>
                        <div className="grid max-h-48 gap-1.5 overflow-y-auto">
                            {sourcePresets.map(preset => (
                                <button key={preset.id} type="button" data-reserve-preset disabled={busy} className={rowClass(presetIds.has(preset.id))} onClick={() => setPresetIds(current => toggleIn(current, preset.id))}>
                                    <CheckMark checked={presetIds.has(preset.id)} />
                                    <span className="min-w-0 flex-1 truncate">{preset.id === 'scene-default' ? t('scene.presetDefault', '기본') : preset.name}</span>
                                    <span className="shrink-0 text-xs tabular-nums opacity-70">{t('reservation.sceneCount', '씬 {{n}}개', { n: preset.scenes.length })}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="grid gap-2">
                        <StepTitle step={5}>{t('reservation.range', '몇 번째 씬까지')}</StepTitle>
                        <div className="flex items-center gap-1.5">
                            <button type="button" disabled={busy} className={chipClass(limitAll)} onClick={() => setLimitAll(true)}>{t('reservation.rangeAll', '전체')}</button>
                            <button type="button" disabled={busy} className={chipClass(!limitAll)} onClick={() => setLimitAll(false)}>{t('reservation.rangeLimit', '앞에서부터')}</button>
                            {!limitAll && (
                                <>
                                    <Input type="number" min={1} value={limit} disabled={busy} onChange={event => setLimit(Math.max(1, Math.floor(Number(event.target.value) || 1)))} className="h-8 w-24" />
                                    <span className="text-xs text-muted-foreground">{t('reservation.rangeUnit', '번째까지')}</span>
                                </>
                            )}
                        </div>
                    </section>
                </div>

                <div className="border-t border-border/40 p-4">
                    <p className="mb-2 text-xs text-muted-foreground" data-reserve-summary>
                        {estimate.jobs > 0
                            ? t('reservation.summary', '{{jobs}}묶음 · 씬 {{scenes}}개 · 이미지 {{images}}장', { jobs: estimate.jobs, scenes: estimate.scenes.toLocaleString(), images: estimate.images.toLocaleString() })
                            : t('reservation.pick', '캐릭터와 씬 목록을 하나 이상 고르세요.')}
                    </p>
                    {runner.running ? (
                        <Button variant="destructive" className="w-full" onClick={stopReservationRun}>
                            <Square className="mr-2 h-4 w-4" />
                            {t('reservation.stop', '중지 ({{done}} / {{total}} 묶음)', { done: runner.finished, total: runner.queue.length })}
                        </Button>
                    ) : (
                        <Button className="w-full" onClick={() => void handleStart()} disabled={estimate.jobs === 0 || busy}>
                            <Play className="mr-2 h-4 w-4" />
                            {busy ? t('reservation.waiting', '다른 생성이 진행 중') : t('reservation.start', '예약 시작')}
                        </Button>
                    )}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                        {t('reservation.resumeHelp', '같은 캐릭터와 씬 목록으로 다시 예약하면 새로 만들지 않고, 아직 안 뽑힌 씬만 이어서 뽑습니다.')}
                    </p>
                </div>
            </aside>

            {/* 진행 상황과 결과 */}
            <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-border/60 bg-card/40">
                <div className="flex items-center justify-between gap-2 border-b border-border/40 px-4 py-2.5">
                    <h2 className="text-sm font-medium">{t('reservation.results', '예약 결과')}</h2>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => void openReservationFolder()}>
                        <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                        {t('reservation.openRoot', '예약대형 폴더 열기')}
                    </Button>
                </div>
                <div className="flex min-h-0 flex-1">
                    <div className="w-64 shrink-0 overflow-y-auto border-r border-border/40 p-2">
                        {progress.length === 0 && (
                            <p className="px-2 py-8 text-center text-xs text-muted-foreground">{t('reservation.noResults', '아직 예약한 것이 없습니다.')}</p>
                        )}
                        {progress.map(group => (
                            <div key={group.characterPromptId} className="mb-3">
                                <p className="flex items-center justify-between px-2 py-1 text-xs font-semibold">
                                    <span className="truncate">{group.characterName}</span>
                                    <span className="shrink-0 tabular-nums text-muted-foreground">{group.doneScenes}/{group.totalScenes}</span>
                                </p>
                                {group.rows.map(row => {
                                    const percent = progressPercent(row.doneScenes, row.totalScenes)
                                    const running = runner.running && runner.currentId === row.presetId
                                    return (
                                        <button
                                            key={row.presetId}
                                            type="button"
                                            data-reserve-result-row
                                            onClick={() => setSelectedPresetId(row.presetId)}
                                            className={cn('mb-1 w-full rounded-lg px-2 py-1.5 text-left transition-colors', row.presetId === selectedPresetId ? 'bg-primary/15' : 'hover:bg-muted/50')}
                                        >
                                            <span className="flex items-center justify-between gap-2 text-sm">
                                                <span className="flex min-w-0 items-center gap-1.5">
                                                    {running && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />}
                                                    <span className="truncate">{row.sourceName}</span>
                                                    {row.i2iCycle && <span className="shrink-0 rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary">i2i</span>}
                                                </span>
                                                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{row.doneScenes}/{row.totalScenes}</span>
                                            </span>
                                            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                                                <span className={cn('block h-full rounded-full', percent >= 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${percent}%` }} />
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        ))}
                    </div>

                    {selectedPreset ? (
                        <div className="flex min-w-0 flex-1 flex-col">
                            <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-2">
                                <span className="min-w-0 flex-1 truncate text-sm font-medium">{selectedPreset.name.replace(/^\[예약\]\s*/, '')}</span>
                                {selectedPreset.scenes[0]?.folderPath && (
                                    <Tip content={t('reservation.openFirst', '원본(레퍼) 폴더 열기')}>
                                        <Button variant="outline" size="sm" className="h-8" onClick={() => void openReservationFolder(folderOf(selectedPreset.scenes[0].folderPath!))}>
                                            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                                            {i2iRoot ? t('reservation.folderReference', '레퍼') : t('reservation.folder', '폴더')}
                                        </Button>
                                    </Tip>
                                )}
                                {i2iRoot && (
                                    <Tip content={t('reservation.openI2i', 'i2i 폴더 열기')}>
                                        <Button variant="outline" size="sm" className="h-8" onClick={() => void openReservationFolder(i2iRoot)}>
                                            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                                            I2I
                                        </Button>
                                    </Tip>
                                )}
                                <Tip content={t('reservation.deleteTip', '이 예약 기록을 목록에서 지웁니다 (이미지 파일은 남아요)')}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={runner.running} onClick={() => setDeleteId(selectedPreset.id)} aria-label={t('reservation.delete', '예약 기록 삭제')}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </Tip>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(11rem, 1fr))' }}>
                                    {selectedPreset.scenes.map((scene, index) => {
                                        // 오래된 것부터: 레퍼런스 원본이 왼쪽, i2i가 오른쪽
                                        const images = [...scene.images].sort((a, b) => a.timestamp - b.timestamp)
                                        return (
                                            <div key={scene.id} data-reserve-scene className="overflow-hidden rounded-lg border border-border/50 bg-background/40">
                                                <div className={cn('grid bg-muted/30', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
                                                    {images.length === 0 && (
                                                        <span className="flex aspect-[2/3] items-center justify-center text-[11px] text-muted-foreground">
                                                            {scene.queueCount > 0 ? t('reservation.queued', '예약됨') : t('reservation.empty', '없음')}
                                                        </span>
                                                    )}
                                                    {images.map(image => (
                                                        <button key={image.id} type="button" className="relative aspect-[2/3] overflow-hidden" onClick={() => setPreview(image.url)} title={image.url}>
                                                            <img src={convertFileSrc(image.url)} alt="" loading="lazy" className="h-full w-full object-cover" />
                                                            {i2iRoot && (
                                                                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] font-semibold text-white">
                                                                    {isI2iImage(image.url) ? 'I2I' : t('reservation.tagReference', '레퍼')}
                                                                </span>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                                <p className="truncate px-2 py-1 text-xs">
                                                    <span className="mr-1 tabular-nums text-muted-foreground">{index + 1}</span>
                                                    {scene.name}
                                                </p>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                            {t('reservation.pickResult', '왼쪽에서 캐릭터의 묶음을 고르면 씬별 결과가 보입니다.')}
                        </div>
                    )}
                </div>
            </section>

            {preview && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-8" onClick={() => setPreview(null)} role="presentation">
                    <img src={convertFileSrc(preview)} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
                </div>
            )}
            <ConfirmDialog
                open={deleteId !== null}
                onOpenChange={open => { if (!open) setDeleteId(null) }}
                title={t('reservation.deleteTitle', '이 예약 기록을 지울까요?')}
                description={t('reservation.deleteHelp', '목록과 진행 기록만 지워집니다. 폴더의 이미지 파일은 그대로 남아요.')}
                confirmText={t('reservation.delete', '예약 기록 삭제')}
                variant="destructive"
                onConfirm={() => {
                    if (deleteId) {
                        deletePreset(deleteId)
                        if (selectedPresetId === deleteId) setSelectedPresetId(null)
                    }
                }}
            />
        </div>
    )
}
