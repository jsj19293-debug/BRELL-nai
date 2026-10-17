import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDBStorage } from '@/lib/indexed-db'
import { uniqueFolderName, type ScenePresetFolder } from '@/lib/scene-preset-folders'

interface SceneFolderState {
    folders: ScenePresetFolder[]
    /** 작품(프리셋) id → 폴더 id */
    assignment: Record<string, string>
    addFolder: (name: string) => string
    renameFolder: (id: string, name: string) => void
    toggleFolder: (id: string) => void
    /** 폴더만 지운다. 안의 작품은 폴더 밖으로 나온다. */
    deleteFolder: (id: string) => void
    moveFolder: (id: string, delta: -1 | 1) => void
    /** folderId 가 null 이면 폴더에서 뺀다 */
    setPresetFolder: (presetId: string, folderId: string | null) => void
}

export const useSceneFolderStore = create<SceneFolderState>()(
    persist(
        (set, get) => ({
            folders: [],
            assignment: {},
            addFolder: (name) => {
                const id = `sf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
                const folderName = uniqueFolderName(name.trim() || '새 폴더', get().folders.map(folder => folder.name))
                set(state => ({ folders: [...state.folders, { id, name: folderName, collapsed: false }] }))
                return id
            },
            renameFolder: (id, name) => set(state => ({
                folders: state.folders.map(folder => folder.id === id && name.trim() ? { ...folder, name: name.trim().slice(0, 40) } : folder),
            })),
            toggleFolder: (id) => set(state => ({ folders: state.folders.map(folder => folder.id === id ? { ...folder, collapsed: !folder.collapsed } : folder) })),
            deleteFolder: (id) => set(state => ({
                folders: state.folders.filter(folder => folder.id !== id),
                assignment: Object.fromEntries(Object.entries(state.assignment).filter(([, folderId]) => folderId !== id)),
            })),
            moveFolder: (id, delta) => set(state => {
                const index = state.folders.findIndex(folder => folder.id === id)
                const target = index + delta
                if (index < 0 || target < 0 || target >= state.folders.length) return state
                const folders = [...state.folders]
                const [moved] = folders.splice(index, 1)
                folders.splice(target, 0, moved)
                return { folders }
            }),
            setPresetFolder: (presetId, folderId) => set(state => {
                const assignment = { ...state.assignment }
                if (folderId) assignment[presetId] = folderId
                else delete assignment[presetId]
                return { assignment }
            }),
        }),
        {
            name: 'nightmare-scene-preset-folders',
            storage: createJSONStorage(() => indexedDBStorage),
        },
    ),
)
