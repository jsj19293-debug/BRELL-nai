import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ExternalLink, Globe, Loader2, RefreshCw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tip } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/use-toast'
import { WEB_DEFAULT_URL, WEB_QUICK_LINKS, normalizeWebAddress, type WebQuickLink } from '@/lib/web-split'

const URL_KEY = 'nightmare2-web-split-url'
const readSavedUrl = () => {
    try { return localStorage.getItem(URL_KEY) || WEB_DEFAULT_URL } catch { return WEB_DEFAULT_URL }
}

/** 앱 창(대화상자 · 메뉴)이 떠 있으면 그 위를 덮지 않게 웹 화면을 잠깐 숨긴다. */
const OVERLAY_SELECTOR = '[data-native-webview-overlay="true"], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]'

/**
 * 프롬프트 탭 오른쪽에 붙는 웹 화면 (화면 분할). 프롬프트를 적으면서 단부루 · 번역기 등을 같이 본다.
 * 웹 화면 자체는 앱 창 위에 얹히는 별도 화면이라, 이 칸의 위치와 크기를 따라가도록 맞춰 준다.
 */
export function WebSplitPanel({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation()
    const areaRef = useRef<HTMLDivElement>(null)
    const [address, setAddress] = useState(readSavedUrl)
    const [opened, setOpened] = useState(false)
    const [loading, setLoading] = useState(false)
    const [zoom, setZoom] = useState(1)
    const lastRect = useRef('')
    const hiddenForOverlay = useRef(false)

    const areaRect = () => areaRef.current?.getBoundingClientRect() ?? null

    const syncSize = useCallback(() => {
        const rect = areaRect()
        if (!rect || rect.width < 1 || rect.height < 1) return
        const key = [rect.left, rect.top, rect.width, rect.height].map(value => Math.round(value)).join(':')
        if (key === lastRect.current) return
        lastRect.current = key
        invoke('resize_embedded_browser', { x: rect.left, y: rect.top, width: rect.width, height: rect.height }).catch(() => undefined)
    }, [])

    const openAt = useCallback(async (url: string) => {
        const rect = areaRect()
        if (!rect) return
        setLoading(true)
        try {
            const alreadyOpen = await invoke<boolean>('is_browser_open').catch(() => false)
            if (alreadyOpen) {
                await invoke('navigate_embedded_browser', { url })
                await invoke('show_embedded_browser')
                lastRect.current = ''
                syncSize()
            } else {
                lastRect.current = [rect.left, rect.top, rect.width, rect.height].map(value => Math.round(value)).join(':')
                await invoke('open_embedded_browser', { url, x: rect.left, y: rect.top, width: rect.width, height: rect.height })
            }
            setOpened(true)
            setAddress(url)
            try { localStorage.setItem(URL_KEY, url) } catch { /* 저장 못 해도 열리기는 한다 */ }
        } catch (error) {
            console.error('Failed to open the web panel:', error)
            toast({ title: t('webSplit.openFailed', '웹 화면을 열지 못했어요'), description: String(error), variant: 'destructive' })
        } finally {
            setLoading(false)
        }
    }, [syncSize, t])

    // 켜면 바로 연다. 이전에 열어 둔 화면이 남아 있으면 그대로 다시 보여 준다.
    useEffect(() => {
        let cancelled = false
        void (async () => {
            const alreadyOpen = await invoke<boolean>('is_browser_open').catch(() => false)
            if (cancelled) return
            if (alreadyOpen) {
                await invoke('show_embedded_browser').catch(() => undefined)
                lastRect.current = ''
                setOpened(true)
                // 화면 배치가 끝난 뒤 위치를 맞춘다.
                window.setTimeout(syncSize, 50)
            } else {
                await openAt(normalizeWebAddress(readSavedUrl()) ?? WEB_DEFAULT_URL)
            }
        })()
        return () => {
            cancelled = true
            // 다른 탭으로 가면 숨기기만 한다 (돌아오면 보던 페이지가 그대로 있다).
            invoke('hide_embedded_browser').catch(() => undefined)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 칸 크기나 창 크기가 바뀌면 웹 화면도 따라 옮긴다.
    useEffect(() => {
        if (!opened) return
        const observer = new ResizeObserver(syncSize)
        if (areaRef.current) observer.observe(areaRef.current)
        window.addEventListener('resize', syncSize)
        const timer = window.setInterval(syncSize, 500)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', syncSize)
            window.clearInterval(timer)
        }
    }, [opened, syncSize])

    // 대화상자나 메뉴가 뜨면 숨기고, 닫히면 다시 보여 준다.
    useEffect(() => {
        if (!opened) return
        let frame: number | null = null
        const sync = () => {
            frame = null
            const hasOverlay = Boolean(document.querySelector(OVERLAY_SELECTOR)) || document.hidden
            if (hasOverlay === hiddenForOverlay.current) return
            hiddenForOverlay.current = hasOverlay
            if (hasOverlay) invoke('hide_embedded_browser').catch(() => undefined)
            else invoke('show_embedded_browser').then(() => { lastRect.current = ''; syncSize() }).catch(() => undefined)
        }
        const schedule = () => { if (frame === null) frame = requestAnimationFrame(sync) }
        const observer = new MutationObserver(schedule)
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state', 'data-native-webview-overlay'] })
        document.addEventListener('visibilitychange', schedule)
        schedule()
        return () => {
            observer.disconnect()
            document.removeEventListener('visibilitychange', schedule)
            if (frame !== null) cancelAnimationFrame(frame)
            hiddenForOverlay.current = false
        }
    }, [opened, syncSize])

    const go = (input: string) => {
        const url = normalizeWebAddress(input)
        if (!url) {
            toast({ title: t('webSplit.badAddress', '열 수 없는 주소예요'), description: t('webSplit.badAddressHelp', 'http 또는 https 주소만 열 수 있습니다.'), variant: 'destructive' })
            return
        }
        void openAt(url)
    }

    const changeZoom = (next: number) => {
        const value = Math.max(0.5, Math.min(2, Math.round(next * 10) / 10))
        setZoom(value)
        invoke('zoom_embedded_browser', { zoomLevel: value }).catch(() => undefined)
    }

    const handleClose = () => {
        invoke('close_embedded_browser').catch(() => undefined)
        onClose()
    }

    const handleExternal = async () => {
        const url = normalizeWebAddress(address)
        if (!url) return
        try {
            await openUrl(url)
        } catch (error) {
            toast({ title: t('webSplit.externalFailed', '인터넷 창을 열지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    return (
        <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-border/60 bg-card/40" data-web-split>
            <div className="flex items-center gap-1.5 border-b border-border/40 px-3 py-2">
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                    value={address}
                    onChange={event => setAddress(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') go(address) }}
                    placeholder={t('webSplit.placeholder', '주소 또는 검색어')}
                    className="h-8 min-w-0 flex-1 text-xs"
                    data-web-address
                />
                {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                <Tip content={t('webSplit.reload', '주소창의 주소로 다시 열기')}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => go(address)}><RefreshCw className="h-4 w-4" /></Button>
                </Tip>
                <Tip content={t('webSplit.zoomOut', '작게')}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => changeZoom(zoom - 0.1)}><ZoomOut className="h-4 w-4" /></Button>
                </Tip>
                <button type="button" className="shrink-0 text-[11px] tabular-nums text-muted-foreground hover:text-foreground" onClick={() => changeZoom(1)} data-web-zoom>{Math.round(zoom * 100)}%</button>
                <Tip content={t('webSplit.zoomIn', '크게')}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => changeZoom(zoom + 0.1)}><ZoomIn className="h-4 w-4" /></Button>
                </Tip>
                <Tip content={t('webSplit.external', '인터넷 창으로 열기 (기본 브라우저)')}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => void handleExternal()} data-web-external><ExternalLink className="h-4 w-4" /></Button>
                </Tip>
                <Tip content={t('webSplit.close', '웹 화면 닫기')}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleClose} data-web-close><X className="h-4 w-4" /></Button>
                </Tip>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 px-3 py-1.5">
                {WEB_QUICK_LINKS.map((link: WebQuickLink) => (
                    <button key={link.url} type="button" data-web-quick onClick={() => go(link.url)} className="h-7 rounded-lg border border-border/60 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                        {link.name}
                    </button>
                ))}
            </div>
            {/* 웹 화면이 얹히는 자리 */}
            <div ref={areaRef} className="m-1.5 min-h-0 flex-1 overflow-hidden rounded-xl bg-background/60" data-web-area>
                {!opened && (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        {loading ? t('webSplit.opening', '여는 중…') : t('webSplit.idle', '주소를 넣거나 위의 바로가기를 누르세요.')}
                    </div>
                )}
            </div>
        </section>
    )
}
