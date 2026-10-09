/**
 * 작업 기록 남기기. 이미지가 한 장 만들어질 때마다 모델별 장수를 올리고,
 * 그 직후 잔량이 갱신되면 줄어든 만큼(Anlas, V5 %)을 그 모델의 사용량으로 적는다.
 */
import { useAuthStore } from '@/stores/auth-store'
import { useWorkLogStore } from '@/stores/work-log-store'
import { WORK_LOG_ATTRIBUTION_MS, dateKey, usageSpent, type UsageSnapshot } from '@/lib/work-log'

let lastModel = ''
let lastGeneratedAt = 0
let snapshot: UsageSnapshot | null = null
let installed = false

const readSnapshot = (): UsageSnapshot => {
    const state = useAuthStore.getState()
    return {
        account: state.token,
        anlas: state.anlas ? state.anlas.total : null,
        v5Percent: state.imageGenerationUsage ? state.imageGenerationUsage.percent : null,
    }
}

/** 이미지 한 장이 만들어졌다 (메인 · 씬 모드 공통). */
export function logGeneratedImage(model: string): void {
    try {
        lastModel = model
        lastGeneratedAt = Date.now()
        useWorkLogStore.getState().add(dateKey(lastGeneratedAt), model, { images: 1 })
    } catch (error) {
        console.warn('[WorkLog] Failed to record an image:', error)
    }
}

/** 잔량 변화를 지켜본다. 앱이 켜질 때 한 번만 부른다. */
export function installWorkLog(): void {
    if (installed) return
    installed = true
    snapshot = readSnapshot()
    useAuthStore.subscribe(() => {
        const next = readSnapshot()
        const spent = usageSpent(snapshot, next)
        snapshot = next
        // 방금 생성한 직후의 감소만 기록한다 (다른 기기에서 쓴 것, 충전 등은 넣지 않는다).
        if (!lastModel || Date.now() - lastGeneratedAt > WORK_LOG_ATTRIBUTION_MS) return
        if (spent.anlas === 0 && spent.v5Percent === 0) return
        useWorkLogStore.getState().add(dateKey(Date.now()), lastModel, spent)
    })
}
