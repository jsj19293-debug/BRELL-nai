import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDBStorage } from '@/lib/indexed-db'
import { addToWorkLog, type WorkLogDay, type WorkLogModelEntry } from '@/lib/work-log'

interface WorkLogState {
    days: WorkLogDay[]
    add: (date: string, model: string, change: Partial<WorkLogModelEntry>) => void
    clear: () => void
}

export const useWorkLogStore = create<WorkLogState>()(
    persist(
        (set) => ({
            days: [],
            add: (date, model, change) => set(state => ({ days: addToWorkLog(state.days, date, model, change) })),
            clear: () => set({ days: [] }),
        }),
        {
            name: 'nais2-rell-work-log',
            storage: createJSONStorage(() => indexedDBStorage),
        },
    ),
)
