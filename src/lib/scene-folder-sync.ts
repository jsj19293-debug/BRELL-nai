/**
 * 씬 폴더 새로고침: 폴더에 실제로 있는 이미지 파일을 기준으로 씬의 이미지 목록을 맞춘다.
 * 파일을 지웠다가 다시 넣어서 목록에서 빠진 이미지를 되살리고, 폴더에서 사라진 것은 뺀다.
 */

export interface SyncSceneImage {
    id: string
    url: string
    timestamp: number
    isFavorite: boolean
}

export interface FolderFile {
    path: string
    name: string
    modifiedMs: number
}

export interface SceneSyncResult<Image extends SyncSceneImage = SyncSceneImage> {
    images: Image[]
    added: number
    removed: number
}

/** 경로 비교용: 윈도우는 대소문자와 구분자를 가리지 않는다. */
export function pathKey(path: string): string {
    return path.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
}

export function isInsideFolder(path: string, folder: string): boolean {
    const file = pathKey(path)
    const directory = pathKey(folder)
    if (!directory || !file.startsWith(directory + '/')) return false
    // 바로 아래 파일만 (하위 폴더의 파일은 이 폴더 목록에 나오지 않는다).
    return !file.slice(directory.length + 1).includes('/')
}

/** 앱이 저장한 이름(NAIS_SCENE_1700000000000.png)에서 만든 시각을 읽는다. */
export function timestampFromFileName(name: string): number | null {
    const match = name.match(/(\d{13})(?!\d)/)
    if (!match) return null
    const value = Number(match[1])
    // 2001년 ~ 2100년 사이만 시각으로 본다.
    return value > 978_307_200_000 && value < 4_102_444_800_000 ? value : null
}

/**
 * 폴더 목록에 맞춰 씬 이미지 목록을 다시 만든다.
 * - 목록에 있던 이미지 중 이 폴더에 있어야 하는데 파일이 없는 것은 뺀다.
 * - 폴더에 있는데 목록에 없는 파일은 새로 넣는다.
 * - 다른 곳에 있는 이미지(다른 폴더, data: 주소)는 건드리지 않는다.
 * 결과는 앱이 쓰는 순서(최신 먼저)로 정렬한다.
 */
export function syncSceneImages<Image extends SyncSceneImage>(
    images: readonly Image[],
    folder: string,
    files: readonly FolderFile[],
    makeImage: (file: FolderFile, timestamp: number, index: number) => Image,
): SceneSyncResult<Image> {
    const onDisk = new Map(files.map(file => [pathKey(file.path), file]))
    const known = new Set<string>()
    const kept: Image[] = []
    let removed = 0

    for (const image of images) {
        const key = pathKey(image.url)
        if (isInsideFolder(image.url, folder) && !onDisk.has(key)) {
            removed++
            continue
        }
        // 같은 파일이 두 번 들어가 있으면 하나만 남긴다.
        if (onDisk.has(key)) {
            if (known.has(key)) continue
            known.add(key)
        }
        kept.push(image)
    }

    const fresh: Image[] = []
    files.forEach((file, index) => {
        if (known.has(pathKey(file.path))) return
        fresh.push(makeImage(file, timestampFromFileName(file.name) ?? file.modifiedMs ?? 0, index))
    })

    if (removed === 0 && fresh.length === 0 && kept.length === images.length) {
        return { images: [...images], added: 0, removed: 0 }
    }
    const merged = [...kept, ...fresh].sort((a, b) => b.timestamp - a.timestamp)
    return { images: merged, added: fresh.length, removed }
}
