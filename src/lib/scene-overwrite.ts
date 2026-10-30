/**
 * 씬 덮어씌우기: 고른 폴더 안의 하위 폴더를 씬 이름(없으면 맨 앞 번호)으로 짝지어,
 * 그 씬의 이미지 목록을 그 폴더의 이미지로 채운다. 파일은 옮기거나 지우지 않는다.
 * (저장소를 불러오지 않는 순수 함수만 둔다.)
 */
import { leadingNumber } from './scene-loose-files.ts'
import { pathKey, timestampFromFileName, type FolderFile } from './scene-folder-sync.ts'

export interface OverwriteScene {
    id: string
    name: string
}

export interface OverwriteFolder {
    name: string
    path: string
    imageCount: number
}

export interface OverwriteMatch {
    sceneId: string
    sceneName: string
    sceneNumber: number
    folder: OverwriteFolder | null
    by: 'name' | 'number' | null
}

/** 폴더 이름으로 못 쓰는 글자는 _ 로 바뀌어 저장되므로 비교할 때도 같게 본다. */
const key = (text: string) => text
    .normalize('NFC')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/, '')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * 씬마다 맞는 폴더: 1) 이름이 같은 폴더, 2) 맨 앞 번호가 같은 폴더 (같은 번호 폴더가 하나뿐일 때).
 * 한 폴더는 한 씬에만 짝짓는다.
 */
export function matchSceneFolders(scenes: readonly OverwriteScene[], folders: readonly OverwriteFolder[]): OverwriteMatch[] {
    const used = new Set<string>()
    const byName = new Map<string, OverwriteFolder>()
    for (const folder of folders) if (!byName.has(key(folder.name))) byName.set(key(folder.name), folder)
    const byNumber = new Map<number, OverwriteFolder | null>()
    for (const folder of folders) {
        const number = leadingNumber(folder.name)
        if (number === null) continue
        byNumber.set(number, byNumber.has(number) ? null : folder)
    }

    const matches: OverwriteMatch[] = scenes.map((scene, index) => ({ sceneId: scene.id, sceneName: scene.name, sceneNumber: index + 1, folder: null, by: null }))
    // 이름이 같은 것부터 짝짓고, 남은 씬을 번호로 짝짓는다.
    matches.forEach(match => {
        const folder = byName.get(key(match.sceneName))
        if (folder && !used.has(pathKey(folder.path))) {
            used.add(pathKey(folder.path))
            match.folder = folder
            match.by = 'name'
        }
    })
    matches.forEach(match => {
        if (match.folder) return
        const number = leadingNumber(match.sceneName)
        const folder = number === null ? undefined : byNumber.get(number)
        if (folder && !used.has(pathKey(folder.path))) {
            used.add(pathKey(folder.path))
            match.folder = folder
            match.by = 'number'
        }
    })
    return matches
}

export interface OverwriteImage {
    id: string
    url: string
    timestamp: number
    isFavorite: boolean
}

/**
 * 폴더의 파일들로 씬 이미지 목록을 만든다 (최신 먼저).
 * 원래 목록에 같은 파일이 있으면 그 이미지(즐겨찾기 표시 등)를 그대로 쓴다.
 */
export function imagesFromFolder(files: readonly FolderFile[], previous: readonly OverwriteImage[], makeId: (index: number) => string): OverwriteImage[] {
    const known = new Map(previous.map(image => [pathKey(image.url), image]))
    const seen = new Set<string>()
    const images: OverwriteImage[] = []
    files.forEach((file, index) => {
        const fileKey = pathKey(file.path)
        if (seen.has(fileKey)) return
        seen.add(fileKey)
        images.push(known.get(fileKey) ?? {
            id: makeId(index),
            url: file.path,
            timestamp: timestampFromFileName(file.name) ?? file.modifiedMs ?? 0,
            isFavorite: false,
        })
    })
    return images.sort((a, b) => b.timestamp - a.timestamp)
}
