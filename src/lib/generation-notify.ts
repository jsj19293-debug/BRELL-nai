/** 생성이 끝났을 때 PC 알림과 소리로 알려준다. 둘 다 설정에서 켜고 끌 수 있다. */
import { sendSystemNotification } from '@/lib/system-notification'
import { useSettingsStore } from '@/stores/settings-store'

let audioContext: AudioContext | null = null

/** 짧은 두 음짜리 알림음 (소리 파일 없이 만든다). */
export function playDoneSound(): void {
    try {
        const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Context) return
        audioContext = audioContext ?? new Context()
        const context = audioContext
        void context.resume()
        const start = context.currentTime + 0.02
        ;[[880, 0], [1174.66, 0.16]].forEach(([frequency, offset]) => {
            const oscillator = context.createOscillator()
            const gain = context.createGain()
            oscillator.type = 'sine'
            oscillator.frequency.value = frequency
            gain.gain.setValueAtTime(0.0001, start + offset)
            gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.32)
            oscillator.connect(gain).connect(context.destination)
            oscillator.start(start + offset)
            oscillator.stop(start + offset + 0.35)
        })
    } catch (error) {
        console.warn('[Notify] Unable to play the done sound:', error)
    }
}

export function notifyGenerationDone(title: string, body: string): void {
    const { generationDoneNotify, generationDoneSound } = useSettingsStore.getState()
    if (generationDoneNotify) void sendSystemNotification(title, body)
    if (generationDoneSound) playDoneSound()
}
