import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'
import { highlightNote, type HighlightKind } from '@/lib/note-highlight'

const COLOR: Record<HighlightKind, string> = {
    h1: 'text-sky-400',
    h2: 'text-amber-300',
    h3: 'text-violet-300',
    macro: 'text-emerald-400',
    text: 'text-foreground',
}

interface HighlightTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    value: string
    /** 바깥 상자에 줄 클래스 (크기 · 배치) */
    wrapperClassName?: string
}

/**
 * 색이 입혀지는 입력 칸: "# 제목" 파랑, "## 소제목" 노랑, "### " 보라, {{user}} 초록.
 * 실제 입력은 평범한 textarea 가 받고, 그 뒤에 같은 글자를 색만 입혀 겹쳐 그린다.
 */
export const HighlightTextarea = forwardRef<HTMLTextAreaElement, HighlightTextareaProps>(function HighlightTextarea(
    { value, className, wrapperClassName, onScroll, ...props },
    ref,
) {
    const areaRef = useRef<HTMLTextAreaElement>(null)
    const frameRef = useRef<HTMLDivElement>(null)
    const innerRef = useRef<HTMLDivElement>(null)
    useImperativeHandle(ref, () => areaRef.current as HTMLTextAreaElement)

    const pieces = useMemo(() => highlightNote(value), [value])

    // 뒤에 그린 글자가 입력 칸과 정확히 겹치도록 크기와 스크롤을 맞춘다 (스크롤바 폭 제외).
    const sync = useCallback(() => {
        const area = areaRef.current
        const frame = frameRef.current
        const inner = innerRef.current
        if (!area || !frame || !inner) return
        frame.style.left = `${area.clientLeft}px`
        frame.style.top = `${area.clientTop}px`
        frame.style.width = `${area.clientWidth}px`
        frame.style.height = `${area.clientHeight}px`
        inner.style.transform = `translate(${-area.scrollLeft}px, ${-area.scrollTop}px)`
    }, [])

    useEffect(() => {
        const area = areaRef.current
        if (!area) return
        sync()
        const observer = new ResizeObserver(sync)
        observer.observe(area)
        return () => observer.disconnect()
    }, [sync])
    useEffect(sync, [value, sync])

    return (
        <div className={cn('relative', wrapperClassName)}>
            <div ref={frameRef} aria-hidden className="pointer-events-none absolute overflow-hidden">
                <div
                    ref={innerRef}
                    className={cn('px-3 py-2', className?.match(/\b(text-(xs|sm|base|lg)|leading-\S+|font-mono)\b/g)?.join(' '))}
                    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'normal' }}
                >
                    {pieces.map((piece, index) => <span key={index} className={COLOR[piece.kind]}>{piece.text}</span>)}
                    {/* 마지막 줄바꿈 뒤에도 한 줄 높이를 둔다 */}
                    {'​'}
                </div>
            </div>
            <textarea
                ref={areaRef}
                value={value}
                onScroll={event => { sync(); onScroll?.(event) }}
                className={cn(
                    'relative flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-transparent caret-foreground shadow-sm placeholder:text-muted-foreground selection:bg-primary/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                    className,
                )}
                style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}
                data-highlight-textarea
                {...props}
            />
        </div>
    )
})
