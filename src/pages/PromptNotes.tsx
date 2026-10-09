import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ArrowDown, ArrowUp, BookOpen, Check, Copy, Globe2, Languages, Loader2, NotebookPen, Pencil, Plus, Search, StickyNote, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tip } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { NoteImages } from '@/components/notes/NoteImages'
import { usePromptNotesStore } from '@/stores/prompt-notes-store'
import { useSettingsStore } from '@/stores/settings-store'
import {
    LORE_CONTENT_MAX_CHARS, LORE_KEYWORDS_MAX_CHARS, LORE_MAX_ENTRIES, LORE_TITLE_MAX_CHARS, MEMO_MAX_CHARS, MEMO_MAX_COUNT,
    MEMO_TITLE_MAX_CHARS, PROJECT_MAX_COUNT, PROJECT_NAME_MAX_CHARS, WORLD_MAX_CHARS,
    clampChars, countChars, filterLore, formatLoreEntry, formatProject, parseKeywords, totalLoreChars,
    type PromptProject,
} from '@/lib/prompt-notes'
import {
    FREE_ENGINE_MAX_CHARS, TRANSLATE_MAX_CHARS, TRANSLATE_TARGETS, TRANSLATE_TARGET_LABELS, describeTranslateError, pickEngine,
    type TranslateTarget,
} from '@/lib/translator'
import { translateKorean } from '@/services/translate-service'

type NotesTab = 'world' | 'lore' | 'memo' | 'translate'

const copyText = async (text: string, done: string) => {
    try {
        await navigator.clipboard.writeText(text)
        toast({ title: done, variant: 'success' })
    } catch (error) {
        toast({ title: '복사하지 못했어요', description: String(error), variant: 'destructive' })
    }
}

/** "1,234 / 10,000자" — 한도에 가까워지면 색이 바뀐다. */
function CharCounter({ count, max }: { count: number; max: number }) {
    const ratio = count / max
    return (
        <span className={cn(
            'shrink-0 text-xs tabular-nums',
            ratio >= 1 ? 'font-semibold text-destructive' : ratio >= 0.9 ? 'text-amber-500' : 'text-muted-foreground',
        )}>
            {count.toLocaleString()} / {max.toLocaleString()}자
        </span>
    )
}

function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
    return (
        <Button variant="outline" size="sm" className="h-8" disabled={!text.trim()} onClick={() => void copyText(text, done)}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            {label}
        </Button>
    )
}

// ---------------------------------------------------------------------------
// 세계관
// ---------------------------------------------------------------------------
function WorldTab({ project, onTranslate }: { project: PromptProject; onTranslate: (text: string) => void }) {
    const { t } = useTranslation()
    const setWorld = usePromptNotesStore(state => state.setWorld)
    const setWorldImages = usePromptNotesStore(state => state.setWorldImages)
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">{t('notes.world.help', '작품의 배경 · 설정 · 규칙을 적어 두세요. 자동으로 저장됩니다.')}</p>
                <div className="flex items-center gap-2">
                    <CharCounter count={countChars(project.world)} max={WORLD_MAX_CHARS} />
                    <Button variant="outline" size="sm" className="h-8" disabled={!project.world.trim()} onClick={() => onTranslate(project.world)}>
                        <Languages className="mr-1.5 h-3.5 w-3.5" />
                        {t('notes.toTranslator', '번역기로')}
                    </Button>
                    <CopyButton text={project.world} label={t('notes.copy', '복사')} done={t('notes.world.copied', '세계관을 복사했어요')} />
                </div>
            </div>
            <Textarea
                value={project.world}
                onChange={event => setWorld(project.id, event.target.value)}
                placeholder={t('notes.world.placeholder', '세계관을 적어 보세요 (최대 10,000자)')}
                className="min-h-0 flex-1 resize-none text-sm leading-relaxed"
                spellCheck={false}
            />
            <NoteImages images={project.worldImages} onChange={images => setWorldImages(project.id, images)} />
        </div>
    )
}

