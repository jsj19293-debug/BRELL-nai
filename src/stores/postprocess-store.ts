import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDBStorage } from '@/lib/indexed-db'
import { uniqueTemplateName } from '@/lib/postprocess'
import { pathKey } from '@/lib/scene-folder-sync'

/** 말풍선 공방에서 저장한 후처리 템플릿: 말풍선 · 대사 · 스티커 · 효과 구성 (그림은 빠짐) */
export interface PostprocessTemplate {
    id: string
    name: string
    /** 말풍선 공방 문서 (state). 그림(image)은 비어 있다. */
    doc: unknown
    width: number
    height: number
    /** 목록에 보여 줄 작은 미리보기 (JPEG data URL) */
    thumbnail: string
    createdAt: number
}

interface PostprocessState {
    templates: PostprocessTemplate[]
    /** 작품 id → 씬 id → 템플릿 id: 그 씬에서 이미지를 뽑으면 마지막에 자동으로 입힌다 */
    sceneTemplates: Record<string, Record<string, string>>
    /** 후처리를 입힌 이미지 (원본 경로 키 → 어떤 후처리로, 어디에 저장했는지): "+후처리 적용중" 표시에 쓴다 */
    applied: Record<string, { templateId: string; output: string; at: number }>
    updateTemplate: (id: string, patch: Partial<Pick<PostprocessTemplate, 'doc' | 'width' | 'height' | 'thumbnail'>>) => void
    markApplied: (imagePath: string, templateId: string, output: string) => void
    addTemplate: (template: Omit<PostprocessTemplate, 'id' | 'createdAt' | 'name'> & { name: string }) => string
    renameTemplate: (id: string, name: string) => void
    deleteTemplate: (id: string) => void
    setSceneTemplate: (presetId: string, sceneId: string, templateId: string | null) => void
}

export const usePostprocessStore = create<PostprocessState>()(
    persist(
        (set, get) => ({
            templates: [],
            sceneTemplates: {},
            applied: {},
            updateTemplate: (id, patch) => set(state => ({ templates: state.templates.map(item => item.id === id ? { ...item, ...patch } : item) })),
            markApplied: (imagePath, templateId, output) => set(state => ({ applied: { ...state.applied, [pathKey(imagePath)]: { templateId, output, at: Date.now() } } })),
            addTemplate: (template) => {
                const id = `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
                const name = uniqueTemplateName(template.name, get().templates.map(item => item.name))
                set(state => ({ templates: [...state.templates, { ...template, id, name, createdAt: Date.now() }] }))
                return id
            },
            renameTemplate: (id, name) => set(state => ({
                templates: state.templates.map(item => item.id === id
                    ? { ...item, name: uniqueTemplateName(name, state.templates.filter(other => other.id !== id).map(other => other.name)) }
                    : item),
            })),
            // 템플릿을 지우면 그 템플릿을 쓰던 씬 지정도 같이 푼다.
            deleteTemplate: (id) => set(state => ({
                templates: state.templates.filter(item => item.id !== id),
                sceneTemplates: Object.fromEntries(Object.entries(state.sceneTemplates).map(([presetId, scenes]) => [
                    presetId,
                    Object.fromEntries(Object.entries(scenes).filter(([, templateId]) => templateId !== id)),
                ])),
            })),
            setSceneTemplate: (presetId, sceneId, templateId) => set(state => {
                const scenes = { ...(state.sceneTemplates[presetId] || {}) }
                if (templateId) scenes[sceneId] = templateId
                else delete scenes[sceneId]
                return { sceneTemplates: { ...state.sceneTemplates, [presetId]: scenes } }
            }),
        }),
        { name: 'nightmare-postprocess', storage: createJSONStorage(() => indexedDBStorage) },
    ),
)
