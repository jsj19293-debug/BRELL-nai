/**
 * 예약대형 실행기: 예약된 프리셋들을 순서대로 하나씩 생성한다.
 * 생성 자체는 씬 모드의 예약 큐(useSceneGeneration)가 하고, 여기서는 한 프리셋이 끝나면 다음 프리셋으로 넘긴다.
 * 레퍼런스를 쓰는 캐릭터는 큐가 끝난 뒤 i2i 2단계까지 돌고 나서 끝난 것으로 본다.
 */
import { create } from 'zustand'
import i18n from '@/i18n'
import { toast } from '@/components/ui/use-toast'
import { useSceneStore } from '@/stores/scene-store'
import { useGenerationStore } from '@/stores/generation-store'
import { notifyGenerationDone, setGenerationNotifySuppressed } from '@/lib/generation-notify'
import { hasQueuedScenes } from '@/lib/scene-reservation'

export type ReservationRunEnd = 'done' | 'stopped' | 'halted'

interface ReservationRunnerState {
    running: boolean
    /** 실행 순서대로의 프리셋 id */
    queue: string[]
    currentId: string | null
    finished: number
    lastEnd: ReservationRunEnd | null
}

export const useReservationRunner = create<ReservationRunnerState>(() => ({
    running: false,
    queue: [],
    currentId: null,
    finished: 0,
    lastEnd: null,
}))

const NEXT_DELAY_MS = 1500
let restoreActivePresetId: string | null = null
let sawCancel = false
let subscribed = false
let nextTimer: ReturnType<typeof setTimeout> | null = null

const presetOf = (id: string | null) => useSceneStore.getState().presets.find(preset => preset.id === id)

function finish(end: ReservationRunEnd): void {
    if (nextTimer) clearTimeout(nextTimer)
    nextTimer = null
    setGenerationNotifySuppressed(false)
    const { finished, queue } = useReservationRunner.getState()
    useReservationRunner.setState({ running: false, currentId: null, lastEnd: end })
    // 예약 프리셋은 씬 모드에 보이지 않으므로, 실행 전에 보던 작품으로 되돌린다.
    const scenes = useSceneStore.getState()
    if (restoreActivePresetId && scenes.presets.some(preset => preset.id === restoreActivePresetId)) {
        scenes.setActivePreset(restoreActivePresetId)
    }
    restoreActivePresetId = null

    const t = i18n.t.bind(i18n)
    if (end === 'done') {
        const body = t('reservation.doneBody', '예약 {{n}}묶음을 모두 생성했습니다.', { n: finished })
        toast({ title: t('reservation.done', '예약대형 생성 완료'), description: body, variant: 'success' })
        notifyGenerationDone(t('reservation.done', '예약대형 생성 완료'), body, { force: true })
    } else if (end === 'halted') {
        toast({
            title: t('reservation.halted', '예약대형이 중간에 멈췄습니다'),
            description: t('reservation.haltedBody', '{{done}} / {{total}} 묶음까지 진행했습니다. 원인을 확인한 뒤 같은 설정으로 다시 예약하면 남은 씬부터 이어서 합니다.', { done: finished, total: queue.length }),
            variant: 'destructive',
        })
    } else {
        toast({ title: t('reservation.stopped', '예약대형을 중지했습니다'), description: t('reservation.stoppedBody', '같은 설정으로 다시 예약하면 남은 씬부터 이어서 합니다.') })
    }
}

function runNext(): void {
    nextTimer = null
    const state = useReservationRunner.getState()
    if (!state.running) return
    const nextId = state.queue.slice(state.finished).find(id => hasQueuedScenes(presetOf(id)))
    if (!nextId) {
        useReservationRunner.setState({ finished: state.queue.length })
        finish('done')
        return
    }
    // 이미 다 뽑혀서 건너뛴 묶음도 끝난 것으로 센다.
    useReservationRunner.setState({ currentId: nextId, finished: state.queue.indexOf(nextId) })
    sawCancel = false
    const scenes = useSceneStore.getState()
    scenes.setActivePreset(nextId)
    scenes.startNewGenerationSession()
}

function subscribeOnce(): void {
    if (subscribed) return
    subscribed = true
    useSceneStore.subscribe((state, previous) => {
        const runner = useReservationRunner.getState()
        if (!runner.running) return
        if (state.isCancelling) sawCancel = true
        if (!(previous.isGenerating && !state.isGenerating)) return
        // 한 묶음의 생성이 멈췄다.
        if (sawCancel) {
            finish('stopped')
            return
        }
        if (hasQueuedScenes(presetOf(runner.currentId))) {
            // 예약이 남았는데 멈췄다 (토큰 문제, 메인 모드와 충돌 등).
            finish('halted')
            return
        }
        useReservationRunner.setState({ finished: runner.queue.indexOf(runner.currentId ?? '') + 1 })
        nextTimer = setTimeout(runNext, NEXT_DELAY_MS)
    })
}

/** 예약된 프리셋들을 순서대로 실행한다. 다른 생성이 돌고 있으면 시작하지 않는다. */
export function startReservationRun(presetIds: string[]): boolean {
    const t = i18n.t.bind(i18n)
    const scenes = useSceneStore.getState()
    if (useReservationRunner.getState().running || scenes.isGenerating || useGenerationStore.getState().isGenerating) {
        toast({ title: t('reservation.busy', '다른 생성이 진행 중입니다'), description: t('reservation.busyBody', '지금 생성이 끝난 뒤에 예약을 시작하세요.'), variant: 'destructive' })
        return false
    }
    const queue = presetIds.filter((id, index) => presetIds.indexOf(id) === index && hasQueuedScenes(presetOf(id)))
    if (queue.length === 0) {
        toast({ title: t('reservation.nothing', '생성할 씬이 없습니다'), description: t('reservation.nothingBody', '고른 캐릭터와 씬은 이미 모두 생성돼 있습니다.') })
        return false
    }
    subscribeOnce()
    const active = presetOf(scenes.activePresetId)
    restoreActivePresetId = active && !active.characterAsset?.reservation ? active.id : null
    setGenerationNotifySuppressed(true)
    useReservationRunner.setState({ running: true, queue, currentId: null, finished: 0, lastEnd: null })
    runNext()
    return true
}

/** 지금 생성 중인 한 장이 끝나면 멈춘다. */
export function stopReservationRun(): void {
    if (!useReservationRunner.getState().running) return
    sawCancel = true
    if (nextTimer) {
        // 묶음 사이에서 멈춘 경우: 돌고 있는 생성이 없으니 바로 끝낸다.
        finish('stopped')
        return
    }
    useSceneStore.getState().cancelSceneGeneration()
}
