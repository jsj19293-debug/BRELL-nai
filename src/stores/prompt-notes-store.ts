import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDBStorage } from '@/lib/indexed-db'
import {
    PROJECT_MAX_COUNT, PROJECT_NAME_MAX_CHARS, WORLD_MAX_CHARS, IMAGES_MAX_PER_ITEM,
    canAddLore, canAddMemo, clampChars, createProject, normalizeLore, normalizeMemo,
    type LoreEntry, type MemoNote, type PromptProject,
} from '@/lib/prompt-notes'

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

interface PromptNotesState {
    projects: PromptProject[]
    activeProjectId: string | null

    addProject: (name: string) => string | null
    renameProject: (id: string, name: string) => void
    deleteProject: (id: string) => void
    setActiveProject: (id: string) => void

    setWorld: (projectId: string, world: string) => void
    setWorldImages: (projectId: string, images: string[]) => void

    addLore: (projectId: string) => string | null
    updateLore: (projectId: string, loreId: string, patch: Partial<Omit<LoreEntry, 'id'>>) => void
    deleteLore: (projectId: string, loreId: string) => void
    moveLore: (projectId: string, loreId: string, direction: -1 | 1) => void

    addMemo: (projectId: string) => string | null
    updateMemo: (projectId: string, memoId: string, patch: Partial<Omit<MemoNote, 'id'>>) => void
    deleteMemo: (projectId: string, memoId: string) => void
}

export const usePromptNotesStore = create<PromptNotesState>()(
    persist(
        (set, get) => {
            const patchProject = (projectId: string, change: (project: PromptProject) => PromptProject) =>
                set(state => ({
                    projects: state.projects.map(project =>
                        project.id === projectId ? { ...change(project), updatedAt: Date.now() } : project),
                }))

            return {
                projects: [],
                activeProjectId: null,

                addProject: (name) => {
                    if (get().projects.length >= PROJECT_MAX_COUNT) return null
                    const project = createProject(newId(), name, Date.now())
                    set(state => ({ projects: [...state.projects, project], activeProjectId: project.id }))
                    return project.id
                },
                renameProject: (id, name) => patchProject(id, project => ({
                    ...project,
                    name: clampChars(name.trim(), PROJECT_NAME_MAX_CHARS) || project.name,
                })),
                deleteProject: (id) => set(state => {
                    const projects = state.projects.filter(project => project.id !== id)
                    return {
                        projects,
                        activeProjectId: state.activeProjectId === id ? (projects[0]?.id ?? null) : state.activeProjectId,
                    }
                }),
                setActiveProject: (id) => set({ activeProjectId: id }),

                setWorld: (projectId, world) => patchProject(projectId, project => ({
                    ...project,
                    world: clampChars(world, WORLD_MAX_CHARS),
                })),
                setWorldImages: (projectId, images) => patchProject(projectId, project => ({
                    ...project,
                    worldImages: images.slice(0, IMAGES_MAX_PER_ITEM),
                })),

                addLore: (projectId) => {
                    const project = get().projects.find(candidate => candidate.id === projectId)
                    if (!project || !canAddLore(project)) return null
                    const entry: LoreEntry = { id: newId(), title: '', content: '', keywords: '', images: [], updatedAt: Date.now() }
                    patchProject(projectId, current => ({ ...current, lore: [...current.lore, entry] }))
                    return entry.id
                },
                updateLore: (projectId, loreId, patch) => patchProject(projectId, project => ({
                    ...project,
                    lore: project.lore.map(entry =>
                        entry.id === loreId ? normalizeLore({ ...entry, ...patch, id: entry.id, updatedAt: Date.now() }) : entry),
                })),
                deleteLore: (projectId, loreId) => patchProject(projectId, project => ({
                    ...project,
                    lore: project.lore.filter(entry => entry.id !== loreId),
                })),
                moveLore: (projectId, loreId, direction) => patchProject(projectId, project => {
                    const index = project.lore.findIndex(entry => entry.id === loreId)
                    const target = index + direction
                    if (index < 0 || target < 0 || target >= project.lore.length) return project
                    const lore = [...project.lore]
                    ;[lore[index], lore[target]] = [lore[target], lore[index]]
                    return { ...project, lore }
                }),

                addMemo: (projectId) => {
                    const project = get().projects.find(candidate => candidate.id === projectId)
                    if (!project || !canAddMemo(project)) return null
                    const memo: MemoNote = { id: newId(), title: '', content: '', images: [], updatedAt: Date.now() }
                    patchProject(projectId, current => ({ ...current, memos: [memo, ...current.memos] }))
                    return memo.id
                },
                updateMemo: (projectId, memoId, patch) => patchProject(projectId, project => ({
                    ...project,
                    memos: project.memos.map(memo =>
                        memo.id === memoId ? normalizeMemo({ ...memo, ...patch, id: memo.id, updatedAt: Date.now() }) : memo),
                })),
                deleteMemo: (projectId, memoId) => patchProject(projectId, project => ({
                    ...project,
                    memos: project.memos.filter(memo => memo.id !== memoId),
                })),
            }
        },
        {
            name: 'nais2-rell-prompt-notes',
            storage: createJSONStorage(() => indexedDBStorage),
        },
    ),
)
