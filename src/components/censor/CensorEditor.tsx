import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { Circle, Droplets, Eraser, Paintbrush, Redo, RotateCcw, Square, Undo, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { appendBoundedHistory, cn, getHistoryShortcut } from '@/lib/utils'
import type { CensorBrush, CensorBrushMode } from '@/lib/censor-review'

const MAX_UNDO_STEPS = 12

export interface CensorEditorHandle {
    /** 칠한 것이 있으면 합친 이미지를 돌려준다. 없으면 null. */
    exportIfEdited: (mime: string) => Promise<Uint8Array | null>
    isEdited: () => boolean
}

interface CensorEditorProps {
    /** 그릴 바탕 이미지 (blob: 또는 data: 주소) */
    source: string | null
    brush: CensorBrush
    onBrushChange: (change: Partial<CensorBrush>) => void
    onEditedChange?: (edited: boolean) => void
}

/**
 * 검열 탭의 그리기 화면. 도구(솔리드 펜 · 블러 · 지우개, 모양, 크기, 색, 불투명도)는 수동검열 창과 같다.
 * Ctrl+휠로 확대, 휠 버튼으로 끌어서 이동, Ctrl+Z / Ctrl+Y 로 되돌리기.
 */
export const CensorEditor = forwardRef<CensorEditorHandle, CensorEditorProps>(function CensorEditor({ source, brush, onBrushChange, onEditedChange }, ref) {
    const { t } = useTranslation()
    const baseCanvasRef = useRef<HTMLCanvasElement>(null)
    const editCanvasRef = useRef<HTMLCanvasElement>(null)
    const blurSourceRef = useRef<HTMLCanvasElement | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const brushCursorRef = useRef<HTMLDivElement>(null)
    const lastPointRef = useRef<{ x: number; y: number } | null>(null)
    const drawingRef = useRef(false)
    const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)
    const undoHistoryRef = useRef<string[]>([])
    const redoHistoryRef = useRef<string[]>([])
    const editedRef = useRef(false)
    const pendingPivotRef = useRef<{ clientX: number; clientY: number; ratioX: number; ratioY: number } | null>(null)
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
    const [displaySize, setDisplaySize] = useState<{ width: number; height: number } | null>(null)
    const [zoom, setZoom] = useState(1)
    const [undoCount, setUndoCount] = useState(0)
    const [redoCount, setRedoCount] = useState(0)
    const { mode, shape, size, color, opacity, blurAmount } = brush

    const setEdited = useCallback((value: boolean) => {
        if (editedRef.current === value) return
        editedRef.current = value
        onEditedChange?.(value)
    }, [onEditedChange])

    // 바탕 이미지를 올린다.
    useEffect(() => {
        setImageSize(null)
        setZoom(1)
        undoHistoryRef.current = []
        redoHistoryRef.current = []
        setUndoCount(0)
        setRedoCount(0)
        setEdited(false)
        if (!source) return
        let cancelled = false
        const image = new Image()
        image.onload = () => {
            if (cancelled) return
            const baseCanvas = baseCanvasRef.current
            const editCanvas = editCanvasRef.current
            if (!baseCanvas || !editCanvas) return
            baseCanvas.width = image.naturalWidth
            baseCanvas.height = image.naturalHeight
            editCanvas.width = image.naturalWidth
            editCanvas.height = image.naturalHeight
            baseCanvas.getContext('2d')?.drawImage(image, 0, 0)
            editCanvas.getContext('2d')?.clearRect(0, 0, editCanvas.width, editCanvas.height)
            setImageSize({ width: image.naturalWidth, height: image.naturalHeight })
        }
        image.src = source
        return () => {
            cancelled = true
            image.onload = null
        }
    }, [source, setEdited])

    // 화면에 맞는 크기
    useEffect(() => {
        const container = containerRef.current
        if (!container || !imageSize) {
            setDisplaySize(null)
            return
        }
        const update = () => {
            const availableWidth = Math.max(1, container.clientWidth - 16)
            const availableHeight = Math.max(1, container.clientHeight - 16)
            const scale = Math.min(availableWidth / imageSize.width, availableHeight / imageSize.height)
            const next = { width: Math.max(1, Math.floor(imageSize.width * scale)), height: Math.max(1, Math.floor(imageSize.height * scale)) }
            setDisplaySize(current => current?.width === next.width && current.height === next.height ? current : next)
        }
        update()
        const observer = new ResizeObserver(update)
        observer.observe(container)
        return () => observer.disconnect()
    }, [imageSize])

    const composeToCanvas = useCallback(() => {
        const base = baseCanvasRef.current
        const edit = editCanvasRef.current
        if (!base || !edit || base.width === 0 || base.height === 0) return null
        const output = document.createElement('canvas')
        output.width = base.width
        output.height = base.height
        const context = output.getContext('2d')
        if (!context) return null
        context.drawImage(base, 0, 0)
        context.drawImage(edit, 0, 0)
        return output
    }, [])

    useImperativeHandle(ref, () => ({
        isEdited: () => editedRef.current,
        exportIfEdited: async (mime: string) => {
            if (!editedRef.current) return null
            const output = composeToCanvas()
            if (!output) return null
            const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, mime, mime === 'image/png' ? undefined : 0.95))
            output.width = 0
            output.height = 0
            return blob ? new Uint8Array(await blob.arrayBuffer()) : null
        },
    }), [composeToCanvas])

    const captureSnapshot = useCallback(() => {
        const canvas = editCanvasRef.current
        return canvas && canvas.width > 0 && canvas.height > 0 ? canvas.toDataURL('image/webp', 0.9) : null
    }, [])

    const captureUndoSnapshot = useCallback(() => {
        const snapshot = captureSnapshot()
        if (!snapshot) return
        undoHistoryRef.current = appendBoundedHistory(undoHistoryRef.current, undoHistoryRef.current.length, snapshot, MAX_UNDO_STEPS)
        redoHistoryRef.current = []
        setUndoCount(undoHistoryRef.current.length)
        setRedoCount(0)
    }, [captureSnapshot])

    const restoreSnapshot = useCallback((snapshot: string) => {
        const canvas = editCanvasRef.current
        if (!canvas) return
        const image = new Image()
        image.onload = () => {
            const context = canvas.getContext('2d')
            if (!context) return
            context.clearRect(0, 0, canvas.width, canvas.height)
            context.drawImage(image, 0, 0, canvas.width, canvas.height)
        }
        image.src = snapshot
    }, [])

    const undo = useCallback(() => {
        const current = captureSnapshot()
        const snapshot = current ? undoHistoryRef.current.pop() : undefined
        if (!current || !snapshot) return
        redoHistoryRef.current = appendBoundedHistory(redoHistoryRef.current, redoHistoryRef.current.length, current, MAX_UNDO_STEPS)
        setUndoCount(undoHistoryRef.current.length)
        setRedoCount(redoHistoryRef.current.length)
        restoreSnapshot(snapshot)
        // 처음 상태까지 되돌렸으면 칠한 것이 없는 것으로 본다.
        setEdited(undoHistoryRef.current.length > 0)
    }, [captureSnapshot, restoreSnapshot, setEdited])

    const redo = useCallback(() => {
        const current = captureSnapshot()
        const snapshot = current ? redoHistoryRef.current.pop() : undefined
        if (!current || !snapshot) return
        undoHistoryRef.current = appendBoundedHistory(undoHistoryRef.current, undoHistoryRef.current.length, current, MAX_UNDO_STEPS)
        setUndoCount(undoHistoryRef.current.length)
        setRedoCount(redoHistoryRef.current.length)
        restoreSnapshot(snapshot)
        setEdited(true)
    }, [captureSnapshot, restoreSnapshot, setEdited])

    useEffect(() => {
        const handleHistoryShortcut = (event: KeyboardEvent) => {
            const action = getHistoryShortcut(event)
            if (!action) return
            event.preventDefault()
            if (action === 'undo') undo()
            else redo()
        }
        window.addEventListener('keydown', handleHistoryShortcut)
        return () => window.removeEventListener('keydown', handleHistoryShortcut)
    }, [redo, undo])

    const resetEdits = () => {
        const canvas = editCanvasRef.current
        if (!canvas) return
        captureUndoSnapshot()
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
        setEdited(false)
    }

    const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const canvas = editCanvasRef.current
        if (!canvas) return null
        const rect = canvas.getBoundingClientRect()
        return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) }
    }

    const drawBlurPoint = (x: number, y: number) => {
        const canvas = editCanvasRef.current
        const blurSource = blurSourceRef.current
        const context = canvas?.getContext('2d')
        if (!canvas || !blurSource || !context) return
        context.save()
        context.beginPath()
        if (shape === 'round') context.arc(x, y, size / 2, 0, Math.PI * 2)
        else context.rect(x - size / 2, y - size / 2, size, size)
        context.clip()
        context.filter = `blur(${blurAmount}px)`
        context.drawImage(blurSource, 0, 0)
        context.restore()
    }

    const drawSegment = (from: { x: number; y: number }, to: { x: number; y: number }) => {
        const canvas = editCanvasRef.current
        const context = canvas?.getContext('2d')
        if (!canvas || !context) return
        const distance = Math.hypot(to.x - from.x, to.y - from.y)

        if (mode === 'blur') {
            const steps = Math.max(1, Math.ceil(distance / Math.max(2, size / 5)))
            for (let index = 0; index <= steps; index++) {
                const ratio = index / steps
                drawBlurPoint(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio)
            }
            return
        }

        context.save()
        context.globalCompositeOperation = mode === 'eraser' ? 'destination-out' : 'source-over'
        context.globalAlpha = mode === 'pen' ? opacity / 100 : 1
        if (shape === 'square') {
            context.fillStyle = color
            const steps = Math.max(1, Math.ceil(distance / Math.max(1, size / 4)))
            for (let index = 0; index <= steps; index++) {
                const ratio = index / steps
                context.fillRect(from.x + (to.x - from.x) * ratio - size / 2, from.y + (to.y - from.y) * ratio - size / 2, size, size)
            }
        } else {
            context.strokeStyle = color
            context.lineWidth = size
            context.lineCap = 'round'
            context.lineJoin = 'round'
            context.beginPath()
            context.moveTo(from.x, from.y)
            context.lineTo(to.x, to.y)
            context.stroke()
        }
        context.restore()
    }

    const updateBrushCursor = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const canvas = editCanvasRef.current
        const cursor = brushCursorRef.current
        if (!canvas || !cursor) return
        const rect = canvas.getBoundingClientRect()
        cursor.style.width = `${size * (rect.width / canvas.width)}px`
        cursor.style.height = `${size * (rect.height / canvas.height)}px`
        cursor.style.transform = `translate(${event.clientX - rect.left}px, ${event.clientY - rect.top}px) translate(-50%, -50%)`
        cursor.style.borderRadius = shape === 'round' ? '9999px' : '0'
        cursor.style.borderColor = mode === 'eraser' ? 'rgba(248, 113, 113, 0.95)' : 'rgba(255, 255, 255, 0.9)'
        cursor.style.backgroundColor = mode === 'eraser' ? 'rgba(248, 113, 113, 0.1)' : 'rgba(99, 102, 241, 0.1)'
        cursor.style.opacity = '1'
    }
    const hideBrushCursor = () => {
        if (brushCursorRef.current) brushCursorRef.current.style.opacity = '0'
    }

    const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.button === 1 && containerRef.current) {
            // 휠 버튼: 끌어서 이동
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            panStartRef.current = { x: event.clientX, y: event.clientY, scrollLeft: containerRef.current.scrollLeft, scrollTop: containerRef.current.scrollTop }
            hideBrushCursor()
            return
        }
        if (event.button !== 0) return
        const point = getCanvasPoint(event)
        if (!point) return
        event.currentTarget.setPointerCapture(event.pointerId)
        captureUndoSnapshot()
        if (mode === 'blur') {
            if (blurSourceRef.current) blurSourceRef.current.width = 0
            blurSourceRef.current = composeToCanvas()
        }
        drawingRef.current = true
        lastPointRef.current = point
        updateBrushCursor(event)
        drawSegment(point, { x: point.x + 0.01, y: point.y + 0.01 })
        // 지우개만 쓴 경우에도 바뀐 것으로 본다 (이미 칠해 둔 것을 지웠을 수 있다).
        setEdited(true)
    }

    const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (panStartRef.current && containerRef.current) {
            containerRef.current.scrollLeft = panStartRef.current.scrollLeft - (event.clientX - panStartRef.current.x)
            containerRef.current.scrollTop = panStartRef.current.scrollTop - (event.clientY - panStartRef.current.y)
            return
        }
        updateBrushCursor(event)
        if (!drawingRef.current || !lastPointRef.current) return
        const point = getCanvasPoint(event)
        if (!point) return
        drawSegment(lastPointRef.current, point)
        lastPointRef.current = point
    }

    const stopDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        panStartRef.current = null
        drawingRef.current = false
        lastPointRef.current = null
        if (blurSourceRef.current) {
            blurSourceRef.current.width = 0
            blurSourceRef.current = null
        }
    }

    const changeZoom = (next: number, pivot?: { clientX: number; clientY: number }) => {
        const clamped = Math.max(1, Math.min(4, Math.round(next * 4) / 4))
        if (clamped === zoom) return
        const rect = editCanvasRef.current?.getBoundingClientRect()
        const container = containerRef.current?.getBoundingClientRect()
        if (rect && container) {
            const clientX = pivot?.clientX ?? container.left + container.width / 2
            const clientY = pivot?.clientY ?? container.top + container.height / 2
            pendingPivotRef.current = {
                clientX,
                clientY,
                ratioX: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
                ratioY: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
            }
        }
        setZoom(clamped)
        hideBrushCursor()
    }

    // 확대한 뒤에도 마우스가 가리키던 곳이 그 자리에 있게 스크롤을 맞춘다.
    useLayoutEffect(() => {
        const pivot = pendingPivotRef.current
        pendingPivotRef.current = null
        const container = containerRef.current
        const rect = editCanvasRef.current?.getBoundingClientRect()
        if (!pivot || !container || !rect) return
        container.scrollLeft += rect.left + pivot.ratioX * rect.width - pivot.clientX
        container.scrollTop += rect.top + pivot.ratioY * rect.height - pivot.clientY
    }, [zoom])

    const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
        if (!event.ctrlKey) return
        event.preventDefault()
        changeZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25), event)
    }

    const toolButton = (value: CensorBrushMode, Icon: typeof Paintbrush, label: string) => (
        <Button
            type="button"
            size="sm"
            variant={mode === value ? 'secondary' : 'ghost'}
            className={cn('h-8', mode === value && 'bg-primary text-primary-foreground hover:bg-primary/90')}
            onClick={() => onBrushChange({ mode: value })}
            data-censor-tool={value}
        >
            <Icon className="mr-1.5 h-4 w-4" />
            {label}
        </Button>
    )

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 rounded-lg border border-border/50 bg-muted/20 p-1.5" data-censor-toolbar>
                <div className="flex items-center gap-1">
                    {toolButton('pen', Paintbrush, t('smartTools.solidPen', '솔리드 펜'))}
                    {toolButton('blur', Droplets, t('smartTools.blurBrush', '블러'))}
                    {toolButton('eraser', Eraser, t('common.eraser', '지우개'))}
                </div>
                <div className="h-6 w-px bg-border" />
                <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', shape === 'round' && 'bg-primary text-primary-foreground hover:bg-primary/90')} onClick={() => onBrushChange({ shape: 'round' })} title={t('smartTools.roundBrush', '둥근 브러시')}>
                        <Circle className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', shape === 'square' && 'bg-primary text-primary-foreground hover:bg-primary/90')} onClick={() => onBrushChange({ shape: 'square' })} title={t('smartTools.squareBrush', '네모 브러시')}>
                        <Square className="h-4 w-4" />
                    </Button>
                </div>
                <div className="h-6 w-px bg-border" />
                <div className="flex items-center gap-2">
                    <Label className="text-xs">{t('common.size', '크기')}</Label>
                    <Slider value={[size]} min={4} max={240} step={2} onValueChange={(value: number[]) => onBrushChange({ size: value[0] })} className="w-28" />
                    <span className="w-8 text-xs text-muted-foreground">{size}</span>
                </div>
                {mode === 'pen' && (
                    <>
                        <div className="h-6 w-px bg-border" />
                        <Label className="flex items-center gap-2 text-xs">
                            {t('smartTools.color', '색')}
                            <input type="color" value={color} onChange={event => onBrushChange({ color: event.target.value })} className="h-7 w-9 cursor-pointer rounded border bg-transparent p-0.5" data-censor-color />
                        </Label>
                        <div className="flex items-center gap-2">
                            <Label className="text-xs">{t('smartTools.opacity', '불투명도')}</Label>
                            <Slider value={[opacity]} min={5} max={100} step={5} onValueChange={(value: number[]) => onBrushChange({ opacity: value[0] })} className="w-24" />
                            <span className="w-8 text-xs text-muted-foreground">{opacity}%</span>
                        </div>
                    </>
                )}
                {mode === 'blur' && (
                    <>
                        <div className="h-6 w-px bg-border" />
                        <div className="flex items-center gap-2">
                            <Label className="text-xs">{t('smartTools.blurAmount', '블러 세기')}</Label>
                            <Slider value={[blurAmount]} min={2} max={30} step={1} onValueChange={(value: number[]) => onBrushChange({ blurAmount: value[0] })} className="w-24" />
                            <span className="w-7 text-xs text-muted-foreground">{blurAmount}</span>
                        </div>
                    </>
                )}
                <div className="h-6 w-px bg-border" />
                <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeZoom(zoom - 0.25)} disabled={zoom <= 1} title={t('smartTools.zoomOut', '축소')}>
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-8 w-14 tabular-nums" onClick={() => changeZoom(1)} title={t('smartTools.resetZoom', '원래 크기')}>
                        {Math.round(zoom * 100)}%
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => changeZoom(zoom + 0.25)} disabled={zoom >= 4} title={t('smartTools.zoomIn', '확대')}>
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </div>
                <div className="h-6 w-px bg-border" />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={undoCount === 0} title={t('smartTools.undo', '되돌리기')}>
                    <Undo className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={redoCount === 0} title={t('smartTools.redo', '다시 하기')}>
                    <Redo className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={resetEdits} title={t('censor.resetStrokes', '방금 칠한 것 모두 지우기')}>
                    <RotateCcw className="h-4 w-4" />
                </Button>
            </div>

            <div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto rounded-lg bg-muted/40 p-2" onWheel={handleWheel} data-censor-canvas-area>
                <div className="flex h-max min-h-full w-max min-w-full items-center justify-center">
                    <div
                        className="relative shrink-0"
                        style={{
                            width: displaySize ? `${Math.round(displaySize.width * zoom)}px` : '1px',
                            height: displaySize ? `${Math.round(displaySize.height * zoom)}px` : '1px',
                            visibility: displaySize ? 'visible' : 'hidden',
                        }}
                    >
                        <canvas ref={baseCanvasRef} className="block h-full w-full" />
                        <canvas
                            ref={editCanvasRef}
                            data-censor-canvas
                            className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={stopDrawing}
                            onPointerCancel={stopDrawing}
                            onPointerEnter={updateBrushCursor}
                            onPointerLeave={hideBrushCursor}
                            onContextMenu={event => event.preventDefault()}
                        />
                        <div ref={brushCursorRef} className="pointer-events-none absolute left-0 top-0 border border-white/90 transition-opacity duration-100" style={{ opacity: 0 }} />
                    </div>
                </div>
            </div>
        </div>
    )
})
