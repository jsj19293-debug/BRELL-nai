/**
 * 블러 모드: 켜져 있으면 화면의 이미지를 흐리게 보여주고, 마우스를 올린 이미지만 또렷하게 한다.
 * 버튼 같은 것이 이미지를 덮고 있어도 포인터 아래의 이미지를 찾아서 푼다.
 */
import { useSettingsStore } from '@/stores/settings-store'

import { BLUR_MODE_CLASS, BLUR_REVEAL_ATTRIBUTE, pickBlurredImage } from '@/lib/blur-mode-pick'

let installed = false

export function installBlurMode(): void {
    if (installed || typeof document === 'undefined') return
    installed = true

    let revealed: Element | null = null
    let pointer: { x: number; y: number } | null = null
    let frame = 0

    const reveal = (next: Element | null) => {
        if (next === revealed) return
        revealed?.removeAttribute(BLUR_REVEAL_ATTRIBUTE)
        next?.setAttribute(BLUR_REVEAL_ATTRIBUTE, '')
        revealed = next
    }

    const update = () => {
        frame = 0
        if (!pointer || !document.documentElement.classList.contains(BLUR_MODE_CLASS)) {
            reveal(null)
            return
        }
        reveal(pickBlurredImage(document.elementsFromPoint(pointer.x, pointer.y)))
    }
    const schedule = () => {
        if (!frame) frame = requestAnimationFrame(update)
    }

    document.addEventListener('pointermove', event => {
        pointer = { x: event.clientX, y: event.clientY }
        schedule()
    }, { passive: true })
    // 마우스를 움직이지 않고 스크롤해도 포인터 아래의 이미지가 바뀐다.
    document.addEventListener('scroll', schedule, { passive: true, capture: true })
    document.documentElement.addEventListener('pointerleave', () => {
        pointer = null
        schedule()
    })
    window.addEventListener('blur', () => {
        pointer = null
        schedule()
    })

    const apply = (enabled: boolean) => {
        document.documentElement.classList.toggle(BLUR_MODE_CLASS, enabled)
        schedule()
    }
    apply(useSettingsStore.getState().blurModeEnabled)
    useSettingsStore.subscribe(state => apply(state.blurModeEnabled))
}
