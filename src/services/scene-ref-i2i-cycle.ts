/**
 * 씬 모드 "레퍼런스 → i2i" 자동 싸이클의 실행부.
 * 예약 큐(useSceneGeneration)가 1단계 이미지를 저장할 때마다 기록해 두었다가,
 * 큐가 비면 기록된 이미지마다 레퍼런스 없는 i2i를 한 장씩 생성한다.
 * 무엇을 어떤 순서로 만들지는 src/lib/scene-i2i-cycle.ts가 정한다.
 */
import { create } from 'zustand'
import { readFile } from '@tauri-apps/plugin-fs'
import i18n from '@/i18n'
import { toast } from '@/components/ui/use-toast'
import { useSceneStore, type SceneCharacterSequenceEntry } from '@/stores/scene-store'
import { useSettingsStore } from '@/stores/settings-store'
import { calculateGenerationDelay } from '@/lib/generation-delay'
import { assetBehaviourEnabled, presetWantsI2iCycle } from '@/lib/character-asset-presets'
import { randomSeed, reservationI2iFolder, reservationSeed } from '@/lib/scene-reservation'
import { generateSceneImage, type SceneImageSavedInfo } from '@/services/scene-generation'
import {
    beginCycle,
    bytesToDataUrl,
    clampSceneI2iNoise,
    clampSceneI2iStrength,
    idleCycleState,
    imageMimeForPath,
    latestImagePerScene,
    planSecondPass,
    recordFirstPass,
    shouldRunSecondPass,
    type SceneI2iCyclePhase,
    type SceneI2iCycleState,
} from '@/lib/scene-i2i-cycle'

type Entry = SceneCharacterSequenceEntry
let cycle: SceneI2iCycleState<Entry> = idleCycleState<Entry>()
/** 이번 세션이 "I2I로 변형"(이미 있던 이미지를 I2I로만 돌리기)인지 */
let convertSessionId: number | null = null

/** 화면 표시용 진행 상태 (저장하지 않는다) */
export const useSceneI2iCycleStatus = create<{ phase: SceneI2iCyclePhase; done: number; total: number }>(() => ({
    phase: 'idle',
    done: 0,
    total: 0,
}))
const showPhase = (phase: SceneI2iCyclePhase, done = 0, total = 0) => useSceneI2iCycleStatus.setState({ phase, done, total })

/** 예약 큐가 한 장을 처리하기 전에 부른다. 새 세션이면 그 시점의 설정으로 싸이클을 정한다. */
export function ensureSceneI2iCycle(sessionId: number): void {
    if (cycle.sessionId === sessionId) return
    // 씬 모드의 스위치가 켜져 있거나, 지금 생성하는 캐릭터씬에 싸이클이 예약돼 있으면 돌린다.
    const settings = useSettingsStore.getState()
    const scenes = useSceneStore.getState()
    const preset = scenes.presets.find(candidate => candidate.id === scenes.activePresetId)
    cycle = beginCycle(cycle, sessionId, presetWantsI2iCycle(settings.sceneRefI2iCycleEnabled, preset, assetBehaviourEnabled(preset, settings)))
    showPhase(cycle.phase)
}

/** 1단계 이미지가 저장됐을 때 부른다. */
export function recordSceneI2iFirstPass(
    sessionId: number,
    sceneId: string,
    sequenceEntry: Entry | null,
    info: SceneImageSavedInfo,
): void {
    cycle = recordFirstPass(cycle, sessionId, { sceneId, sequenceEntry, ...info })
}

export function resetSceneI2iCycle(): void {
    cycle = idleCycleState<Entry>()
    showPhase('idle')
}

const stillRunning = (sessionId: number): boolean => {
    const state = useSceneStore.getState()
    return state.isGenerating && !state.isCancelling && state.generationSessionId === sessionId
}
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** 지금 "I2I로 변형"할 수 있는 이미지 수 (씬마다 가장 최근 1장) */
export function countSceneI2iConvertTargets(presetId: string | null): number {
    const preset = useSceneStore.getState().presets.find(candidate => candidate.id === presetId)
    return preset ? latestImagePerScene(preset.scenes).length : 0
}

/**
 * "I2I로 변형": 레퍼런스를 썼든 안 썼든, 씬마다 가장 최근 이미지 1장을 원본으로 삼아 레퍼런스 없는 I2I를 한 장씩 만든다.
 * 새로 1단계를 뽑지 않고, 평소의 2단계(I2I) 실행부를 그대로 쓴다: 취소 · 진행 표시 · 저장 폴더 규칙이 같다.
 */
export function startSceneI2iConvert(presetId: string): 'started' | 'busy' | 'queued' | 'empty' {
    const scenes = useSceneStore.getState()
    if (scenes.isGenerating || scenes.activePresetId !== presetId) return 'busy'
    // 예약이 남아 있으면 그것부터 새로 뽑게 되므로 섞이지 않게 막는다.
    if (scenes.getTotalQueueCount(presetId) > 0) return 'queued'
    const preset = scenes.presets.find(candidate => candidate.id === presetId)
    const picks = preset ? latestImagePerScene(preset.scenes) : []
    if (picks.length === 0) return 'empty'

    const sessionId = scenes.startNewGenerationSession()
    convertSessionId = sessionId
    // 시드 0 = 따로 정하지 않음: 씬에 고정한 시드가 있으면 그것, 없으면 메인의 시드 설정을 따른다.
    cycle = {
        sessionId,
        enabled: true,
        phase: 'first',
        records: picks.map(pick => ({ sceneId: pick.sceneId, path: pick.path, seed: 0, sequenceEntry: null })),
    }
    showPhase('second', 0, picks.length)
    return 'started'
}

