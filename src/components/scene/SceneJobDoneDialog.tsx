import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { AlertTriangle, FolderOpen, FolderSearch, Loader2, PackageCheck, Star } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { useJobDoneStore } from '@/stores/job-done-store'
import { useSceneStore } from '@/stores/scene-store'
import { useSettingsStore } from '@/stores/settings-store'
import { finishSceneJob, planSceneJob } from '@/services/scene-job-done'
import { openFolder } from '@/lib/rell-folders'
import { formatBytes } from '@/lib/scene-webp-export'

/**
 * 씬 모드 "작업완료하기": 씬마다 최신 1장을 원본 + WebP(EXIF 제거 · 고화질 압축)로 보관 폴더에 내보내고,
 * 씬에는 그 1장만 남기고 나머지는 즐겨찾기여도 지운다. 지우기 전에 어느 씬에서 몇 장이 지워지는지 보여 주고 한 번 더 묻는다.
 */
export function SceneJobDoneDialog({ open, onOpenChange, presetId }: { open: boolean; onOpenChange: (open: boolean) => void; presetId: string }) {
    const { t } = useTranslation()
    const archiveFolder = useJobDoneStore(state => state.archiveFolder)
    const setArchiveFolder = useJobDoneStore(state => state.setArchiveFolder)
    const preset = useSceneStore(state => state.presets.find(candidate => candidate.id === presetId))
    const quality = useSettingsStore(state => state.sceneWebpExport.quality)
    const [running, setRunning] = useState(false)
    const [confirming, setConfirming] = useState(false)

    // 씬 목록이 바뀌면 계획도 다시 세운다.
    const plan = useMemo(() => (preset ? planSceneJob(presetId) : null), [preset, presetId])
    useEffect(() => { if (open) setConfirming(false) }, [open])

    const pickArchive = async () => {
        const selected = await openDialog({ directory: true, multiple: false, defaultPath: archiveFolder || undefined }).catch(() => null)
        if (selected && typeof selected === 'string') setArchiveFolder(selected)
    }

    const run = async () => {
        setRunning(true)
        try {
            const result = await finishSceneJob(presetId, archiveFolder)
            if (result.ok) {
                const lines = [
                    t('jobDone.doneSize', 'WebP {{before}} → {{after}}', { before: formatBytes(result.bytesBefore), after: formatBytes(result.bytesAfter) }),
                    result.jobFolder,
                    ...(result.failed.length > 0 ? [t('jobDone.failedScenes', '내보내지 못해 그대로 둔 씬: {{names}}', { names: result.failed.join(', ') })] : []),
                ]
                toast({
                    title: t('jobDone.done2', '작업완료: {{n}}개 씬 내보냄 · 옛 이미지 {{d}}장 삭제', { n: result.exported, d: result.deleted }),
                    description: lines.join('\n'),
                    variant: result.failed.length > 0 ? 'destructive' : 'success',
                })
                onOpenChange(false)
                return
            }
            const message = {
                busy: t('jobDone.busy', '생성 중이거나 예약이 남아 있어요. 끝난 뒤에 눌러 주세요.'),
                'no-preset': t('jobDone.noPreset', '작품을 찾지 못했어요.'),
                'no-archive': t('jobDone.noArchive', '모아 둘 폴더를 먼저 골라 주세요.'),
                nothing: t('jobDone.nothing2', '내보낼 이미지가 없어요.'),
                failed: t('jobDone.failed2', '작업완료에 실패했어요. 씬 이미지는 지우지 않았습니다.'),
            }[result.reason]
            toast({ title: message, description: result.error, variant: 'destructive' })
        } finally {
            setRunning(false)
            setConfirming(false)
        }
    }

    const start = () => {
        if (!plan) return
        // 지울 것이 있으면 목록을 보여 주고 한 번 더 묻는다.
        if (plan.removeCount > 0 && !confirming) {
            setConfirming(true)
            return
        }
        void run()
    }

    const presetName = preset?.name ?? ''
    const canRun = !!plan && plan.exports.length > 0 && !!archiveFolder && !running

    return (
        <Dialog open={open} onOpenChange={(next: boolean) => { if (!running) onOpenChange(next) }}>
            <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg" data-job-done>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary" />{t('jobDone.title', '작업완료하기')}</DialogTitle>
                    <DialogDescription>
                        {t('jobDone.desc2', '"{{name}}"의 씬마다 가장 최근 1장을 원본과 WebP(EXIF 제거 · 고화질 압축)로 모아 둘 폴더에 내보내고, 씬에는 그 1장만 남깁니다. 나머지는 즐겨찾기여도 지워집니다.', { name: presetName })}
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto text-sm">
                    <div className="rounded-lg border border-border/60 p-3">
                        <p className="text-xs text-muted-foreground">{t('jobDone.to', '모아 둘 폴더 (한 번 고르면 기억해요)')}</p>
                        <div className="mt-1 flex items-center gap-2">
                            <p className="min-w-0 flex-1 break-all text-xs" data-job-done-archive>{archiveFolder || t('jobDone.notSet', '아직 안 골랐어요')}</p>
                            {archiveFolder && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => void openFolder(archiveFolder).catch(() => undefined)} title={t('jobDone.openArchive', '폴더 열기')}>
                                    <FolderOpen className="h-4 w-4" />
                                </Button>
                            )}
                            <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => void pickArchive()} disabled={running}>
                                <FolderSearch className="mr-1.5 h-3.5 w-3.5" />
                                {archiveFolder ? t('jobDone.change', '바꾸기') : t('jobDone.choose', '폴더 고르기')}
                            </Button>
                        </div>
                        {archiveFolder && presetName && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground" data-job-done-layout>
                                {t('jobDone.layout', '"{{name}} 날짜 시각" 폴더 안에 원본 / WebP 두 폴더로 나눠 담아요 (씬 번호 이름, WebP 품질 {{q}}).', { name: presetName, q: quality })}
                            </p>
                        )}
                    </div>

                    <div className="rounded-lg border border-border/60 p-3" data-job-done-count>
                        {plan ? (
                            <>
                                <p className="text-xs font-medium">
                                    {t('jobDone.exportCount', '내보낼 씬 {{n}}개 · 원본 {{n}}장 + WebP {{n}}장', { n: plan.exports.length })}
                                </p>
                                {plan.emptyScenes.length > 0 && (
                                    <p className="mt-1 text-[11px] text-muted-foreground">{t('jobDone.emptyScenes', '이미지가 없는 씬 {{n}}개는 번호만 비워 둡니다.', { n: plan.emptyScenes.length })}</p>
                                )}
                            </>
                        ) : <p className="text-xs">{t('jobDone.noPreset', '작품을 찾지 못했어요.')}</p>}
                    </div>

                    {plan && plan.trims.length > 0 && (
                        <div className={confirming ? 'rounded-lg border-2 border-destructive/70 bg-destructive/5 p-3' : 'rounded-lg border border-border/60 p-3'} data-job-done-trims>
                            <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {t('jobDone.trimTitle', '최신 1장만 남기고 지울 씬 {{n}}개 · 총 {{d}}장 삭제', { n: plan.trims.length, d: plan.removeCount })}
                                {plan.favoriteRemoveCount > 0 && <span className="font-normal">{t('jobDone.trimFav', '(즐겨찾기 {{n}}장 포함)', { n: plan.favoriteRemoveCount })}</span>}
                            </p>
                            <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto pr-1 text-xs tabular-nums">
                                {plan.trims.map(trim => (
                                    <li key={trim.sceneId} className="flex items-center gap-2" data-job-done-trim>
                                        <span className="min-w-0 flex-1 truncate">{trim.sceneNumber}번 {trim.sceneName}</span>
                                        <span className="shrink-0 text-muted-foreground">{t('jobDone.trimRow', '{{total}}장 → 1장 ({{d}}장 삭제)', { total: trim.total, d: trim.remove.length })}</span>
                                        {trim.favoritesRemoved > 0 && <span className="flex shrink-0 items-center gap-0.5 text-yellow-500"><Star className="h-3 w-3 fill-current" />{trim.favoritesRemoved}</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {confirming && (
                        <p className="rounded-lg bg-destructive/15 p-3 text-center text-sm font-semibold text-destructive" data-job-done-confirm>
                            {t('jobDone.confirm', '위 {{d}}장을 정말 삭제할까요? 되돌릴 수 없습니다.', { d: plan?.removeCount ?? 0 })}
                        </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                        {t('jobDone.safety2', '원본 · WebP 두 파일이 다 만들어진 씬만 지웁니다. 내보내기에 실패한 씬은 그대로 둬요.')}
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => (confirming ? setConfirming(false) : onOpenChange(false))} disabled={running}>
                        {confirming ? t('jobDone.back', '아니요') : t('common.cancel', '취소')}
                    </Button>
                    <Button variant={confirming ? 'destructive' : 'default'} onClick={start} disabled={!canRun} data-job-done-run>
                        {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />}
                        {confirming ? t('jobDone.runDelete', '네, 삭제하고 완료') : t('jobDone.run', '작업완료')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
