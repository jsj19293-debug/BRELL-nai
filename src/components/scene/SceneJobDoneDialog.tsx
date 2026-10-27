import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { FolderOpen, FolderSearch, Loader2, PackageCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { useJobDoneStore } from '@/stores/job-done-store'
import { useSceneStore } from '@/stores/scene-store'
import { finishSceneJob, summarizeJob, type JobDoneSummary } from '@/services/scene-job-done'
import { openFolder } from '@/lib/rell-folders'

/**
 * 씬 모드 "작업완료하기": 작품 폴더의 결과물을 보관 폴더로 모으고 씬 폴더를 비운다.
 */
export function SceneJobDoneDialog({ open, onOpenChange, presetId }: { open: boolean; onOpenChange: (open: boolean) => void; presetId: string }) {
    const { t } = useTranslation()
    const archiveFolder = useJobDoneStore(state => state.archiveFolder)
    const setArchiveFolder = useJobDoneStore(state => state.setArchiveFolder)
    const presetName = useSceneStore(state => state.presets.find(preset => preset.id === presetId)?.name ?? '')
    const [summary, setSummary] = useState<JobDoneSummary | null>(null)
    const [running, setRunning] = useState(false)

    useEffect(() => {
        if (!open) return
        let cancelled = false
        setSummary(null)
        void summarizeJob(presetId).then(result => { if (!cancelled) setSummary(result) }).catch(() => undefined)
        return () => { cancelled = true }
    }, [open, presetId])

    const pickArchive = async () => {
        const selected = await openDialog({ directory: true, multiple: false, defaultPath: archiveFolder || undefined }).catch(() => null)
        if (selected && typeof selected === 'string') setArchiveFolder(selected)
    }

    const run = async () => {
        setRunning(true)
        try {
            const result = await finishSceneJob(presetId, archiveFolder)
            if (result.ok) {
                toast({
                    title: t('jobDone.done', '작업완료: 파일 {{n}}개를 모았어요', { n: result.filesMoved }),
                    description: result.cleanupFailures > 0
                        ? t('jobDone.partial', '{{dest}} · 원본 {{n}}개는 지우지 못해 그대로 남았어요', { dest: result.jobFolder, n: result.cleanupFailures })
                        : result.jobFolder,
                    variant: 'success',
                })
                onOpenChange(false)
                return
            }
            const message = {
                busy: t('jobDone.busy', '생성 중이거나 예약이 남아 있어요. 끝난 뒤에 눌러 주세요.'),
                'no-preset': t('jobDone.noPreset', '작품을 찾지 못했어요.'),
                'no-archive': t('jobDone.noArchive', '모아 둘 폴더를 먼저 골라 주세요.'),
                nothing: t('jobDone.nothing', '작품 폴더가 없어요. 옮길 것이 없습니다.'),
                'destination-inside-work': t('jobDone.insideWork', '모아 둘 폴더가 작품 폴더 안에 있어요. 다른 폴더를 골라 주세요.'),
                'work-inside-destination': t('jobDone.insideDest', '작품 폴더가 모아 둘 폴더 안에 있어요. 다른 폴더를 골라 주세요.'),
                failed: t('jobDone.failed', '옮기지 못했어요. 원본은 그대로 있습니다.'),
            }[result.reason]
            toast({ title: message, description: result.error, variant: 'destructive' })
        } finally {
            setRunning(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(next: boolean) => { if (!running) onOpenChange(next) }}>
            <DialogContent className="sm:max-w-lg" data-job-done>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary" />{t('jobDone.title', '작업완료하기')}</DialogTitle>
                    <DialogDescription>
                        {t('jobDone.desc', '"{{name}}" 작품 폴더 안의 이미지 · 폴더를 전부 아래 폴더로 모으고, 씬 폴더는 빈 채로 다시 만들어 둡니다. 씬과 프롬프트는 그대로이고 씬의 이미지 목록만 비워집니다.', { name: presetName })}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 text-sm">
                    <div className="rounded-lg border border-border/60 p-3">
                        <p className="text-xs text-muted-foreground">{t('jobDone.from', '옮길 작품 폴더')}</p>
                        <p className="mt-0.5 break-all text-xs" data-job-done-source>{summary?.presetFolder ?? '…'}</p>
                        <p className="mt-1.5 text-xs font-medium" data-job-done-count>
                            {summary ? t('jobDone.count', '하위 폴더 {{folders}}개 · 이미지 {{images}}장', { folders: summary.folders, images: summary.images }) : t('jobDone.counting', '세는 중…')}
                        </p>
                    </div>
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
                            <p className="mt-1.5 text-[11px] text-muted-foreground">{t('jobDone.into', '그 안에 "{{name}} 날짜 시각" 폴더를 새로 만들어 넣어요.', { name: presetName })}</p>
                        )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        {t('jobDone.safety', '전부 복사하고 크기까지 확인한 다음에 원본을 지웁니다. 중간에 실패하면 원본은 그대로 남아요.')}
                    </p>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>{t('common.cancel', '취소')}</Button>
                    <Button onClick={() => void run()} disabled={running || !archiveFolder || summary?.images === 0 && summary?.folders === 0} data-job-done-run>
                        {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />}
                        {t('jobDone.run', '작업완료')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