export type SecondPassOutcome = 'skipped' | 'done' | 'cancelled' | 'failed'

/**
 * 예약 큐가 비었을 때 부른다. 싸이클이 켜져 있고 1단계 이미지가 있으면 2단계를 끝까지 돌린다.
 * 취소되면 'cancelled', 오류로 멈추면 'failed'.
 */
export async function runSceneI2iSecondPass(sessionId: number, presetId: string): Promise<SecondPassOutcome> {
    if (!shouldRunSecondPass(cycle, sessionId)) {
        if (cycle.sessionId === sessionId) resetSceneI2iCycle()
        return 'skipped'
    }
    const t = i18n.t.bind(i18n)
    const scenes = useSceneStore.getState().presets.find(preset => preset.id === presetId)?.scenes ?? []
    const steps = planSecondPass(cycle.records, scenes)
    cycle = { ...cycle, phase: 'second', records: [] }
    if (steps.length === 0) {
        resetSceneI2iCycle()
        return 'skipped'
    }

    const settings = useSettingsStore.getState()
    const strength = clampSceneI2iStrength(settings.sceneRefI2iStrength)
    const noise = clampSceneI2iNoise(settings.sceneRefI2iNoise)
    const disableVibes = settings.sceneRefI2iDisableVibes
    const { setStreamingData, setGenerationProgress } = useSceneStore.getState()

    showPhase('second', 0, steps.length)
    setGenerationProgress(0, steps.length)
    toast(convertSessionId === sessionId ? {
        title: t('sceneI2iCycle.convertTitle', 'I2I 변형 시작'),
        description: t('sceneI2iCycle.convertDescription', '씬마다 가장 최근 이미지 1장씩, 모두 {{count}}장을 변화 강도 {{strength}}로 I2I 생성합니다.', {
            count: steps.length,
            strength: strength.toFixed(2),
        }),
    } : {
        title: t('sceneI2iCycle.secondPassTitle', '2단계 시작: 레퍼런스 없이 i2i'),
        description: t('sceneI2iCycle.secondPassDescription', '1단계 이미지 {{count}}장을 변화 강도 {{strength}}로 다시 생성합니다.', {
            count: steps.length,
            strength: strength.toFixed(2),
        }),
    })

    const cyclePreset = useSceneStore.getState().presets.find(preset => preset.id === presetId)
    const reservationAsset = cyclePreset?.characterAsset?.reservation && assetBehaviourEnabled(cyclePreset, useSettingsStore.getState())
        ? cyclePreset.characterAsset
        : undefined

    let outcome: SecondPassOutcome = 'done'
    try {
        for (let index = 0; index < steps.length; index++) {
            if (!stillRunning(sessionId)) {
                outcome = 'cancelled'
                break
            }
            const { scene, record } = steps[index]
            let sourceImage: string
            try {
                sourceImage = bytesToDataUrl(await readFile(record.path), imageMimeForPath(record.path))
            } catch (error) {
                // 1단계 파일을 그 사이에 지웠거나 옮겼다면 그 장만 건너뛴다.
                console.warn('[SceneI2iCycle] first-pass image is not readable, skipping:', record.path, error)
                showPhase('second', index + 1, steps.length)
                continue
            }

            // 예약대형: i2i 시드(고정/랜덤)와 저장 폴더(<캐릭터>_I2I/<씬>)는 예약할 때 정한 대로.
            // 그 밖에는 1단계와 같은 시드로, 씬의 폴더에 저장한다.
            const reservedI2iSeed = reservationAsset ? reservationSeed(reservationAsset, 'i2i') : null
            const i2iSeed = reservedI2iSeed === 'random' ? randomSeed() : typeof reservedI2iSeed === 'number' ? reservedI2iSeed : record.seed
            const i2iFolder = reservationI2iFolder(reservationAsset, scene.folderPath)

            setStreamingData(scene.id, null, 0)
            let attempts = 0
            for (;;) {
                try {
                    await generateSceneImage({
                        presetId,
                        scene,
                        sequenceEntry: record.sequenceEntry,
                        secondPass: {
                            sourceImage,
                            strength,
                            noise,
                            seed: i2iSeed,
                            characterPromptIds: record.characterPromptIds,
                            disableVibes,
                        },
                        ...(i2iFolder ? { saveFolder: i2iFolder } : {}),
                    })
                    break
                } catch (error) {
                    const message = String(error)
                    const rateLimited = message.includes('429') || message.toLowerCase().includes('too many requests')
                    if (rateLimited && ++attempts <= 3 && stillRunning(sessionId)) {
                        await sleep(3000)
                        continue
                    }
                    throw error
                }
            }
            setStreamingData(null, null, 0)
            showPhase('second', index + 1, steps.length)

            if (index + 1 < steps.length && stillRunning(sessionId)) {
                const { generationDelay, generationDelayJitter } = useSettingsStore.getState()
                const delay = calculateGenerationDelay(generationDelay, generationDelayJitter)
                if (delay > 0) await sleep(delay)
            }
        }
        if (outcome === 'done' && !stillRunning(sessionId)) {
            // 마지막 장을 만드는 동안 취소를 눌렀다면 취소로 마무리한다.
            const state = useSceneStore.getState()
            if (state.isCancelling || state.generationSessionId !== sessionId) outcome = 'cancelled'
        }
    } catch (error) {
        console.error('[SceneI2iCycle] second pass failed:', error)
        setStreamingData(null, null, 0)
        toast({ title: t('common.error', '오류'), description: String(error), variant: 'destructive' })
        outcome = 'failed'
    } finally {
        resetSceneI2iCycle()
    }
    return outcome
}
