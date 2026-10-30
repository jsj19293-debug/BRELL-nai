import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Check, FolderSearch, FolderSync, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useSceneStore } from '@/stores/scene-store'
import { applySceneOverwrite, defaultOverwriteSource, scanOverwriteSource } from '@/services/scene-overwrite'
import type { OverwriteMatch } from '@/lib/scene-overwrite'

/**
 * 씬 덮어씌우기: 폴더를 고르면 그 안의 씬 폴더를 이름(없으면 번호)으로 씬과 짝지어 보여 주고,
 * 체크한 씬에 그 폴더의 이미지를 넣는다. 파일은 그대로 둔다.
 */
export function SceneOverwriteDialog({ open, onOpenChange, presetId }: { open: boolean; onOpenChange: (open: boolean) => void; presetId: string }) {
    const { t } = useTranslation()
    const presetName = useSceneStore(state => state.presets.find(preset => preset.id === presetId)?.name ?? '')
    const isGenerating = useSceneStore(state => state.isGenerating)
    const [source, setSource] = useState('')
    const [matches, setMatches] = useState<OverwriteMatch[] | null>(null)
    const [checked, setChecked] = useState<Set<string>>(new Set())
    const [running, setRunning] = useState(false)

    const scan = useCallback(async (folder: string) => {
        setSource(folder)
        setMatches(null)
        try {
            const found = await scanOverwriteSource(presetId, folder)
            setMatches(found)
            setChecked(new Set(found.filter(match => match.folder).map(match => match.sceneId)))
        } catch (error) {
            setMatches([])
            toast({ title: t('sceneOverwrite.scanFailed', '폴더를 읽지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }, [presetId, t])

    useEffect(() => {
        if (!open) return
        void defaultOverwriteSource(presetId).then(folder => { if (folder) void scan(folder) })
    }, [open, presetId, scan])

    const pick = async () => {
        const selected = await openDialog({ directory: true, multiple: false, defaultPath: source || undefined }).catch(() => null)
        if (selected && typeof selected === 'string') void scan(selected)
    }

    const matchedIds = useMemo(() => (matches ?? []).filter(match => match.folder).map(match => match.sceneId), [matches])
    const allChecked = matchedIds.length > 0 && matchedIds.every(id => checked.has(id))
    const toggle = (id: string) => setChecked(current => {
        const next = new Set(current)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })

    const run = async () => {
        if (!matches) return
        setRunning(true)
        try {
            const result = await applySceneOverwrite(presetId, matches.filter(match => checked.has(match.sceneId)))
            toast({ title: t('sceneOverwrite.done', '씬 {{s}}개에 이미지 {{n}}장을 넣었어요', { s: result.scenes, n: result.images }), variant: 'success' })
            onOpenChange(false)
        } catch (error) {
            toast({ title: t('sceneOverwrite.failed', '덮어씌우지 못했어요'), description: String(error), variant: 'destructive' })
        } finally {
            setRunning(false)
        }
    }

    const selectedCount = matchedIds.filter(id => checked.has(id)).length

    return (
        <Dialog open={open} onOpenChange={(next: boolean) => { if (!running) onOpenChange(next) }}>
            <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl" data-scene-overwrite>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><FolderSync className="h-5 w-5 text-primary" />{t('sceneOverwrite.title', '씬 덮어씌우기')}</DialogTitle>
                    <DialogDescription>
                        {t('sceneOverwrite.desc', '고른 폴더 안의 씬 폴더를 "{{name}}"의 씬과 이름(없으면 맨 앞 번호)으로 맞춰서, 체크한 씬에 그 폴더의 이미지를 넣습니다. 파일은 옮기거나 지우지 않아요.', { name: presetName })}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-2 rounded-lg border border-border/60 p-2.5">
                    <p className="min-w-0 flex-1 break-all text-xs" data-scene-overwrite-source>{source || '…'}</p>
                    <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => void pick()} disabled={running}>
                        <FolderSearch className="mr-1.5 h-3.5 w-3.5" />
                        {t('sceneOverwrite.pick', '다른 폴더')}
                    </Button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground" data-scene-overwrite-summary>
                        {matches ? t('sceneOverwrite.summary', '씬 {{total}}개 중 {{m}}개 폴더 찾음', { total: matches.length, m: matchedIds.length }) : t('sceneOverwrite.scanning', '폴더 읽는 중…')}
                    </span>
                    <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" disabled={matchedIds.length === 0 || running}
                        onClick={() => setChecked(allChecked ? new Set() : new Set(matchedIds))}>
                        {allChecked ? t('sceneOverwrite.none', '모두 해제') : t('sceneOverwrite.all', '찾은 씬 모두 선택')}
                    </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60">
                    {matches === null ? (
                        <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : matches.length === 0 ? (
                        <p className="py-10 text-center text-xs text-muted-foreground">{t('sceneOverwrite.empty', '이 작품에 씬이 없어요.')}</p>
                    ) : (
                        <ul className="divide-y divide-border/40 text-xs">
                            {matches.map(match => {
                                const isChecked = checked.has(match.sceneId)
                                return (
                                    <li key={match.sceneId}>
                                        <button
                                            type="button"
                                            disabled={!match.folder || running}
                                            onClick={() => toggle(match.sceneId)}
                                            className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left', match.folder ? 'hover:bg-muted/40' : 'opacity-45')}
                                            data-scene-overwrite-row
                                        >
                                            <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', isChecked && match.folder ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
                                                {isChecked && match.folder && <Check className="h-3 w-3" />}
                                            </span>
                                            <span className="w-8 shrink-0 tabular-nums text-muted-foreground">{match.sceneNumber}</span>
                                            <span className="min-w-0 flex-1 truncate">{match.sceneName}</span>
                                            <span className="max-w-[45%] shrink-0 truncate text-right text-muted-foreground">
                                                {match.folder
                                                    ? `← ${match.folder.name} · ${t('sceneOverwrite.images', '{{n}}장', { n: match.folder.imageCount })}${match.by === 'number' ? ` (${t('sceneOverwrite.byNumber', '번호로 찾음')})` : ''}`
                                                    : t('sceneOverwrite.noFolder', '맞는 폴더 없음')}
                                            </span>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>{t('common.cancel', '취소')}</Button>
                    <Button onClick={() => void run()} disabled={running || selectedCount === 0 || isGenerating} data-scene-overwrite-run>
                        {running ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FolderSync className="mr-1.5 h-4 w-4" />}
                        {t('sceneOverwrite.run', '덮어씌우기 ({{n}}개 씬)', { n: selectedCount })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
