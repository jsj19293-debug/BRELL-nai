import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { convertFileSrc } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { exists, mkdir, readFile, remove, writeFile } from '@tauri-apps/plugin-fs'
import { ArrowLeft, ChevronLeft, ChevronRight, FolderOpen, FolderSearch, Loader2, RefreshCw, RotateCcw, Save, ShieldCheck, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { CensorEditor, type CensorEditorHandle } from '@/components/censor/CensorEditor'
import { useCensorStore } from '@/stores/censor-store'
import { listImageFiles, listWorkFolders, openFolder, resolveWorkRoot, type WorkFolder } from '@/lib/rell-folders'
import { pathKey, type FolderFile } from '@/lib/scene-folder-sync'
import {
    CENSOR_FOLDER_NAME, censorOutput, censorStatus, reviewKeyDelta, sortByName, stepIndex, summarizeCensor, type CensorStatus,
} from '@/lib/censor-review'

const EMPTY: string[] = []

const mimeOf = (name: string) => censorOutput(name).mime
const folderName = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path

const STATUS_CLASS: Record<CensorStatus, string> = {
    none: 'border-border/50',
    viewed: 'border-blue-500 shadow-[0_0_0_1px_rgb(59_130_246_/_0.8)]',
    censored: 'border-red-500 shadow-[0_0_0_1px_rgb(239_68_68_/_0.8)]',
}

/**
 * 검열 탭: 폴더의 이미지를 모두 띄우고, 한 장씩 열어 < > 키로 넘기며 검수한다.
 * 넘겨 보기만 한 것은 파란 테두리, 칠해서 저장한 것은 붉은 테두리. 칠한 이미지는 그 폴더 안의 "검열본" 폴더에
 * 같은 이름으로 저장하고 원본은 건드리지 않는다.
 */
export default function CensorReview() {
    const { t } = useTranslation()
    const folderPath = useCensorStore(state => state.folderPath)
    const setFolderPath = useCensorStore(state => state.setFolderPath)
    const brush = useCensorStore(state => state.brush)
    const setBrush = useCensorStore(state => state.setBrush)
    const markViewed = useCensorStore(state => state.markViewed)
    const clearViewed = useCensorStore(state => state.clearViewed)
    const folderKey = pathKey(folderPath)
    const viewedList = useCensorStore(state => state.viewed[folderKey] ?? EMPTY)

    const [workFolders, setWorkFolders] = useState<WorkFolder[]>([])
    const [files, setFiles] = useState<FolderFile[]>([])
    const [censoredNames, setCensoredNames] = useState<Set<string>>(new Set())
    /** 이번에 저장한 검열본의 미리보기 (파일 이름 → blob 주소). 같은 주소의 이미지는 화면이 새로 읽지 않기 때문에 따로 둔다. */
    const [freshThumbs, setFreshThumbs] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(false)
    const [index, setIndex] = useState<number | null>(null)
    const [source, setSource] = useState<string | null>(null)
    const [reloadKey, setReloadKey] = useState(0)
    const [edited, setEdited] = useState(false)
    const [saving, setSaving] = useState(false)
    const editorRef = useRef<CensorEditorHandle>(null)
    const busyRef = useRef(false)
    const freshThumbsRef = useRef<Record<string, string>>({})
    freshThumbsRef.current = freshThumbs

    const viewedNames = useMemo(() => new Set(viewedList), [viewedList])
    const summary = useMemo(() => summarizeCensor(files.map(file => file.name), censoredNames, viewedNames), [files, censoredNames, viewedNames])
    const current = index !== null ? files[index] ?? null : null
    const currentStatus = current ? censorStatus(current.name, censoredNames, viewedNames) : 'none'

    const censorFolderOf = useCallback((path: string) => join(path, CENSOR_FOLDER_NAME), [])

    const reloadWorkFolders = useCallback(async () => {
        try {
            setWorkFolders(await listWorkFolders(await resolveWorkRoot()))
        } catch (error) {
            console.error('Failed to list work folders:', error)
        }
    }, [])

    const loadFolder = useCallback(async (path: string) => {
        if (!path) {
            setFiles([])
            setCensoredNames(new Set())
            return
        }
        setLoading(true)
        try {
            const [originals, censored] = await listImageFiles([path, await censorFolderOf(path)])
            setFiles(sortByName(originals?.files ?? []))
            setCensoredNames(new Set((censored?.files ?? []).map(file => file.name.toLowerCase())))
        } catch (error) {
            console.error('Failed to read the folder:', error)
            setFiles([])
            setCensoredNames(new Set())
            toast({ title: t('censor.loadFailed', '폴더를 읽지 못했어요'), description: String(error), variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }, [censorFolderOf, t])

    useEffect(() => { void reloadWorkFolders() }, [reloadWorkFolders])

    // 폴더가 바뀌면 목록을 새로 읽는다.
    useEffect(() => {
        setIndex(null)
        setFreshThumbs(previous => {
            Object.values(previous).forEach(url => URL.revokeObjectURL(url))
            return {}
        })
        void loadFolder(folderPath)
    }, [folderPath, loadFolder])

    useEffect(() => () => { Object.values(freshThumbsRef.current).forEach(url => URL.revokeObjectURL(url)) }, [])

    // 고른 이미지를 연다. 이미 검열본이 있으면 그 위에서 이어서 칠한다.
    useEffect(() => {
        if (!current) {
            setSource(null)
            return
        }
        let cancelled = false
        let created: string | null = null
        void (async () => {
            try {
                const output = censorOutput(current.name)
                const censoredPath = await join(await censorFolderOf(folderPath), output.name)
                const useCensored = censoredNames.has(output.name.toLowerCase())
                const bytes = await readFile(useCensored ? censoredPath : current.path)
                if (cancelled) return
                created = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mimeOf(current.name) }))
                setSource(created)
            } catch (error) {
                console.error('Failed to open the image:', error)
                if (!cancelled) {
                    setSource(null)
                    toast({ title: t('censor.openFailed', '이미지를 열지 못했어요'), description: String(error), variant: 'destructive' })
                }
            }
        })()
        return () => {
            cancelled = true
            if (created) URL.revokeObjectURL(created)
        }
        // censoredNames 는 일부러 뺀다: 저장할 때마다 다시 여는 것을 막는다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current?.path, folderPath, reloadKey])

    /** 지금 이미지를 마무리한다: 칠했으면 검열본으로 저장(붉은색), 아니면 확인함(파란색). */
    const commit = useCallback(async (): Promise<boolean> => {
        if (!current || !folderPath) return true
        if (busyRef.current) return false
        busyRef.current = true
        try {
            const output = censorOutput(current.name)
            const bytes = await editorRef.current?.exportIfEdited(output.mime) ?? null
            if (bytes) {
                setSaving(true)
                const folder = await censorFolderOf(folderPath)
                if (!(await exists(folder))) await mkdir(folder, { recursive: true })
                await writeFile(await join(folder, output.name), bytes)
                const key = output.name.toLowerCase()
                setCensoredNames(previous => new Set(previous).add(key))
                setFreshThumbs(previous => {
                    if (previous[key]) URL.revokeObjectURL(previous[key])
                    return { ...previous, [key]: URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: output.mime })) }
                })
            }
            markViewed(folderKey, current.name)
            return true
        } catch (error) {
            console.error('Failed to save the censored image:', error)
            toast({ title: t('censor.saveFailed', '검열본을 저장하지 못했어요'), description: String(error), variant: 'destructive' })
            return false
        } finally {
            setSaving(false)
            busyRef.current = false
        }
    }, [censorFolderOf, current, folderKey, folderPath, markViewed, t])

    const go = useCallback(async (delta: number) => {
        if (index === null) return
        if (!(await commit())) return
        const next = stepIndex(index, delta, files.length)
        if (next === null) {
            // 끝: 저장은 했으니 화면만 다시 맞춘다.
            setReloadKey(value => value + 1)
            toast({ title: delta > 0 ? t('censor.last', '마지막 이미지입니다') : t('censor.first', '첫 이미지입니다') })
            return
        }
        setIndex(next)
    }, [commit, files.length, index, t])

    const backToList = useCallback(async () => {
        if (!(await commit())) return
        setIndex(null)
    }, [commit])

    const saveNow = useCallback(async () => {
        if (!editorRef.current?.isEdited()) return
        if (await commit()) {
            setReloadKey(value => value + 1)
            toast({ title: t('censor.saved', '검열본을 저장했어요'), variant: 'success' })
        }
    }, [commit, t])

    /** 검열본을 지우고 원본 상태로 되돌린다. */
    const revertToOriginal = useCallback(async () => {
        if (!current || !folderPath || busyRef.current) return
        try {
            const output = censorOutput(current.name)
            const path = await join(await censorFolderOf(folderPath), output.name)
            if (await exists(path)) await remove(path)
            const key = output.name.toLowerCase()
            setCensoredNames(previous => {
                const next = new Set(previous)
                next.delete(key)
                return next
            })
            setFreshThumbs(previous => {
                if (!previous[key]) return previous
                URL.revokeObjectURL(previous[key])
                const next = { ...previous }
                delete next[key]
                return next
            })
            // censoredNames 가 바뀐 다음에 원본을 다시 읽도록 한 박자 늦춘다.
            window.setTimeout(() => setReloadKey(value => value + 1), 0)
            toast({ title: t('censor.reverted', '원본으로 되돌렸어요'), description: t('censor.revertedBody', '검열본 파일을 지웠습니다.') })
        } catch (error) {
            toast({ title: t('censor.revertFailed', '되돌리지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }, [censorFolderOf, current, folderPath, t])

    // 검수 키: , < ← 이전 · . > → 다음 · Esc 목록 · Ctrl+S 저장
    useEffect(() => {
        if (index === null) return
        const handleKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null
            const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
            if (typing) return
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault()
                void saveNow()
                return
            }
            if (event.ctrlKey || event.metaKey || event.altKey) return
            if (event.key === 'Escape') {
                event.preventDefault()
                void backToList()
                return
            }
            // 슬라이더를 잡고 있을 때의 화살표는 슬라이더 조절이다.
            if (event.key.startsWith('Arrow') && target?.getAttribute('role') === 'slider') return
            const delta = reviewKeyDelta(event.key)
            if (delta === 0) return
            event.preventDefault()
            void go(delta)
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [backToList, go, index, saveNow])

    const chooseFolder = async () => {
        try {
            const selected = await openDialog({ directory: true, multiple: false, defaultPath: folderPath || undefined })
            if (selected && typeof selected === 'string') setFolderPath(selected)
        } catch (error) {
            toast({ title: t('censor.loadFailed', '폴더를 읽지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    const openCensorFolder = async () => {
        try {
            await openFolder(await censorFolderOf(folderPath))
        } catch (error) {
            toast({ title: t('censor.openFolderFailed', '폴더를 열지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    const thumbOf = (file: FolderFile, status: CensorStatus) => {
        if (status !== 'censored') return convertFileSrc(file.path)
        const output = censorOutput(file.name)
        const fresh = freshThumbs[output.name.toLowerCase()]
        if (fresh) return fresh
        const separator = folderPath.includes('\\') ? '\\' : '/'
        return convertFileSrc(`${folderPath.replace(/[\\/]+$/, '')}${separator}${CENSOR_FOLDER_NAME}${separator}${output.name}`)
    }

    const listedCurrent = workFolders.some(folder => pathKey(folder.path) === folderKey)

    return (
        <div className="flex h-full min-h-0 gap-3 p-3" data-censor-page>
            {/* 폴더 목록 */}
            <aside className="flex w-60 shrink-0 flex-col rounded-2xl border border-border/60 bg-card/40">
                <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    <h1 className="flex-1 text-sm font-semibold">{t('censor.title', '검열')}</h1>
                    <Tip content={t('censor.reloadFolders', '폴더 목록 새로고침')}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void reloadWorkFolders()}>
                            <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                    </Tip>
                </div>
                <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                    {folderPath && !listedCurrent && (
                        <li>
                            <button type="button" className="w-full rounded-lg bg-primary/15 px-3 py-2 text-left" title={folderPath}>
                                <span className="block truncate text-sm font-medium">{folderName(folderPath)}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">{folderPath}</span>
                            </button>
                        </li>
                    )}
                    {workFolders.map(folder => (
                        <li key={folder.path}>
                            <button
                                type="button"
                                data-censor-folder
                                title={folder.path}
                                onClick={() => setFolderPath(folder.path)}
                                className={cn('w-full rounded-lg px-3 py-2 text-left transition-colors', pathKey(folder.path) === folderKey ? 'bg-primary/15' : 'hover:bg-muted/50')}
                            >
                                <span className="block truncate text-sm font-medium">{folder.name}</span>
                                <span className="block truncate text-[11px] text-muted-foreground">{t('folders.imageCount', '이미지 {{n}}장', { n: folder.imageCount })}</span>
                            </button>
                        </li>
                    ))}
                    {workFolders.length === 0 && !folderPath && (
                        <li className="px-3 py-8 text-center text-xs text-muted-foreground">{t('censor.noFolders', '폴더 관리자에 폴더가 없습니다. 아래에서 폴더를 직접 고를 수 있어요.')}</li>
                    )}
                </ul>
                <div className="border-t border-border/40 p-3">
                    <Button variant="outline" size="sm" className="h-8 w-full text-xs" onClick={() => void chooseFolder()}>
                        <FolderSearch className="mr-1.5 h-3.5 w-3.5" />
                        {t('censor.chooseFolder', '다른 폴더 열기')}
                    </Button>
                </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-border/60 bg-card/40">
                {!folderPath ? (
                    <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                        {t('censor.pickFolder', '왼쪽에서 폴더를 고르면 그 폴더의 이미지가 모두 보입니다.')}
                    </div>
                ) : current ? (
                    <>
                        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-3 py-2" data-censor-editor-bar>
                            <Button variant="outline" size="sm" className="h-8" onClick={() => void backToList()}>
                                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                                {t('censor.backToList', '목록')}
                            </Button>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void go(-1)} disabled={saving} title={t('censor.prev', '이전 ( , 또는 < )')}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="min-w-[4.5rem] text-center text-sm tabular-nums" data-censor-position>{(index ?? 0) + 1} / {files.length}</span>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void go(1)} disabled={saving} title={t('censor.next', '다음 ( . 또는 > )')}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={current.path}>{current.name}</span>
                            <span
                                data-censor-current-status={edited ? 'editing' : currentStatus}
                                className={cn(
                                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                                    edited ? 'bg-amber-500/20 text-amber-400'
                                        : currentStatus === 'censored' ? 'bg-red-500/20 text-red-400'
                                            : currentStatus === 'viewed' ? 'bg-blue-500/20 text-blue-400'
                                                : 'bg-muted text-muted-foreground',
                                )}
                            >
                                {edited ? t('censor.statusEditing', '칠하는 중')
                                    : currentStatus === 'censored' ? t('censor.statusCensored', '검열함')
                                        : currentStatus === 'viewed' ? t('censor.statusViewed', '확인함')
                                            : t('censor.statusNew', '새 이미지')}
                            </span>
                            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                            {currentStatus === 'censored' && (
                                <Tip content={t('censor.revertTip', '검열본을 지우고 원본에서 다시 시작합니다')}>
                                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void revertToOriginal()}>
                                        <Undo2 className="mr-1 h-3.5 w-3.5" />
                                        {t('censor.revert', '원본으로')}
                                    </Button>
                                </Tip>
                            )}
                            <Tip content={t('censor.saveTip', '지금 저장 (Ctrl+S). 다음 장으로 넘기면 자동으로 저장됩니다.')}>
                                <Button size="sm" className="h-8" onClick={() => void saveNow()} disabled={!edited || saving}>
                                    <Save className="mr-1.5 h-3.5 w-3.5" />
                                    {t('common.save', '저장')}
                                </Button>
                            </Tip>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col p-2">
                            <CensorEditor ref={editorRef} source={source} brush={brush} onBrushChange={setBrush} onEditedChange={setEdited} />
                        </div>
                        <p className="border-t border-border/40 px-4 py-1.5 text-[11px] text-muted-foreground">
                            {t('censor.keysHelp', ', < ← 이전 · . > → 다음 (칠했으면 자동 저장) · Esc 목록 · Ctrl+S 저장 · Ctrl+Z 되돌리기 · Ctrl+휠 확대 · 휠 버튼 끌기 이동')}
                        </p>
                    </>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-2.5">
                            <h2 className="min-w-0 truncate text-sm font-medium" title={folderPath}>{folderName(folderPath)}</h2>
                            <span className="text-xs tabular-nums text-muted-foreground" data-censor-summary>
                                {t('censor.summary', '전체 {{total}} · 확인 {{viewed}} · 검열 {{censored}} · 남음 {{remaining}}', summary)}
                            </span>
                            <span className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border-2 border-blue-500" />{t('censor.legendViewed', '확인함')}</span>
                                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border-2 border-red-500" />{t('censor.legendCensored', '검열함')}</span>
                            </span>
                            <Tip content={t('censor.clearViewedTip', '파란 테두리(확인함) 표시를 모두 지웁니다. 검열본 파일은 그대로예요.')}>
                                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => clearViewed(folderKey)} disabled={summary.viewed === 0}>
                                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                    {t('censor.clearViewed', '확인 표시 지우기')}
                                </Button>
                            </Tip>
                            <Button variant="outline" size="sm" className="h-8" onClick={() => void openCensorFolder()}>
                                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                                {t('censor.openCensorFolder', '검열본 폴더')}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void loadFolder(folderPath)} disabled={loading} title={t('folders.reload', '새로고침')}>
                                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                            </Button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-3">
                            {files.length === 0 ? (
                                <p className="py-16 text-center text-sm text-muted-foreground">
                                    {loading ? t('censor.loading', '읽는 중…') : t('censor.empty', '이 폴더에 이미지가 없습니다.')}
                                </p>
                            ) : (
                                <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(9.5rem, 1fr))' }}>
                                    {files.map((file, fileIndex) => {
                                        const status = censorStatus(file.name, censoredNames, viewedNames)
                                        return (
                                            <button
                                                key={file.path}
                                                type="button"
                                                data-censor-item
                                                data-censor-status={status}
                                                onClick={() => setIndex(fileIndex)}
                                                title={file.name}
                                                className={cn('group relative overflow-hidden rounded-lg border-2 bg-muted/30 text-left transition-colors hover:border-primary/60', STATUS_CLASS[status])}
                                            >
                                                <img src={thumbOf(file, status)} alt="" loading="lazy" decoding="async" className="aspect-[2/3] w-full object-cover" />
                                                <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] tabular-nums text-white">{fileIndex + 1}</span>
                                                {status !== 'none' && (
                                                    <span className={cn('absolute right-1 top-1 rounded px-1 text-[10px] font-semibold text-white', status === 'censored' ? 'bg-red-500' : 'bg-blue-500')}>
                                                        {status === 'censored' ? t('censor.statusCensored', '검열함') : t('censor.statusViewed', '확인함')}
                                                    </span>
                                                )}
                                                <span className="block truncate px-1.5 py-1 text-[11px] text-muted-foreground">{file.name}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </section>
        </div>
    )
}
