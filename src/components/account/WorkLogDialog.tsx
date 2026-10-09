import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { History } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tip } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useWorkLogStore } from '@/stores/work-log-store'
import { dateKey, dayModelRows, summarizeDay, summarizeWorkLog, workLogCsv } from '@/lib/work-log'

const RANGES = [7, 30, 365] as const

const formatAnlas = (value: number) => (value > 0 ? value.toLocaleString() : '–')
const formatPercent = (value: number) => (value > 0 ? `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%` : '–')

/** 상단의 작업 기록 버튼과 창: 날짜별 · 모델별 생성 장수와 사용량(Anlas, V5 %). */
export function WorkLogButton() {
    const { t } = useTranslation()
    const days = useWorkLogStore(state => state.days)
    const clear = useWorkLogStore(state => state.clear)
    const [open, setOpen] = useState(false)
    const [range, setRange] = useState<(typeof RANGES)[number]>(30)
    const [confirmClear, setConfirmClear] = useState(false)

    const visible = useMemo(() => {
        const since = dateKey(Date.now() - (range - 1) * 24 * 60 * 60 * 1000)
        return days.filter(day => day.date >= since)
    }, [days, range])
    const total = useMemo(() => summarizeWorkLog(visible), [visible])
    const today = useMemo(() => {
        const day = days.find(item => item.date === dateKey(Date.now()))
        return day ? summarizeDay(day) : null
    }, [days])

    const handleExport = async () => {
        try {
            const path = await save({ defaultPath: `Nightmare4_작업기록_${dateKey(Date.now())}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] })
            if (!path) return
            // 엑셀이 한글을 제대로 읽도록 BOM을 붙인다.
            await writeTextFile(path, '﻿' + workLogCsv(visible))
            toast({ title: t('workLog.exported', '작업 기록을 저장했어요'), description: path, variant: 'success' })
        } catch (error) {
            toast({ title: t('workLog.exportFailed', '저장하지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    return (
        <>
            <Tip content={today
                ? t('workLog.tipToday', '작업 기록 · 오늘 {{n}}장', { n: today.images })
                : t('workLog.tip', '작업 기록')}>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label={t('workLog.title', '작업 기록')}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                    <History className="h-4 w-4" />
                </button>
            </Tip>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t('workLog.title', '작업 기록')}</DialogTitle>
                        <DialogDescription>
                            {t('workLog.desc', '이 PC에서 생성한 장수와, 생성 직후 줄어든 Anlas · V5 사용량입니다. 다른 기기에서 쓴 것은 들어가지 않아요.')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-wrap items-center gap-2">
                        {RANGES.map(value => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={range === value}
                                onClick={() => setRange(value)}
                                className={cn(
                                    'h-8 rounded-lg border px-3 text-xs transition-colors',
                                    range === value ? 'border-primary bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted/50',
                                )}
                            >
                                {value === 365 ? t('workLog.rangeYear', '1년') : t('workLog.rangeDays', '최근 {{n}}일', { n: value })}
                            </button>
                        ))}
                        <div className="ml-auto flex gap-4 text-xs text-muted-foreground" data-work-log-total>
                            <span>{t('workLog.totalImages', '합계 {{n}}장', { n: total.images.toLocaleString() })}</span>
                            <span>Anlas {formatAnlas(total.anlas)}</span>
                            <span>V5 {formatPercent(total.v5Percent)}</span>
                        </div>
                    </div>

                    <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border/50">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                                <tr className="border-b border-border/50">
                                    <th className="px-3 py-2 text-left font-medium">{t('workLog.date', '날짜')}</th>
                                    <th className="px-3 py-2 text-left font-medium">{t('workLog.model', '모델')}</th>
                                    <th className="px-3 py-2 text-right font-medium">{t('workLog.images', '장수')}</th>
                                    <th className="px-3 py-2 text-right font-medium">Anlas</th>
                                    <th className="px-3 py-2 text-right font-medium">{t('workLog.v5', 'V5 사용량')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map(day => {
                                    const rows = dayModelRows(day)
                                    const sum = summarizeDay(day)
                                    return rows.map((row, index) => (
                                        <tr key={`${day.date}-${row.model}`} data-work-log-row className={cn(index === 0 && 'border-t border-border/40')}>
                                            <td className="px-3 py-1.5 align-top tabular-nums text-muted-foreground">
                                                {index === 0 && (
                                                    <>
                                                        {day.date}
                                                        {rows.length > 1 && <span className="block text-[11px] opacity-70">{t('workLog.dayTotal', '합 {{n}}장', { n: sum.images })}</span>}
                                                    </>
                                                )}
                                            </td>
                                            <td className="px-3 py-1.5">{row.label}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">{row.images.toLocaleString()}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">{formatAnlas(row.anlas)}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">{formatPercent(row.v5Percent)}</td>
                                        </tr>
                                    ))
                                })}
                                {visible.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                                            {t('workLog.empty', '아직 기록이 없습니다. 이미지를 생성하면 여기에 쌓여요.')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <DialogFooter className="sm:justify-between">
                        <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmClear(true)} disabled={days.length === 0}>
                            {t('workLog.clear', '기록 지우기')}
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => void handleExport()} disabled={visible.length === 0}>{t('workLog.export', 'CSV로 저장')}</Button>
                            <Button onClick={() => setOpen(false)}>{t('common.close', '닫기')}</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ConfirmDialog
                open={confirmClear}
                onOpenChange={setConfirmClear}
                title={t('workLog.clearTitle', '작업 기록을 모두 지울까요?')}
                description={t('workLog.clearHelp', '되돌릴 수 없습니다. 이미지와 씬은 지워지지 않아요.')}
                confirmText={t('workLog.clear', '기록 지우기')}
                variant="destructive"
                onConfirm={clear}
            />
        </>
    )
}
