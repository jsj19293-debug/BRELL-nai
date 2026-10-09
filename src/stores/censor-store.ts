import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDBStorage } from '@/lib/indexed-db'
import { DEFAULT_CENSOR_BRUSH, clampBrush, type CensorBrush } from '@/lib/censor-review'

interface CensorState {
    /** 마지막으로 보던 폴더 */
    folderPath: string
    /** 폴더(소문자 경로) → 넘겨 본 파일 이름(소문자)들 */
    viewed: Record<string, string[]>
    brush: CensorBrush
    /** 칠하지 않고 넘긴 이미지도 검열본 폴더에 복사해서 한 벌을 만든다 */
    copyUntouched: boolean
    setFolderPath: (path: string) => void
    markViewed: (folderKey: string, name: string) => void
    clearViewed: (folderKey: string) => void
    setBrush: (change: Partial<CensorBrush>) => void
    setCopyUntouched: (value: boolean) => void
}

export const useCensorStore = create<CensorState>()(
    persist(
        (set) => ({
            folderPath: '',
            viewed: {},
            brush: DEFAULT_CENSOR_BRUSH,
            copyUntouched: false,
            setFolderPath: (folderPath) => set({ folderPath }),
            markViewed: (folderKey, name) => set(state => {
                const current = state.viewed[folderKey] ?? []
                const lower = name.toLowerCase()
                if (current.includes(lower)) return state
                return { viewed: { ...state.viewed, [folderKey]: [...current, lower] } }
            }),
            clearViewed: (folderKey) => set(state => {
                const next = { ...state.viewed }
                delete next[folderKey]
                return { viewed: next }
            }),
            setBrush: (change) => set(state => ({ brush: clampBrush({ ...state.brush, ...change }) })),
            setCopyUntouched: (copyUntouched) => set({ copyUntouched }),
        }),
        {
            name: 'nightmare2-censor',
            storage: createJSONStorage(() => indexedDBStorage),
        },
    ),
)
