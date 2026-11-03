import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Pencil, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { usePostprocessStore } from '@/stores/postprocess-store'

/** 후처리 템플릿 관리: 이름 바꾸기 · 지우기. 지우면 그 템플릿을 쓰던 씬 지정도 풀린다. */
export function PostprocessTemplateManager({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const { t } = useTranslation()
    const templates = usePostprocessStore(state => state.templates)
    const sceneTemplates = usePostprocessStore(state => state.sceneTemplates)
    const renameTemplate = usePostprocessStore(state => state.renameTemplate)
    const deleteTemplate = usePostprocessStore(state => state.deleteTemplate)
    const [editing, setEditing] = useState<string | null>(null)
    const [draft, setDraft] = useState('')
    /** 한 번 더 누르면 지운다 */
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
    const usage = (id: string) => Object.values(sceneTemplates).reduce((sum, scenes) => sum + Object.values(scenes).filter(value => value === id).length, 0)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg" data-postprocess-manager>
                <DialogHeader>
                    <DialogTitle>{t('postprocess.managerTitle', '후처리 템플릿')}</DialogTitle>
                    <DialogDescription>{t('postprocess.managerDesc', '템플릿을 지우면 그 템플릿을 지정해 둔 씬도 지정이 풀려요.')}</DialogDescription>
                </DialogHeader>
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                    {templates.map(template => (
                        <li key={template.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-2" data-postprocess-manager-row>
                            {template.thumbnail
                                ? <img src={template.thumbnail} alt="" className="h-16 w-12 shrink-0 rounded object-cover" />
                                : <div className="h-16 w-12 shrink-0 rounded bg-muted" />}
                            <div className="min-w-0 flex-1">
                                {editing === template.id ? (
                                    <Input value={draft} autoFocus onChange={event => setDraft(event.target.value)} onKeyDown={event => {
                                        if (event.key === 'Enter') { renameTemplate(template.id, draft); setEditing(null) }
                                        if (event.key === 'Escape') setEditing(null)
                                    }} className="h-8 text-sm" />
                                ) : <p className="truncate text-sm font-medium">{template.name}</p>}
                                <p className="text-[11px] text-muted-foreground">
                                    {template.width}×{template.height} · {t('postprocess.usedBy', '씬 {{n}}개에 지정', { n: usage(template.id) })}
                                </p>
                            </div>
                            {editing === template.id ? (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { renameTemplate(template.id, draft); setEditing(null) }}><Check className="h-4 w-4" /></Button>
                            ) : (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(template.id); setDraft(template.name) }}><Pencil className="h-4 w-4" /></Button>
                            )}
                            {confirmDelete === template.id ? (
                                <Button variant="destructive" size="sm" className="h-8 px-2 text-xs" onClick={() => { deleteTemplate(template.id); setConfirmDelete(null) }}>
                                    {t('postprocess.deleteConfirm2', '정말 지우기')}
                                </Button>
                            ) : (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(template.id)}><Trash2 className="h-4 w-4" /></Button>
                            )}
                        </li>
                    ))}
                    {templates.length === 0 && <li className="py-8 text-center text-xs text-muted-foreground">{t('postprocess.noTemplates', '저장한 템플릿 없음')}</li>}
                </ul>
            </DialogContent>
        </Dialog>
    )
}
