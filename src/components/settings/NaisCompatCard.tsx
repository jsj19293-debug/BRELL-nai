import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, FolderSync, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/use-toast'
import { useSettingsStore } from '@/stores/settings-store'
import { isGenerationRunning, previewNaisCompat, runNaisCompat, type CompatPreview } from '@/services/nais-compat'

const KIND_LABEL: Record<string, string> = { scene: '씬', output: '메인 생성', library: '라이브러리', exif: 'EXIF 정리' }

/**
 * 설정 > 저장: NAIS 호환. 예전 NAIS 형식 폴더의 이미지를 Nightmare 형식 폴더로 옮기고,
 * 그 뒤로는 Nightmare 이름으로 저장한다.
 */
export function NaisCompatCard() {
    const { t } = useTranslation()
    const naming = useSettingsStore(state => state.storageNaming)
    const [preview, setPreview] = useState<CompatPreview | null>(null)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [running, setRunning] = useState(false)
    const done = naming === 'nightmare'

    useEffect(() => {
        if (done) return
        let cancelled = false
        void previewNaisCompat().then(value => { if (!cancelled) setPreview(value) }).catch(() => undefined)
        return () => { cancelled = true }
    }, [done])

    const handleRun = async () => {
        if (isGenerationRunning()) {
            toast({ title: t('naisCompat.busy', '생성 중에는 옮길 수 없습니다'), description: t('naisCompat.busyHelp', '생성이 끝난 뒤에 다시 눌러 주세요.'), variant: 'destructive' })
            return
        }
        setRunning(true)
        try {
            const result = await runNaisCompat()
            toast({
                title: t('naisCompat.done', 'Nightmare 형식으로 옮겼어요'),
                description: t('naisCompat.doneBody', '파일 {{n}}개를 옮겼습니다. 잠시 뒤 화면을 다시 불러옵니다.', { n: result.filesMoved.toLocaleString() }),
                variant: 'success',
            })
            // 히스토리 · 라이브러리 · 설정 화면이 새 위치를 읽도록 화면을 다시 불러온다.
            setTimeout(() => window.location.reload(), 1800)
        } catch (error) {
            console.error('NAIS compatibility move failed:', error)
            const message = String((error as { message?: unknown })?.message ?? error)
            toast({
                title: t('naisCompat.failed', '옮기지 못했습니다'),
                description: /already exists/i.test(message)
                    ? t('naisCompat.conflict', 'Nightmare 폴더에 같은 이름의 파일이 이미 있어서 아무것도 옮기지 않았습니다: {{message}}', { message })
                    : message,
                variant: 'destructive',
            })
            setRunning(false)
        }
    }

    return (
        <div className="space-y-3 rounded-xl border border-border/50 bg-card/30 p-6" data-nais-compat>
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <h4 className="flex items-center gap-2 text-sm font-medium">
                        <FolderSync className="h-4 w-4 text-muted-foreground" />
                        {t('naisCompat.title', 'NAIS 호환')}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                        {done
                            ? t('naisCompat.doneHelp', '이미 Nightmare 형식으로 저장하고 있습니다 (Nightmare_Scene, Nightmare_Output …).')
                            : t('naisCompat.help', 'NAIS 형식 폴더(NAIS_Scene, NAIS_Output …)에 저장돼 있던 이미지를 Nightmare 형식 폴더로 모두 옮기고, 앞으로는 Nightmare 이름으로 저장합니다. 씬 · 라이브러리 · 히스토리에 연결된 이미지 위치도 함께 고칩니다.')}
                    </p>
                </div>
                <Button onClick={() => setConfirmOpen(true)} disabled={done || running} className="shrink-0">
                    {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {done ? t('naisCompat.already', '옮김 완료') : t('naisCompat.run', 'Nightmare로 옮기기')}
                </Button>
            </div>
            {!done && preview && (
                <ul className="space-y-1 text-xs" data-nais-compat-list>
                    {preview.existing.length === 0 && (
                        <li className="text-muted-foreground">{t('naisCompat.nothing', '옮길 NAIS 폴더가 없습니다. 누르면 저장 형식만 Nightmare로 바뀝니다.')}</li>
                    )}
                    {preview.existing.map(move => (
                        <li key={move.sourcePath} className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">{KIND_LABEL[move.kind] || move.kind}</span>
                            <span className="break-all">{move.sourcePath}</span>
                            <ArrowRight className="h-3 w-3 shrink-0" />
                            <span className="break-all text-foreground">{move.destinationPath}</span>
                        </li>
                    ))}
                </ul>
            )}
            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={t('naisCompat.confirmTitle', 'NAIS 폴더를 Nightmare 폴더로 옮길까요?')}
                description={t('naisCompat.confirmBody', '폴더 {{n}}개의 내용을 옮깁니다. 이미지가 많으면 몇 분 걸릴 수 있고, 그동안 앱을 끄면 안 됩니다. 처음이면 NAIS_Scene 폴더를 다른 곳에 복사해 둔 뒤 진행하는 것을 권합니다.', { n: preview?.existing.length ?? 0 })}
                confirmText={t('naisCompat.run', 'Nightmare로 옮기기')}
                onConfirm={handleRun}
            />
        </div>
    )
}
