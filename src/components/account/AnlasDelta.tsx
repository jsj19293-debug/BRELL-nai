import { useEffect, useRef, useState } from 'react'

/**
 * Anlas 잔액 옆에 방금 빠져나간 양을 "-5" 처럼 잠깐 보여 준다.
 * 계정이 바뀌어서 숫자가 달라진 경우는 차감이 아니므로 표시하지 않는다.
 */
export function AnlasDelta({ total, accountKey }: { total: number; accountKey: string }) {
    const previous = useRef({ total, accountKey })
    const [delta, setDelta] = useState<{ value: number; id: number } | null>(null)

    useEffect(() => {
        const before = previous.current
        previous.current = { total, accountKey }
        if (before.accountKey !== accountKey) {
            setDelta(null)
            return
        }
        const diff = total - before.total
        if (diff >= 0) {
            // 충전 등으로 늘어난 경우: 이전 차감 표시는 지운다.
            setDelta(null)
            return
        }
        setDelta({ value: diff, id: Date.now() })
        const timer = window.setTimeout(() => setDelta(null), 8000)
        return () => window.clearTimeout(timer)
    }, [total, accountKey])

    if (!delta) return null
    return (
        <span key={delta.id} data-anlas-delta className="anlas-delta text-sm font-bold tabular-nums text-rose-400">
            {delta.value.toLocaleString()}
        </span>
    )
}
