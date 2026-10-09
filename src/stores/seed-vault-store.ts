import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDBStorage } from '@/lib/indexed-db'
import { addSeedEntry, type SeedVaultEntry } from '@/lib/seed-vault'

interface SeedVaultState {
    entries: SeedVaultEntry[]
    /** 보관함 창 열림 여부 (다른 화면에서도 열 수 있게 스토어에 둔다) */
    open: boolean
    setOpen: (open: boolean) => void
    /** 이미 있던 항목이면 true */
    add: (entry: SeedVaultEntry) => boolean
    setMemo: (id: string, memo: string) => void
    remove: (id: string) => void
}

export const useSeedVaultStore = create<SeedVaultState>()(
    persist(
        (set, get) => ({
            entries: [],
            open: false,
            setOpen: (open) => set({ open }),
            add: (entry) => {
                const result = addSeedEntry(get().entries, entry)
                set({ entries: result.entries })
                return result.duplicate
            },
            setMemo: (id, memo) => set(state => ({ entries: state.entries.map(entry => entry.id === id ? { ...entry, memo } : entry) })),
            remove: (id) => set(state => ({ entries: state.entries.filter(entry => entry.id !== id) })),
        }),
        {
            name: 'nightmare2-seed-vault',
            storage: createJSONStorage(() => indexedDBStorage),
            partialize: (state) => ({ entries: state.entries }) as SeedVaultState,
        },
    ),
)
