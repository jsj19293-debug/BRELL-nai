import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, Copy, Home, Sprout, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tip } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import { useSeedVaultStore } from '@/stores/seed-vault-store'
import { useGenerationStore } from '@/stores/generation-store'
import { useSettingsStore } from '@/stores/settings-store'
import { filterSeedEntries, type SeedVaultEntry } from '@/lib/seed-vault'

const formatDate = (time: number) => {
    const date = new Date(time)
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 예약대형 탭이 가져가도록 남겨 두는 시드 (보관함 → 예약대형 고정 시드) */
let reservationSeedRequest: number | null = null
export function takeReservationSeedRequest(): number | null {
    const value = reservationSeedRequest
    reservationSeedRequest = null
    return value
}

/** 왼쪽 위 새싹 버튼과 시드 보관함 창 */
export function SeedVaultButton() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const entries = useSeedVaultStore(state => state.entries)
    const open = useSeedVaultStore(state => state.open)
    const setOpen = useSeedVaultStore(state => state.setOpen)
    const setMemo = useSeedVaultStore(state => state.setMemo)
    const remove = useSeedVaultStore(state => state.remove)
    const reservationEnabled = useSettingsStore(state => state.sceneReservationEnabled)
    const [query, setQuery] = useState('')
    const visible = useMemo(() => filterSeedEntries(entries, query), [entries, query])

    const handleCopy = async (entry: SeedVaultEntry) => {
        try {
            await navigator.clipboard.writeText(String(entry.seed))
            toast({ title: t('seedVault.copied', '시드를 복사했어요'), description: String(entry.seed), variant: 'success' })
        } catch {
            toast({ title: t('actions.copyFailed', '복사 실패'), variant: 'destructive' })
        }
    }

    const handleApplyMain = (entry: SeedVaultEntry) => {
        const generation = useGenerationStore.getState()
        generation.setSeed(entry.seed)
        generation.setSeedLocked(true)
        toast({ title: t('seedVault.appliedMain', '메인 시드에 넣고 고정했어요'), description: String(entry.seed), variant: 'success' })
    }

    const handleUseForReservation = (entry: SeedVaultEntry) => {
        reservationSeedRequest = entry.seed
        setOpen(false)
        navigate('/reserve')
        window.dispatchEvent(new CustomEvent('nightmare:reservation-seed'))
        toast({ title: t('seedVault.appliedReservation', '예약대형 고정 시드에 넣었어요'), description: String(entry.seed), variant: 'success' })
    }

    return (
        <>
            <Tip content={t('seedVault.tip', '시드 보관함 · {{n}}개', { n: entries.length })}>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label={t('seedVault.title', '시드 보관함')}
                    data-seed-vault-button
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 transition-colors hover:bg-emerald-500/20 hover:text-emerald-300"
                >
                    <Sprout className="h-4 w-4" />
                </button>
            </Tip>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-3xl" data-seed-vault>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Sprout className="h-5 w-5 text-emerald-400" />{t('seedVault.title', '시드 보관함')}</DialogTitle>
                        <DialogDescription>
                            {t('seedVault.desc', '이미지를 우클릭해서 "현재 시드값 저장"을 누르면 여기에 모입니다. 씬 카드 우클릭 > 시드값 고정에서도 여기 있는 시드를 고를 수 있어요.')}
                        </DialogDescription>
                    </DialogHeader>

                    <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('seedVault.search', '시드 · 프롬프트 · 메모 검색')} className="h-9" />

                    <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                        {visible.length === 0 && (
                            <p className="py-10 text-center text-sm text-muted-foreground">
                                {entries.length === 0
                                    ? t('seedVault.empty', '아직 저장한 시드가 없습니다.')
                                    : t('seedVault.noMatch', '검색 결과가 없습니다.')}
                            </p>
                        )}
                        {visible.map((entry: SeedVaultEntry) => (
                            <div key={entry.id} data-seed-entry className="flex gap-3 rounded-xl border border-border/50 bg-card/40 p-2.5">
                                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
                                    {entry.thumbnail
                                        ? <img src={entry.thumbnail} alt="" className="h-full w-full object-cover" />
                                        : <Sprout className="h-6 w-6 text-muted-foreground" />}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="select-text font-mono text-base font-semibold text-emerald-400">{entry.seed}</span>
                                        <span className="text-[11px] text-muted-foreground">{formatDate(entry.createdAt)}</span>
                                        {entry.width && entry.height ? <span className="text-[11px] text-muted-foreground">{entry.width}×{entry.height}</span> : null}
                                        {entry.model && <span className="max-w-[160px] truncate text-[11px] text-muted-foreground">{entry.model}</span>}
                                    </div>
                                    {entry.prompt && <p className="line-clamp-2 select-text break-all text-xs text-muted-foreground" title={entry.prompt}>{entry.prompt}</p>}
                                    <Input
                                        value={entry.memo || ''}
                                        onChange={event => setMemo(entry.id, event.target.value.slice(0, 200))}
                                        placeholder={t('seedVault.memo', '메모')}
                                        className="h-7 text-xs"
                                    />
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => void handleCopy(entry)}><Copy className="mr-1 h-3.5 w-3.5" />{t('seedVault.copy', '시드 복사')}</Button>
                                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => handleApplyMain(entry)}><Home className="mr-1 h-3.5 w-3.5" />{t('seedVault.applyMain', '메인에 적용')}</Button>
                                        {reservationEnabled && (
                                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => handleUseForReservation(entry)}><CalendarClock className="mr-1 h-3.5 w-3.5" />{t('seedVault.applyReservation', '예약대형 고정 시드로')}</Button>
                                        )}
                                        <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs text-red-500 hover:text-red-500" onClick={() => remove(entry.id)}><Trash2 className="mr-1 h-3.5 w-3.5" />{t('actions.delete', '삭제')}</Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

/** 시드 입력 칸 옆에 두는 새싹 버튼: 보관함에서 시드를 골라 넣는다. */
export function SeedVaultPicker({ onPick, disabled }: { onPick: (seed: number) => void; disabled?: boolean }) {
    const { t } = useTranslation()
    const entries = useSeedVaultStore(state => state.entries)
    const [open, setOpen] = useState(false)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 px-2 text-emerald-400" disabled={disabled} data-seed-picker title={t('seedVault.pick', '시드 보관함에서 고르기')}>
                    <Sprout className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
                <p className="px-1 pb-1.5 text-xs font-medium">{t('seedVault.pick', '시드 보관함에서 고르기')}</p>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                    {entries.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">{t('seedVault.empty', '아직 저장한 시드가 없습니다.')}</p>}
                    {entries.map((entry: SeedVaultEntry) => (
                        <button
                            key={entry.id}
                            type="button"
                            data-seed-pick
                            onClick={() => { onPick(entry.seed); setOpen(false) }}
                            className="flex w-full items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-muted/60"
                        >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted/40">
                                {entry.thumbnail ? <img src={entry.thumbnail} alt="" className="h-full w-full object-cover" /> : <Sprout className="h-4 w-4 text-muted-foreground" />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block font-mono text-sm text-emerald-400">{entry.seed}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">{entry.memo || entry.prompt || ''}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    )
}