// ---------------------------------------------------------------------------
// 로어북
// ---------------------------------------------------------------------------
function LoreTab({ project, onTranslate }: { project: PromptProject; onTranslate: (text: string) => void }) {
    const { t } = useTranslation()
    const addLore = usePromptNotesStore(state => state.addLore)
    const updateLore = usePromptNotesStore(state => state.updateLore)
    const deleteLore = usePromptNotesStore(state => state.deleteLore)
    const moveLore = usePromptNotesStore(state => state.moveLore)
    const [selectedId, setSelectedId] = useState<string | null>(project.lore[0]?.id ?? null)
    const [query, setQuery] = useState('')
    const [deleteId, setDeleteId] = useState<string | null>(null)

    const visible = useMemo(() => filterLore(project.lore, query), [project.lore, query])
    const selected = project.lore.find(entry => entry.id === selectedId) ?? null
    const full = project.lore.length >= LORE_MAX_ENTRIES

    // 작품을 바꾸거나 고른 항목이 지워지면 첫 항목을 고른다.
    useEffect(() => {
        if (!project.lore.some(entry => entry.id === selectedId)) setSelectedId(project.lore[0]?.id ?? null)
    }, [project.id, project.lore, selectedId])

    const handleAdd = () => {
        const id = addLore(project.id)
        if (id) {
            setQuery('')
            setSelectedId(id)
        }
    }

    return (
        <div className="flex min-h-0 flex-1">
            <div className="flex w-72 shrink-0 flex-col border-r border-border/40">
                <div className="flex items-center gap-2 p-3">
                    <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('notes.lore.search', '제목 · 키워드 · 내용 검색')} className="h-8 pl-8 text-xs" />
                    </div>
                    <Tip content={full ? t('notes.lore.full', '로어북은 {{n}}개까지 만들 수 있어요', { n: LORE_MAX_ENTRIES }) : t('notes.lore.add', '항목 추가')}>
                        <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleAdd} disabled={full} aria-label={t('notes.lore.add', '항목 추가')}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </Tip>
                </div>
                <p className="px-3 pb-2 text-[11px] text-muted-foreground">
                    <span className={cn(full && 'font-semibold text-destructive')}>{project.lore.length} / {LORE_MAX_ENTRIES}</span>
                    {' · '}
                    {t('notes.lore.total', '내용 합계 {{n}}자', { n: totalLoreChars(project.lore).toLocaleString() })}
                </p>
                <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                    {visible.map(entry => {
                        const keywords = parseKeywords(entry.keywords)
                        return (
                            <li key={entry.id}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedId(entry.id)}
                                    className={cn(
                                        'mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors',
                                        entry.id === selectedId ? 'bg-primary/15 text-foreground' : 'hover:bg-muted/50',
                                    )}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="truncate text-sm font-medium">{entry.title.trim() || t('notes.untitled', '제목 없음')}</span>
                                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{countChars(entry.content)}</span>
                                    </span>
                                    <span className="block truncate text-[11px] text-muted-foreground">
                                        {keywords.length ? keywords.join(' · ') : t('notes.lore.noKeywords', '키워드 없음')}
                                    </span>
                                </button>
                            </li>
                        )
                    })}
                    {visible.length === 0 && (
                        <li className="px-3 py-8 text-center text-xs text-muted-foreground">
                            {project.lore.length === 0
                                ? t('notes.lore.empty', '+ 버튼으로 첫 항목을 만들어 보세요.')
                                : t('notes.lore.noMatch', '검색 결과가 없습니다.')}
                        </li>
                    )}
                </ul>
            </div>

            {selected ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                    <div className="flex items-center gap-2">
                        <Input
                            value={selected.title}
                            onChange={event => updateLore(project.id, selected.id, { title: clampChars(event.target.value, LORE_TITLE_MAX_CHARS) })}
                            placeholder={t('notes.lore.title', '제목')}
                            className="h-9 flex-1 font-medium"
                        />
                        <Tip content={t('notes.moveUp', '위로')}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveLore(project.id, selected.id, -1)} disabled={project.lore[0]?.id === selected.id}>
                                <ArrowUp className="h-4 w-4" />
                            </Button>
                        </Tip>
                        <Tip content={t('notes.moveDown', '아래로')}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveLore(project.id, selected.id, 1)} disabled={project.lore[project.lore.length - 1]?.id === selected.id}>
                                <ArrowDown className="h-4 w-4" />
                            </Button>
                        </Tip>
                        <Tip content={t('notes.delete', '삭제')}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteId(selected.id)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </Tip>
                    </div>
                    <div className="grid gap-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">{t('notes.lore.content', '내용')}</label>
                            <CharCounter count={countChars(selected.content)} max={LORE_CONTENT_MAX_CHARS} />
                        </div>
                        <Textarea
                            value={selected.content}
                            onChange={event => updateLore(project.id, selected.id, { content: clampChars(event.target.value, LORE_CONTENT_MAX_CHARS) })}
                            placeholder={t('notes.lore.contentPlaceholder', '이 항목의 설정을 적어 보세요 (최대 500자)')}
                            className="h-56 resize-none text-sm leading-relaxed"
                            spellCheck={false}
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground">{t('notes.lore.keywords', '키워드 (쉼표로 구분)')}</label>
                        <Input
                            value={selected.keywords}
                            onChange={event => updateLore(project.id, selected.id, { keywords: clampChars(event.target.value, LORE_KEYWORDS_MAX_CHARS) })}
                            placeholder={t('notes.lore.keywordsPlaceholder', '예: 엘프, 숲의 왕국, 세계수')}
                            className="h-9"
                        />
                        {parseKeywords(selected.keywords).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {parseKeywords(selected.keywords).map(keyword => (
                                    <span key={keyword} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{keyword}</span>
                                ))}
                            </div>
                        )}
                    </div>
                    <NoteImages images={selected.images} onChange={images => updateLore(project.id, selected.id, { images })} />
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-8" disabled={!selected.content.trim()} onClick={() => onTranslate(selected.content)}>
                            <Languages className="mr-1.5 h-3.5 w-3.5" />
                            {t('notes.toTranslator', '번역기로')}
                        </Button>
                        <CopyButton text={formatLoreEntry(selected)} label={t('notes.copy', '복사')} done={t('notes.lore.copied', '항목을 복사했어요')} />
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    {t('notes.lore.pick', '왼쪽에서 항목을 고르거나 새로 만드세요.')}
                </div>
            )}

            <ConfirmDialog
                open={deleteId !== null}
                onOpenChange={open => { if (!open) setDeleteId(null) }}
                title={t('notes.lore.deleteTitle', '이 로어북 항목을 삭제할까요?')}
                description={t('notes.deleteHelp', '삭제하면 되돌릴 수 없습니다. 붙여 둔 이미지 파일은 지워지지 않아요.')}
                confirmText={t('notes.delete', '삭제')}
                variant="destructive"
                onConfirm={() => { if (deleteId) deleteLore(project.id, deleteId) }}
            />
        </div>
    )
}

