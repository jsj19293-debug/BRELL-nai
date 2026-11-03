/**
 * 후처리 엔진: 말풍선 · 에셋을 그리는 부분만 보이지 않게 미리 띄워 두고(앱 시작 후 한가할 때),
 * 후처리 창이 열리면 그 창의 그림판 자리에 겹쳐 보여 준다. 그래서 창이 바로 열린다.
 * 목록 · 속성 · 버튼은 Nightmare 화면(PostprocessPopup)이 직접 그린다.
 */
import type { BalloonBridge } from '@/services/postprocess-render'

export const ENGINE_URL = '/balloon/index.html?mode=engine'

export interface CatalogItem {
    index: number
    label: string
    thumb: string
}

export interface EngineSelection {
    version: number
    type: 'none' | 'balloon' | 'asset' | 'window' | 'layer'
    name?: string
    text?: string
    fontSize?: number
    color?: string
    fill?: string
    opacity?: number
    hasText?: boolean
    fields?: Record<string, string> | null
}

export interface PostprocessEngine {
    ready: boolean
    catalog: (group: string) => CatalogItem[]
    choose: (group: string, index: number) => Promise<boolean>
    selection: () => EngineSelection
    update: (patch: Record<string, string | number>) => EngineSelection
    action: (name: 'undo' | 'redo' | 'delete' | 'duplicate' | 'fit' | 'rotate' | 'forward' | 'backward') => EngineSelection
    addCustomAsset: (dataUrl: string, name: string) => Promise<CatalogItem[]>
    reset: (dataUrl: string) => Promise<{ width: number; height: number }>
}

type EngineWindow = Window & { nightmareEngine?: PostprocessEngine; nightmareBridge?: BalloonBridge }

let frame: HTMLIFrameElement | null = null
let loading: Promise<{ engine: PostprocessEngine; bridge: BalloonBridge }> | null = null

const OFFSCREEN = { left: '-20000px', top: '0px', width: '1200px', height: '900px', opacity: '0', pointerEvents: 'none', zIndex: '-1' }

/** 엔진을 띄운다 (이미 떠 있으면 그대로). */
export function ensureEngine(): Promise<{ engine: PostprocessEngine; bridge: BalloonBridge }> {
    if (loading) return loading
    frame = document.createElement('iframe')
    frame.src = ENGINE_URL
    frame.title = '후처리 그림판'
    frame.setAttribute('data-postprocess-engine', '')
    Object.assign(frame.style, { position: 'fixed', border: '0', borderRadius: '8px', background: '#0b0d10', ...OFFSCREEN })
    document.body.appendChild(frame)
    loading = new Promise((resolve, reject) => {
        const started = Date.now()
        const check = () => {
            const win = frame?.contentWindow as EngineWindow | null
            if (win?.nightmareEngine?.ready && win.nightmareBridge?.ready) return resolve({ engine: win.nightmareEngine, bridge: win.nightmareBridge })
            if (Date.now() - started > 90_000) {
                frame?.remove()
                frame = null
                loading = null
                return reject(new Error('후처리 그림판을 불러오지 못했어요.'))
            }
            setTimeout(check, 150)
        }
        check()
    })
    return loading
}

/** 앱이 켜지고 한가할 때 미리 띄워 둔다. */
export function preloadEngine(delayMs = 6000): void {
    const start = () => { void ensureEngine().catch(() => undefined) }
    setTimeout(() => {
        const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback
        if (idle) idle(start, { timeout: 5000 })
        else start()
    }, delayMs)
}

/** 그림판을 화면의 이 자리에 보여 준다. */
export function showEngineAt(rect: DOMRect): void {
    if (!frame) return
    Object.assign(frame.style, {
        left: `${Math.round(rect.left)}px`,
        top: `${Math.round(rect.top)}px`,
        width: `${Math.max(1, Math.round(rect.width))}px`,
        height: `${Math.max(1, Math.round(rect.height))}px`,
        opacity: '1',
        pointerEvents: 'auto',
        zIndex: '60',
    })
}

/** 그림판을 화면 밖으로 치운다 (엔진은 그대로 살아 있다). */
export function hideEngine(): void {
    if (frame) Object.assign(frame.style, OFFSCREEN)
}
