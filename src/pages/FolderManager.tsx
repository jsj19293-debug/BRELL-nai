import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Film, FolderOpen, FolderPlus, Images, Link2, Link2Off, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tip } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { useSceneStore } from '@/stores/scene-store'
import { useFolderStore } from '@/stores/folder-store'
import {
    createWorkFolder, listWorkFolders, openFolder, resolveScenePresetFolder, resolveWorkRoot, type WorkFolder,
} from '@/lib/rell-folders'
import { pathKey } from '@/lib/scene-folder-sync'

const NO_WORK = '__none__'

const formatDate = (ms: number) => (ms > 0 ? new Date(ms).toLocaleDateString() : '')

/**
 * 폴더 관리자: 작품별 결과물 폴더를 만들고, 바로 열고, 씬 모드의 작품(프리셋)과 연결한다.
 * 연결해 두면 씬 모드의 WebP 내보내기가 그 폴더로 저장된다. 여기서는 폴더를 지우지 않는다.
 */
export default function FolderManager() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const presets = useSceneStore(state => state.presets)
    const setActivePreset = useSceneStore(state => state.setActivePreset)
    const configuredRoot = useFolderStore(state => state.rootPath)
    const links = useFolderStore(state => state.links)
    const setRootPath = useFolderStore(state => state.setRootPath)
    const linkFolder = useFolderStore(state => state.linkFolder)
    const unlinkFolder = useFolderStore(state => state.unlinkFolder)

    const [root, setRoot] = useState('')
    const [folders, setFolders] = useState<WorkFolder[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [newName, setNewName] = useState('')
    const [creating, setCreating] = useState(false)

    const reload = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const resolved = await resolveWorkRoot()
            setRoot(resolved)
            setFolders(await listWorkFolders(resolved))
        } catch (reason) {
            console.error('Failed to list work folders:', reason)
            setFolders([])
            setError(String(reason))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void reload()
    }, [reload, configuredRoot])

    // 폴더 경로 → 연결된 작품 id
    const presetByFolder = useMemo(() => {
        const map = new Map<string, string>()
        for (const [presetId, path] of Object.entries(links)) map.set(pathKey(path), presetId)
        return map
    }, [links])
    const presetName = (id: string) => presets.find(preset => preset.id === id)?.name

    const run = async (action: () => Promise<void>) => {
        try {
            await action()
        } catch (reason) {
            console.error(reason)
            toast({ title: t('folders.failed', '폴더 작업에 실패했어요'), description: String(reason), variant: 'destructive' })
        }
    }

    const handleCreate = async (name: string, presetId?: string) => {
        if (!name.trim() || creating) return
        setCreating(true)
        await run(async () => {
            const path = await createWorkFolder(root, name)
            if (presetId) linkFolder(presetId, path)
            setNewName('')
            await reload()
            toast({ title: t('folders.created', '폴더를 만들었어요'), description: path, variant: 'success' })
        })
        setCreating(false)
    }

    const handleChooseRoot = () => run(async () => {
        const selected = await openDialog({ directory: true, multiple: false, defaultPath: root || undefined })
        if (selected && typeof selected === 'string') setRootPath(selected)
    })

    const openInSceneMode = (presetId: string) => {
        setActivePreset(presetId)
        navigate('/scenes')
    }

    // 연결된 폴더가 작품 폴더 위치 밖에 있을 수도 있다 (내보내기에서 다른 곳을 골랐을 때).
    const listedKeys = new Set(folders.map(folder => pathKey(folder.path)))

    return (
        <div className="mx-auto flex h-full max-w-6xl flex-col gap-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-lg font-semibold">{t('folders.title', '폴더 관리자')}</h1>
                    <p className="text-xs text-muted-foreground">
                        {t('folders.desc', '작품별 폴더를 만들고 씬 모드의 작품과 연결하세요. 연결한 폴더는 WebP 내보내기의 저장 위치가 됩니다.')}
                    </p>
                </div>
                <div className="flex min-w-0 items-center gap-1 rounded-xl border border-border/60 bg-muted/20 py-1 pl-3 pr-1">
                    <span className="max-w-[420px] truncate text-xs text-muted-foreground" title={root}>{root || '…'}</span>
                    <Tip content={t('folders.openRoot', '이 위치 열기')}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void run(() => openFolder(root))} disabled={!root}>
                            <FolderOpen className="h-4 w-4" />
                        </Button>
                    </Tip>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => void handleChooseRoot()}>
                        {t('folders.changeRoot', '위치 변경')}
                    </Button>
                    {configuredRoot && (
                        <Tip content={t('folders.resetRoot', '기본 위치(사진 폴더)로 되돌리기')}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setRootPath('')}>
                                <RotateCcw className="h-4 w-4" />
                            </Button>
                        </Tip>
                    )}
                    <Tip content={t('folders.reload', '새로고침')}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void reload()} disabled={loading}>
                            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                        </Button>
                    </Tip>
                </div>
            </header>

            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                {/* 씬 모드의 작품들 */}
                <section className="flex min-h-0 flex-col rounded-2xl border border-border/60 bg-card/40">
                    <h2 className="flex items-center gap-2 border-b border-border/40 px-4 py-3 text-sm font-medium">
                        <Film className="h-4 w-4 text-muted-foreground" />
                        {t('folders.works', '씬 모드 작품')}
                        <span className="text-xs font-normal text-muted-foreground">{presets.length}</span>
                    </h2>
                    <ul className="min-h-0 flex-1 divide-y divide-border/30 overflow-y-auto">
                        {presets.map(preset => {
                            const linked = links[preset.id]
                            const imageCount = preset.scenes.reduce((sum, scene) => sum + scene.images.length, 0)
                            return (
                                <li key={preset.id} className="flex items-center gap-2 px-4 py-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">{preset.name}</p>
                                        <p className="truncate text-xs text-muted-foreground" title={linked}>
                                            {t('folders.workSummary', '씬 {{scenes}}개 · 이미지 {{images}}장', { scenes: preset.scenes.length, images: imageCount })}
                                            {' · '}
                                            {linked
                                                ? linked.split(/[\\/]/).pop()
                                                : t('folders.notLinked', '연결된 폴더 없음')}
                                        </p>
                                    </div>
                                    {linked ? (
                                        <Tip content={t('folders.openLinked', '연결된 폴더 열기')}>
                                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void run(() => openFolder(linked))}>
                                                <FolderOpen className="h-4 w-4" />
                                            </Button>
                                        </Tip>
                                    ) : (
                                        <Tip content={t('folders.createForWork', '이 작품 이름으로 폴더를 만들어 연결')}>
                                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void handleCreate(preset.name, preset.id)} disabled={creating || !root}>
                                                <FolderPlus className="h-4 w-4" />
                                            </Button>
                                        </Tip>
                                    )}
                                    <Tip content={t('folders.openSceneSource', '씬 원본 폴더 열기 (생성된 이미지가 저장되는 곳)')}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() => void run(async () => openFolder(await resolveScenePresetFolder(preset.name)))}
                                        >
                                            <Images className="h-4 w-4" />
                                        </Button>
                                    </Tip>
                                    <Tip content={t('folders.openInScene', '씬 모드에서 이 작품 열기')}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openInSceneMode(preset.id)}>
                                            <Film className="h-4 w-4" />
                                        </Button>
                                    </Tip>
                                </li>
                            )
                        })}
                        {presets.length === 0 && (
                            <li className="px-4 py-8 text-center text-sm text-muted-foreground">{t('folders.noWorks', '씬 모드에 작품이 없습니다')}</li>
                        )}
                    </ul>
                </section>

                {/* 작품 폴더들 */}
                <section className="flex min-h-0 flex-col rounded-2xl border border-border/60 bg-card/40">
                    <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
                        <h2 className="flex shrink-0 items-center gap-2 text-sm font-medium">
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                            {t('folders.folders', '폴더')}
                            <span className="text-xs font-normal text-muted-foreground">{folders.length}</span>
                        </h2>
                        <form
                            className="ml-auto flex min-w-0 items-center gap-2"
                            onSubmit={event => {
                                event.preventDefault()
                                void handleCreate(newName)
                            }}
                        >
                            <Input
                                value={newName}
                                onChange={event => setNewName(event.target.value)}
                                placeholder={t('folders.newPlaceholder', '새 폴더 이름')}
                                className="h-8 w-48 min-w-0"
                            />
                            <Button type="submit" size="sm" className="h-8" disabled={!newName.trim() || creating || !root}>
                                {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FolderPlus className="mr-1 h-4 w-4" />}
                                {t('folders.create', '만들기')}
                            </Button>
                        </form>
                    </div>
                    <ul className="min-h-0 flex-1 divide-y divide-border/30 overflow-y-auto">
                        {folders.map(folder => {
                            const linkedPresetId = presetByFolder.get(pathKey(folder.path))
                            const linkedExists = linkedPresetId && presets.some(preset => preset.id === linkedPresetId)
                            return (
                                <li key={folder.path} className="flex items-center gap-2 px-2 py-1.5">
                                    <button
                                        type="button"
                                        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
                                        onClick={() => void run(() => openFolder(folder.path))}
                                        title={folder.path}
                                    >
                                        <FolderOpen className={cn('h-5 w-5 shrink-0', linkedExists ? 'text-primary' : 'text-muted-foreground')} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{folder.name}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {t('folders.imageCount', '이미지 {{n}}장', { n: folder.imageCount })}
                                                {formatDate(folder.modifiedMs) && ` · ${formatDate(folder.modifiedMs)}`}
                                            </span>
                                        </span>
                                    </button>
                                    <Select
                                        value={linkedExists ? linkedPresetId : NO_WORK}
                                        onValueChange={(value: string) => {
                                            if (value === NO_WORK) {
                                                if (linkedPresetId) unlinkFolder(linkedPresetId)
                                            } else {
                                                linkFolder(value, folder.path)
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="h-8 w-44 shrink-0 text-xs" aria-label={t('folders.linkTo', '연결할 작품')}>
                                            <span className="flex min-w-0 items-center gap-1.5">
                                                {linkedExists ? <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" /> : <Link2Off className="h-3.5 w-3.5 shrink-0 opacity-50" />}
                                                <span className="truncate"><SelectValue /></span>
                                            </span>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={NO_WORK}>{t('folders.noLink', '연결 안 함')}</SelectItem>
                                            {presets.map(preset => <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Tip content={t('folders.openInScene', '씬 모드에서 이 작품 열기')}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={!linkedExists} onClick={() => linkedPresetId && openInSceneMode(linkedPresetId)}>
                                            <Film className="h-4 w-4" />
                                        </Button>
                                    </Tip>
                                </li>
                            )
                        })}
                        {!loading && folders.length === 0 && (
                            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                                {error
                                    ? t('folders.loadFailed', '폴더를 읽지 못했어요: {{error}}', { error })
                                    : t('folders.empty', '아직 폴더가 없습니다. 위에서 새 폴더를 만들거나, 왼쪽 작품의 폴더 버튼을 누르세요.')}
                            </li>
                        )}
                        {/* 작품 폴더 위치 밖에 있는 연결 폴더 */}
                        {Object.entries(links)
                            .filter(([presetId, path]) => !listedKeys.has(pathKey(path)) && presetName(presetId))
                            .map(([presetId, path]) => (
                                <li key={`linked-${presetId}`} className="flex items-center gap-2 px-2 py-1.5">
                                    <button
                                        type="button"
                                        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/50"
                                        onClick={() => void run(() => openFolder(path))}
                                        title={path}
                                    >
                                        <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{path.split(/[\\/]/).pop()}</span>
                                            <span className="block truncate text-xs text-muted-foreground">{path}</span>
                                        </span>
                                    </button>
                                    <span className="flex w-44 shrink-0 items-center gap-1.5 truncate px-3 text-xs text-muted-foreground">
                                        <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                                        <span className="truncate">{presetName(presetId)}</span>
                                    </span>
                                    <Tip content={t('folders.unlink', '연결 끊기')}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => unlinkFolder(presetId)}>
                                            <Link2Off className="h-4 w-4" />
                                        </Button>
                                    </Tip>
                                </li>
                            ))}
                    </ul>
                </section>
            </div>
        </div>
    )
}