// ---------------------------------------------------------------------------
// 메모
// ---------------------------------------------------------------------------
function MemoTab({ project }: { project: PromptProject }) {
    const { t } = useTranslation()
    const addMemo = usePromptNotesStore(state => state.addMemo)
    const updateMemo = usePromptNotesStore(state => state.updateMemo)
    const deleteMemo = usePromptNotesStore(state => state.deleteMemo)
    const [selectedId, setSelectedId] = useState<string | null>(project.memos[0]?.id ?? null)
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const selected = project.memos.find(memo => memo.id === selectedId) ?? null
    const full = project.memos.length >= MEMO_MAX_COUNT

    useEffect(() => {
        if (!project.memos.some(memo => memo.id === selectedId)) setSelectedId(project.memos[0]?.id ?? null)
    }, [project.id, project.memos, selectedId])

    return (
        <div className="flex min-h-0 flex-1">
            <div className="flex w-64 shrink-0 flex-col border-r border-border/40">
                <div className="p-3">
                    <Button size="sm" className="h-8 w-full" disabled={full} onClick={() => { const id = addMemo(project.id); if (id) setSelectedId(id) }}>
                        <Plus className="mr-1 h-4 w-4" />
                        {t('notes.memo.add', '새 메모')}
                    </Button>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                    {project.memos.map(memo => (
                        <li key={memo.id}>
                            <button
                                type="button"
                                onClick={() => setSelectedId(memo.id)}
                                className={cn(
                                    'mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors',
                                    memo.id === selectedId ? 'bg-primary/15 text-foreground' : 'hover:bg-muted/50',
                                )}
                            >
                                <span className="block truncate text-sm font-medium">
                                    {memo.title.trim() || memo.content.trim().split('\n')[0] || t('notes.memo.untitled', '빈 메모')}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">{new Date(memo.updatedAt).toLocaleString()}</span>
                            </button>
                        </li>
                    ))}
                    {project.memos.length === 0 && (
                        <li className="px-3 py-8 text-center text-xs text-muted-foreground">{t('notes.memo.empty', '메모가 없습니다.')}</li>
                    )}
                </ul>
            </div>
            {selected ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
                    <div className="flex items-center gap-2">
                        <Input
                            value={selected.title}
                            onChange={event => updateMemo(project.id, selected.id, { title: clampChars(event.target.value, MEMO_TITLE_MAX_CHARS) })}
                            placeholder={t('notes.memo.title', '제목 (선택)')}
                            className="h-9 flex-1 font-medium"
                        />
                        <CharCounter count={countChars(selected.content)} max={MEMO_MAX_CHARS} />
                        <Tip content={t('notes.delete', '삭제')}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteId(selected.id)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </Tip>
                    </div>
                    <Textarea
                        value={selected.content}
                        onChange={event => updateMemo(project.id, selected.id, { content: clampChars(event.target.value, MEMO_MAX_CHARS) })}
                        placeholder={t('notes.memo.placeholder', '자유롭게 적어 두세요.')}
                        className="min-h-0 flex-1 resize-none text-sm leading-relaxed"
                        spellCheck={false}
                    />
                    <NoteImages images={selected.images} onChange={images => updateMemo(project.id, selected.id, { images })} />
                </div>
            ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                    {t('notes.memo.pick', '새 메모를 만들어 보세요.')}
                </div>
            )}
            <ConfirmDialog
                open={deleteId !== null}
                onOpenChange={open => { if (!open) setDeleteId(null) }}
                title={t('notes.memo.deleteTitle', '이 메모를 삭제할까요?')}
                description={t('notes.deleteHelp', '삭제하면 되돌릴 수 없습니다. 붙여 둔 이미지 파일은 지워지지 않아요.')}
                confirmText={t('notes.delete', '삭제')}
                variant="destructive"
                onConfirm={() => { if (deleteId) deleteMemo(project.id, deleteId) }}
            />
        </div>
    )
}

