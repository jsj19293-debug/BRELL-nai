/** 블러 모드에서 쓰는 이름과, 포인터 아래의 이미지 고르기 (DOM·저장소 없이 검사 가능). */
export const BLUR_MODE_CLASS = 'blur-mode'
export const BLUR_REVEAL_ATTRIBUTE = 'data-blur-reveal'
export const BLUR_EXEMPT_ATTRIBUTE = 'data-no-blur'

/** 포인터 아래에 쌓인 요소들 중 흐리게 처리되는 이미지를 고른다 (위에 있는 것부터). */
export function pickBlurredImage(stack: readonly Element[]): Element | null {
    for (const element of stack) {
        if (element.tagName !== 'IMG') continue
        if (element.hasAttribute(BLUR_EXEMPT_ATTRIBUTE)) continue
        if (element.closest(`[${BLUR_EXEMPT_ATTRIBUTE}]`)) continue
        return element
    }
    return null
}
