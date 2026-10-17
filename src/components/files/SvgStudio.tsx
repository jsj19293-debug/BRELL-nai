import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { open as openDialog, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { AlertTriangle, Copy, FileCode2, Loader2, Play, FolderOpen, ImageDown, Maximize2, RotateCcw, Save, Sparkles, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tip } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import { SVG_SAMPLE, isWorkerCode, previewDocument, svgFileName, svgSize, withExplicitSize, workerExamples, workerRequestUrl, type SvgBackground } from '@/lib/svg-studio'
import { runSvgWorker } from '@/lib/svg-worker-runner'

const DRAFT_KEY = 'nightmare-svg-studio-draft'
const readDraft = () => {
    try { return localStorage.getItem(DRAFT_KEY) ?? SVG_SAMPLE } catch { return SVG_SAMPLE }
}

interface Checked {
    ok: boolean
    error: string
    width: number
    height: number
    viewBox: string | null
}

/** 문법 확인과 크기 읽기. 오류가 있으면 메시지를 돌려준다. */
function checkSvg(source: string): Checked {
    const text = source.trim()
    if (!text) return { ok: false, error: '', width: 0, height: 0, viewBox: null }
    const parsed = new DOMParser().parseFromString(text, 'image/svg+xml')
    const failure = parsed.querySelector('parsererror')
    if (failure) {
        const message = (failure.textContent || '').replace(/\s+/g, ' ').replace(/^.*?error on/i, 'error on').replace(/Below is a rendering.*$/i, '').trim()
        return { ok: false, error: message.slice(0, 220) || 'SVG 문법 오류', width: 0, height: 0, viewBox: null }
    }
    const root = parsed.documentElement
    if (root.nodeName.toLowerCase() !== 'svg') {
        return { ok: false, error: '맨 바깥 태그가 <svg> 가 아닙니다', width: 0, height: 0, viewBox: null }
    }
    const size = svgSize({ width: root.getAttribute('width'), height: root.getAttribute('height'), viewBox: root.getAttribute('viewBox') })
    return { ok: true, error: '', ...size }
}

/**
 * SVG 편집 창: 왼쪽에 코드를 쓰면 오른쪽에 바로 그려진다.
 * 미리보기는 스크립트가 막힌 상자 안에서 그려서, 받은 SVG에 스크립트가 있어도 앱에 영향이 없다.
 */
export function SvgStudio() {
    const { t } = useTranslation()
    const [code, setCode] = useState(readDraft)
    const [shown, setShown] = useState(code)
    const [background, setBackground] = useState<SvgBackground>('checker')
    const [fit, setFit] = useState(true)
    const [zoom, setZoom] = useState(1)
    const [fileName, setFileName] = useState('image.svg')
    const [dropping, setDropping] = useState(false)
    const [wrap, setWrap] = useState(true)
    const editorRef = useRef<HTMLTextAreaElement>(null)

    // SVG 대신 SVG를 만들어 내는 워커 코드를 붙여넣으면, 그 코드를 돌려서 나온 SVG를 보여 준다.
    const workerMode = useMemo(() => isWorkerCode(code), [code])
    const examples = useMemo(() => (workerMode ? workerExamples(code) : []), [code, workerMode])
    const [query, setQuery] = useState('')
    const [output, setOutput] = useState('')
    const [workerError, setWorkerError] = useState('')
    const [workerInfo, setWorkerInfo] = useState('')
    const [running, setRunning] = useState(false)
    const runSeq = useRef(0)

    const runWorker = async (source: string, request: string) => {
        const seq = ++runSeq.current
        setRunning(true)
        try {
            const result = await runSvgWorker(source, workerRequestUrl(request))
            if (seq !== runSeq.current) return
            if (result.status >= 400 || !/svg|xml/i.test(result.contentType)) {
                setWorkerError(`${result.status} · ${result.body.slice(0, 300) || result.contentType}`)
                setWorkerInfo('')
            } else {
                setWorkerError('')
                setOutput(result.body)
                setWorkerInfo(`${result.status} · ${result.contentType.split(';')[0]}`)
            }
        } catch (error) {
            if (seq !== runSeq.current) return
            setWorkerError(String((error as Error)?.message || error).split('\n').slice(0, 3).join(' '))
            setWorkerInfo('')
        } finally {
            if (seq === runSeq.current) setRunning(false)
        }
    }

    // 워커 코드나 요청 주소가 바뀌면 잠깐 기다렸다가 다시 돌린다.
    useEffect(() => {
        if (!workerMode) return
        const timer = window.setTimeout(() => { void runWorker(code, query) }, 400)
        return () => window.clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workerMode, code, query])

    /** 미리보기 · 저장 · PNG 의 대상: 워커면 실행 결과, 아니면 입력한 SVG */
    const svgSource = workerMode ? output : code
    const checked = useMemo(() => checkSvg(svgSource), [svgSource])

    // 입력을 멈추면 바로 그린다 (문법이 맞을 때만 바꿔서, 쓰는 도중에 화면이 깨지지 않게).
    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (checked.ok) setShown(svgSource)
            try { localStorage.setItem(DRAFT_KEY, code) } catch { /* 저장 못 해도 편집은 된다 */ }
        }, 120)
        return () => window.clearTimeout(timer)
    }, [code, svgSource, checked.ok])

    const lineCount = useMemo(() => code.split('\n').length, [code])
    const shownSize = useMemo(() => { const result = checkSvg(shown); return { width: result.width || 300, height: result.height || 150 } }, [shown])
    const doc = useMemo(() => previewDocument(shown, background, zoom, fit, shownSize), [shown, background, zoom, fit, shownSize])

    const loadText = (text: string, name: string) => {
        setQuery('')
        setOutput('')
        setWorkerError('')
        setCode(text)
        setFileName(name)
    }

    const handleOpen = async () => {
        try {
            const path = await openDialog({ multiple: false, filters: [{ name: 'SVG · 워커', extensions: ['svg', 'js', 'mjs', 'txt'] }] })
            if (!path || typeof path !== 'string') return
            loadText(await readTextFile(path), path.split(/[\\/]/).pop() || 'image.svg')
        } catch (error) {
            toast({ title: t('svgStudio.openFailed', 'SVG를 열지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    const handleSaveSvg = async () => {
        try {
            const path = await save({ defaultPath: svgFileName(fileName, 'svg'), filters: [{ name: 'SVG', extensions: ['svg'] }] })
            if (!path) return
            await writeTextFile(path, svgSource)
            setFileName(path.split(/[\\/]/).pop() || fileName)
            toast({ title: t('svgStudio.saved', 'SVG를 저장했어요'), description: path, variant: 'success' })
        } catch (error) {
            toast({ title: t('fileTools.saveFailed', '저장하지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    const handleExportPng = async (scale: number) => {
        if (!checked.ok) return
        const width = Math.max(1, Math.round(checked.width * scale))
        const height = Math.max(1, Math.round(checked.height * scale))
        const url = URL.createObjectURL(new Blob([withExplicitSize(svgSource, width, height)], { type: 'image/svg+xml' }))
        const canvas = document.createElement('canvas')
        try {
            const image = new Image()
            await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve()
                image.onerror = () => reject(new Error('그림으로 바꾸지 못했습니다'))
                image.src = url
            })
            canvas.width = width
            canvas.height = height
            canvas.getContext('2d')?.drawImage(image, 0, 0, width, height)
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
            if (!blob) throw new Error('PNG로 만들지 못했습니다 (바깥 이미지를 불러오는 SVG일 수 있어요)')
            const path = await save({ defaultPath: svgFileName(fileName, 'png'), filters: [{ name: 'PNG', extensions: ['png'] }] })
            if (!path) return
            await writeFile(path, new Uint8Array(await blob.arrayBuffer()))
            toast({ title: t('svgStudio.pngSaved', 'PNG로 저장했어요 ({{w}}×{{h}})', { w: width, h: height }), description: path, variant: 'success' })
        } catch (error) {
            toast({ title: t('svgStudio.pngFailed', 'PNG로 저장하지 못했어요'), description: String(error), variant: 'destructive' })
        } finally {
            URL.revokeObjectURL(url)
            canvas.width = canvas.height = 0
        }
    }

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code)
            toast({ title: t('svgStudio.copied', 'SVG 코드를 복사했어요'), variant: 'success' })
        } catch {
            toast({ title: t('actions.copyFailed', '복사 실패'), variant: 'destructive' })
        }
    }

    // Tab 키는 칸을 벗어나지 않고 들여쓰기로 쓴다.
    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return
        event.preventDefault()
        const area = event.currentTarget
        const { selectionStart: start, selectionEnd: end, value } = area
        const next = `${value.slice(0, start)}  ${value.slice(end)}`
        setCode(next)
        requestAnimationFrame(() => { area.selectionStart = area.selectionEnd = start + 2 })
    }

    const handleDrop = async (event: React.DragEvent) => {
        const file = Array.from(event.dataTransfer?.files ?? []).find(item => /\.(svg|js|mjs|txt)$/i.test(item.name) || item.type === 'image/svg+xml')
        if (!file) return
        event.preventDefault()
        setDropping(false)
        loadText(await file.text(), file.name)
    }

    const chip = (active: boolean) => cn(
        'h-7 rounded-md border px-2 text-xs transition-colors',
        active ? 'border-primary bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted/50',
    )

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-4" data-svg-studio>
            <div className="flex flex-wrap items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-8" onClick={() => void handleOpen()}><FolderOpen className="mr-1.5 h-3.5 w-3.5" />{t('svgStudio.open', '열기')}</Button>
                <Button variant="outline" size="sm" className="h-8" onClick={() => void handleSaveSvg()} disabled={!checked.ok} data-svg-save><Save className="mr-1.5 h-3.5 w-3.5" />{workerMode ? t('svgStudio.saveResult', '결과 SVG 저장') : t('svgStudio.saveSvg', 'SVG 저장')}</Button>
                <Button variant="outline" size="sm" className="h-8" onClick={() => void handleExportPng(1)} disabled={!checked.ok}><ImageDown className="mr-1.5 h-3.5 w-3.5" />PNG</Button>
                <Button variant="outline" size="sm" className="h-8" onClick={() => void handleExportPng(2)} disabled={!checked.ok}>PNG ×2</Button>
                <Button variant="outline" size="sm" className="h-8" onClick={() => void handleCopy()} disabled={!code.trim()}><Copy className="mr-1.5 h-3.5 w-3.5" />{t('svgStudio.copy', '코드 복사')}</Button>
                <Tip content={t('svgStudio.sampleTip', '예시 SVG로 바꿉니다')}>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => loadText(SVG_SAMPLE, 'image.svg')}><Sparkles className="mr-1.5 h-3.5 w-3.5" />{t('svgStudio.sample', '예시')}</Button>
                </Tip>
                <Button variant="ghost" size="sm" className="h-8" onClick={() => { setCode(''); setShown('') }} disabled={!code}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />{t('svgStudio.clear', '비우기')}</Button>
                <Button variant={wrap ? 'secondary' : 'ghost'} size="sm" className="h-8" onClick={() => setWrap(value => !value)}>{t('svgStudio.wrap', '줄바꿈')}</Button>
                <span className="ml-auto truncate text-xs text-muted-foreground" title={fileName}><FileCode2 className="mr-1 inline h-3.5 w-3.5" />{fileName}</span>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
                {/* 입력 */}
                <div
                    className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background/60', dropping ? 'border-primary' : 'border-border/50')}
                    onDragOver={event => { if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) { event.preventDefault(); setDropping(true) } }}
                    onDragLeave={() => setDropping(false)}
                    onDrop={event => void handleDrop(event)}
                >
                    <textarea
                        ref={editorRef}
                        value={code}
                        onChange={event => setCode(event.target.value)}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        placeholder={t('svgStudio.placeholder2', '<svg ...> 코드나 SVG를 만드는 워커 코드(export default { fetch })를 붙여넣거나, .svg · .js 파일을 끌어다 놓으세요')}
                        className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-[13px] leading-5 outline-none"
                        style={{ tabSize: 2, whiteSpace: wrap ? 'pre-wrap' : 'pre', overflowWrap: wrap ? 'anywhere' : 'normal' }}
                        data-svg-input
                    />
                    {workerMode && (
                        <div className="space-y-1.5 border-t border-border/40 px-3 py-2" data-svg-worker>
                            <div className="flex items-center gap-2">
                                <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{t('svgStudio.workerMode', '워커 코드')}</span>
                                <input
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                    onKeyDown={event => { if (event.key === 'Enter') void runWorker(code, query) }}
                                    placeholder={t('svgStudio.queryPlaceholder', '요청 주소 (예: ?no=13421 · 비우면 기본 화면)')}
                                    className="h-7 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 font-mono text-xs outline-none focus:border-primary"
                                    data-svg-query
                                />
                                <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => void runWorker(code, query)} disabled={running}>
                                    {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                </Button>
                            </div>
                            {examples.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    <button type="button" className={chip(query === '')} onClick={() => setQuery('')}>{t('svgStudio.default', '기본')}</button>
                                    {examples.map(example => (
                                        <button key={example} type="button" className={cn(chip(query === example), 'max-w-[14rem] truncate font-mono')} title={example} onClick={() => setQuery(example)} data-svg-example>{example}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <div className={cn('flex items-center gap-2 border-t px-3 py-1.5 text-[11px]', (workerMode ? !workerError && (checked.ok || running) : checked.ok || !code.trim()) ? 'border-border/40 text-muted-foreground' : 'border-red-500/40 bg-red-500/10 text-red-400')} data-svg-status>
                        {workerMode && workerError ? (
                            <span className="flex min-w-0 items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span className="truncate" title={workerError}>{t('svgStudio.workerFailed', '워커 오류')}: {workerError}</span></span>
                        ) : workerMode && !checked.ok ? (
                            <span>{running ? t('svgStudio.running', '워커 실행 중…') : checked.error || t('svgStudio.noOutput', '결과가 없습니다')}</span>
                        ) : checked.ok ? (
                            <span>{workerMode ? `${t('svgStudio.workerOk', '워커 결과')} ${workerInfo} · ` : `${t('svgStudio.ok', '정상')} · `}{checked.width} × {checked.height}{checked.viewBox ? ` · viewBox ${checked.viewBox}` : ''} · {t('svgStudio.lines', '{{n}}줄', { n: lineCount })} · {(new Blob([svgSource]).size / 1024).toFixed(1)} KB</span>
                        ) : code.trim() ? (
                            <span className="flex min-w-0 items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span className="truncate" title={checked.error}>{checked.error}</span><span className="shrink-0 opacity-70">· {t('svgStudio.lastGood', '오른쪽은 마지막으로 맞았던 그림')}</span></span>
                        ) : (
                            <span>{t('svgStudio.empty', '비어 있음')}</span>
                        )}
                    </div>
                </div>

                {/* 화면 */}
                <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/50">
                    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 px-2 py-1.5">
                        <button type="button" className={chip(background === 'checker')} onClick={() => setBackground('checker')}>{t('svgStudio.bgChecker', '투명 격자')}</button>
                        <button type="button" className={chip(background === 'white')} onClick={() => setBackground('white')}>{t('svgStudio.bgWhite', '흰색')}</button>
                        <button type="button" className={chip(background === 'black')} onClick={() => setBackground('black')}>{t('svgStudio.bgBlack', '검정')}</button>
                        <span className="mx-1 h-4 w-px bg-border" />
                        <button type="button" className={chip(fit)} onClick={() => setFit(true)} data-svg-fit><Maximize2 className="mr-1 inline h-3 w-3" />{t('svgStudio.fit', '창에 맞춤')}</button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setFit(false); setZoom(value => Math.max(0.25, Math.round((value - 0.25) * 100) / 100)) }}><ZoomOut className="h-3.5 w-3.5" /></Button>
                        <button type="button" className={chip(!fit)} onClick={() => { setFit(false); setZoom(1) }} data-svg-zoom>{fit ? '100%' : `${Math.round(zoom * 100)}%`}</button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setFit(false); setZoom(value => Math.min(8, Math.round((value + 0.25) * 100) / 100)) }}><ZoomIn className="h-3.5 w-3.5" /></Button>
                    </div>
                    {/* sandbox: 스크립트 · 양식 · 팝업 모두 막힘. CSS · SMIL 애니메이션은 그대로 움직인다. */}
                    <iframe title="SVG preview" sandbox="" srcDoc={doc} className="min-h-0 w-full flex-1 border-0" data-svg-preview />
                </div>
            </div>
        </div>
    )
}
