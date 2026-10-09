import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDBStorage } from '@/lib/indexed-db'

/**
 * 폴더 관리자: 작품(씬 모드 프리셋)마다 결과물을 모아 둘 폴더를 연결해 둔다.
 * 씬 모드의 WebP 내보내기는 연결된 폴더를 기본 저장 위치로 쓴다.
 */
interface FolderState {
    /** 작품 폴더들을 모아 두는 위치. 비어 있으면 사진 폴더 아래 Nightmare2 */
    rootPath: string
    /** 씬 프리셋 id → 연결된 폴더 경로 */
    links: Record<string, string>
    setRootPath: (path: string) => void
    linkFolder: (presetId: string, folderPath: string) => void
    unlinkFolder: (presetId: string) => void
}

export const useFolderStore = create<FolderState>()(
    persist(
        (set) => ({
            rootPath: '',
            links: {},
            setRootPath: (rootPath) => set({ rootPath: rootPath.trim() }),
            linkFolder: (presetId, folderPath) => set(state => {
                // 한 폴더는 한 작품에만 연결한다.
                const links = Object.fromEntries(
                    Object.entries(state.links).filter(([, path]) => path.toLocaleLowerCase() !== folderPath.toLocaleLowerCase()),
                )
                links[presetId] = folderPath
                return { links }
            }),
            unlinkFolder: (presetId) => set(state => {
                const links = { ...state.links }
                delete links[presetId]
                return { links }
            }),
        }),
        {
            name: 'nais2-rell-folders',
            storage: createJSONStorage(() => indexedDBStorage),
        },
    ),
)
