import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDBStorage } from '@/lib/indexed-db'

/** "작업완료하기"로 결과물을 모아 둘 보관 폴더 */
interface JobDoneState {
    archiveFolder: string
    setArchiveFolder: (path: string) => void
}

export const useJobDoneStore = create<JobDoneState>()(
    persist(
        set => ({
            archiveFolder: '',
            setArchiveFolder: path => set({ archiveFolder: path }),
        }),
        { name: 'nightmare-job-done', storage: createJSONStorage(() => indexedDBStorage) },
    ),
)
