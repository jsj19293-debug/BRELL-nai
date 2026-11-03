import { create } from 'zustand'

/** 이미지 오른쪽 클릭 → 후처리 팝업에 열 이미지 */
interface PostprocessPopupState {
    path: string | null
    open: (path: string) => void
    close: () => void
}

export const usePostprocessPopup = create<PostprocessPopupState>(set => ({
    path: null,
    open: path => set({ path }),
    close: () => set({ path: null }),
}))