// ---------------------------------------------------------------------------
// 번역기: 한국어 → 영어 · 중국어 · 일본어
// ---------------------------------------------------------------------------
interface TranslateResult {
    status: 'idle' | 'loading' | 'done' | 'error'
    text: string
}

const idleResults = (): Record<TranslateTarget, TranslateResult> => ({
    en: { status: 'idle', text: '' },
    zh: { status: 'idle', text: '' },
    ja: { status: 'idle', text: '' },
})

function TranslateTab({ source, onSourceChange }: { source: string; onSourceChange: (text: string) => void }) {
    const { t } = useTranslation()
    const deeplApiKey = useSettingsStore(state => state.deeplApiKey)
    const setDeeplApiKey = useSettingsStore(state => state.setDeeplApiKey)
    const [keyDraft, setKeyDraft] = useState(deeplApiKey)
    const [targets, setTargets] = useState<Record<TranslateTarget, boolean>>({ en: true, zh: true, ja: true })
    const [results, setResults] = useState(idleResults)
    const engine = pickEngine(deeplApiKey)
    const count = countChars(source)
    const limit = engine === 'deepl' ? TRANSLATE_MAX_CHARS : FREE_ENGINE_MAX_CHARS
    const busy = TRANSLATE_TARGETS.some(target => results[target].status === 'loading')
    const chosen = TRANSLATE_TARGETS.filter(target => targets[target])

    const handleTranslate = async () => {
        if (!source.trim() || busy || chosen.length === 0) return
        setResults(current => {
            const next = { ...current }
            for (const target of chosen) next[target] = { status: 'loading', text: '' }
            return next
        })
        // 언어마다 따로 요청한다: 하나가 실패해도 나머지 결과는 보여준다.
        await Promise.all(chosen.map(async target => {
            try {
                const text = await translateKorean(source, target)
                setResults(current => ({ ...current, [target]: { status: 'done', text } }))
            } catch (error) {
                setResults(current => ({ ...current, [target]: { status: 'error', text: describeTranslateError(error) } }))
            }
        }))
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', engine === 'deepl' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                    {engine === 'deepl' ? 'DeepL' : t('notes.translate.freeEngine', '무료 번역')}
                </span>
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {engine === 'deepl'
                        ? t('notes.translate.deeplHelp', 'DeepL로 번역합니다. 한 번에 10,000자까지 됩니다.')
                        : t('notes.translate.freeHelp', '키 없이 쓰는 무료 번역입니다. 한 번에 1,000자까지, 하루 사용량이 작고 품질이 낮아요. DeepL 키(무료 요금제 월 50만 자)를 넣으면 긴 글도 잘 번역됩니다.')}
                </span>
                <Input
                    type="password"
                    value={keyDraft}
                    onChange={event => setKeyDraft(event.target.value)}
                    placeholder={t('notes.translate.keyPlaceholder', 'DeepL API 키 (선택)')}
                    className="h-8 w-56 text-xs"
                />
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={keyDraft.trim() === deeplApiKey}
                    onClick={() => {
                        setDeeplApiKey(keyDraft)
                        toast({ title: keyDraft.trim() ? t('notes.translate.keySaved', 'DeepL 키를 저장했어요') : t('notes.translate.keyCleared', 'DeepL 키를 지웠어요'), variant: 'success' })
                    }}
                >
                    {t('notes.translate.saveKey', '저장')}
                </Button>
            </div>

            <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">{t('notes.translate.source', '한국어 원문')}</label>
                    <CharCounter count={count} max={limit} />
                </div>
                <Textarea
                    value={source}
                    onChange={event => onSourceChange(clampChars(event.target.value, TRANSLATE_MAX_CHARS))}
                    placeholder={t('notes.translate.placeholder', '번역할 한국어 글을 넣으세요. 세계관 · 로어북의 "번역기로" 버튼으로 가져올 수도 있어요.')}
                    className="h-44 resize-none text-sm leading-relaxed"
                    spellCheck={false}
                />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {TRANSLATE_TARGETS.map(target => (
                    <button
                        key={target}
                        type="button"
                        aria-pressed={targets[target]}
                        onClick={() => setTargets(current => ({ ...current, [target]: !current[target] }))}
                        className={cn(
                            'flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors',
                            targets[target] ? 'border-primary bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted/50',
                        )}
                    >
                        {targets[target] && <Check className="h-3.5 w-3.5" />}
                        {TRANSLATE_TARGET_LABELS[target]}
                    </button>
                ))}
                <Button className="ml-auto h-8" size="sm" onClick={() => void handleTranslate()} disabled={!source.trim() || busy || chosen.length === 0 || count > limit}>
                    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Languages className="mr-1.5 h-4 w-4" />}
                    {t('notes.translate.run', '번역')}
                </Button>
            </div>
            {count > limit && (
                <p className="text-xs text-destructive">
                    {t('notes.translate.tooLong', '무료 번역은 1,000자까지 됩니다. 글을 줄이거나 DeepL 키를 넣어 주세요.')}
                </p>
            )}

            <div className="grid gap-3 xl:grid-cols-3">
                {chosen.map(target => {
                    const result = results[target]
                    return (
                        <div key={target} className="flex min-h-[9rem] flex-col rounded-xl border border-border/50 bg-card/40">
                            <div className="flex items-center justify-between border-b border-border/40 px-3 py-1.5">
                                <span className="text-xs font-medium">{TRANSLATE_TARGET_LABELS[target]}</span>
                                <div className="flex items-center gap-2">
                                    {result.status === 'done' && <span className="text-[11px] tabular-nums text-muted-foreground">{countChars(result.text).toLocaleString()}자</span>}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        disabled={result.status !== 'done'}
                                        onClick={() => void copyText(result.text, t('notes.translate.copied', '번역문을 복사했어요'))}
                                        aria-label={t('notes.copy', '복사')}
                                    >
                                        <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                            <div className={cn('max-h-80 flex-1 overflow-y-auto whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed', result.status === 'error' && 'text-destructive', result.status === 'idle' && 'text-muted-foreground')}>
                                {result.status === 'loading' && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                {result.status === 'idle' && t('notes.translate.waiting', '번역 결과가 여기에 나옵니다.')}
                                {(result.status === 'done' || result.status === 'error') && result.text}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// 프롬프트 관리 화면
// ---------------------------------------------------------------------------
export default function PromptNotes() {
    const { t } = useTranslation()
    const projects = usePromptNotesStore(state => state.projects)
    const activeProjectId = usePromptNotesStore(state => state.activeProjectId)
    const addProject = usePromptNotesStore(state => state.addProject)
    const renameProject = usePromptNotesStore(state => state.renameProject)
    const deleteProject = usePromptNotesStore(state => state.deleteProject)
    const setActiveProject = usePromptNotesStore(state => state.setActiveProject)

    const [tab, setTab] = useState<NotesTab>('world')
    const [newName, setNewName] = useState('')
    const [renaming, setRenaming] = useState<string | null>(null)
    const [renameDraft, setRenameDraft] = useState('')
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [translateSource, setTranslateSource] = useState('')

    const project = projects.find(candidate => candidate.id === activeProjectId) ?? projects[0] ?? null

    const handleAddProject = () => {
        if (!newName.trim()) return
        if (addProject(newName)) setNewName('')
        else toast({ title: t('notes.projectsFull', '작품은 {{n}}개까지 만들 수 있어요', { n: PROJECT_MAX_COUNT }) })
    }
    const sendToTranslator = (text: string) => {
        setTranslateSource(clampChars(text, TRANSLATE_MAX_CHARS))
        setTab('translate')
    }

    const tabs: Array<{ id: NotesTab; label: string; icon: typeof Globe2; badge?: string }> = [
        { id: 'world', label: t('notes.tab.world', '세계관'), icon: Globe2 },
        { id: 'lore', label: t('notes.tab.lore', '로어북'), icon: BookOpen, badge: project ? `${project.lore.length}/${LORE_MAX_ENTRIES}` : undefined },
        { id: 'memo', label: t('notes.tab.memo', '메모'), icon: StickyNote, badge: project && project.memos.length > 0 ? String(project.memos.length) : undefined },
        { id: 'translate', label: t('notes.tab.translate', '번역기'), icon: Languages },
    ]

    return (
        <div className="flex h-full min-h-0 gap-3 p-3">
            {/* 작품 목록 */}
            <aside className="flex w-60 shrink-0 flex-col rounded-2xl border border-border/60 bg-card/40">
                <h1 className="flex items-center gap-2 border-b border-border/40 px-4 py-3 text-sm font-semibold">
                    <NotebookPen className="h-4 w-4 text-muted-foreground" />
                    {t('notes.title', '프롬프트 관리')}
                </h1>
                <form
                    className="flex items-center gap-2 p-3"
                    onSubmit={event => {
                        event.preventDefault()
                        handleAddProject()
                    }}
                >
                    <Input
                        value={newName}
                        onChange={event => setNewName(clampChars(event.target.value, PROJECT_NAME_MAX_CHARS))}
                        placeholder={t('notes.newProject', '새 작품 이름')}
                        className="h-8 min-w-0 flex-1 text-xs"
                    />
                    <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={!newName.trim()} aria-label={t('notes.addProject', '작품 추가')}>
                        <Plus className="h-4 w-4" />
                    </Button>
                </form>
                <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                    {projects.map(item => (
                        <li key={item.id} className="group relative mb-1">
                            {renaming === item.id ? (
                                <form
                                    onSubmit={event => {
                                        event.preventDefault()
                                        renameProject(item.id, renameDraft)
                                        setRenaming(null)
                                    }}
                                >
                                    <Input
                                        autoFocus
                                        value={renameDraft}
                                        onChange={event => setRenameDraft(clampChars(event.target.value, PROJECT_NAME_MAX_CHARS))}
                                        onBlur={() => { renameProject(item.id, renameDraft); setRenaming(null) }}
                                        onKeyDown={event => { if (event.key === 'Escape') setRenaming(null) }}
                                        className="h-9 text-sm"
                                    />
                                </form>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setActiveProject(item.id)}
                                        className={cn(
                                            'w-full rounded-lg px-3 py-2 pr-16 text-left transition-colors',
                                            item.id === project?.id ? 'bg-primary/15 text-foreground' : 'hover:bg-muted/50',
                                        )}
                                    >
                                        <span className="block truncate text-sm font-medium">{item.name}</span>
                                        <span className="block truncate text-[11px] text-muted-foreground">
                                            {t('notes.projectSummary', '세계관 {{world}}자 · 로어 {{lore}}개', { world: countChars(item.world).toLocaleString(), lore: item.lore.length })}
                                        </span>
                                    </button>
                                    <span className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => { setRenameDraft(item.name); setRenaming(item.id) }} aria-label={t('notes.rename', '이름 바꾸기')}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button type="button" className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => setDeleteId(item.id)} aria-label={t('notes.delete', '삭제')}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </span>
                                </>
                            )}
                        </li>
                    ))}
                    {projects.length === 0 && (
                        <li className="px-3 py-8 text-center text-xs text-muted-foreground">
                            {t('notes.noProjects', '위에 작품 이름을 넣고 +를 눌러 시작하세요.')}
                        </li>
                    )}
                </ul>
            </aside>

            {/* 본문 */}
            <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-border/60 bg-card/40">
                <div className="flex items-center gap-1 border-b border-border/40 px-3 py-2">
                    {tabs.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setTab(item.id)}
                            aria-pressed={tab === item.id}
                            className={cn(
                                'flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors',
                                tab === item.id ? 'bg-primary/15 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                            )}
                        >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                            {item.badge && <span className="text-[11px] tabular-nums opacity-70">{item.badge}</span>}
                        </button>
                    ))}
                    {project && tab !== 'translate' && (
                        <div className="ml-auto flex items-center gap-2">
                            <span className="max-w-[16rem] truncate text-xs text-muted-foreground">{project.name}</span>
                            <CopyButton text={formatProject(project)} label={t('notes.copyAll', '전체 복사')} done={t('notes.copiedAll', '세계관과 로어북을 복사했어요')} />
                        </div>
                    )}
                </div>
                {tab === 'translate' ? (
                    <TranslateTab source={translateSource} onSourceChange={setTranslateSource} />
                ) : !project ? (
                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                        {t('notes.pickProject', '왼쪽에서 작품을 만들면 세계관 · 로어북 · 메모를 적을 수 있어요.')}
                    </div>
                ) : tab === 'world' ? (
                    <WorldTab key={project.id} project={project} onTranslate={sendToTranslator} />
                ) : tab === 'lore' ? (
                    <LoreTab key={project.id} project={project} onTranslate={sendToTranslator} />
                ) : (
                    <MemoTab key={project.id} project={project} />
                )}
            </section>

            <ConfirmDialog
                open={deleteId !== null}
                onOpenChange={open => { if (!open) setDeleteId(null) }}
                title={t('notes.deleteProjectTitle', '이 작품의 세계관 · 로어북 · 메모를 모두 삭제할까요?')}
                description={t('notes.deleteHelp', '삭제하면 되돌릴 수 없습니다. 붙여 둔 이미지 파일은 지워지지 않아요.')}
                confirmText={t('notes.delete', '삭제')}
                variant="destructive"
                onConfirm={() => { if (deleteId) deleteProject(deleteId) }}
            />
        </div>
    )
}
