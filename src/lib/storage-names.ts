/**
 * 저장 폴더와 파일 이름의 형식: 예전 NAIS 형식과 Nightmare 형식.
 * 설정의 "NAIS 호환" 버튼이 예전 폴더를 새 이름으로 옮기고 형식을 바꾼다. 그 전까지는 NAIS 형식 그대로다.
 * (저장소를 불러오지 않는 순수 함수만 둔다.)
 */

export type StorageNaming = 'nais' | 'nightmare'

export interface StorageNames {
    scene: string
    output: string
    library: string
    exif: string
    /** 파일 이름 앞부분: NAIS_SCENE_… → Nightmare_SCENE_… */
    filePrefix: string
}

export const STORAGE_NAMES: Record<StorageNaming, StorageNames> = {
    nais: { scene: 'NAIS_Scene', output: 'NAIS_Output', library: 'NAIS_Library', exif: 'NAIS_EXIF', filePrefix: 'NAIS' },
    nightmare: { scene: 'Nightmare_Scene', output: 'Nightmare_Output', library: 'Nightmare_Library', exif: 'Nightmare_EXIF', filePrefix: 'Nightmare' },
}

export function storageNames(naming: StorageNaming | undefined): StorageNames {
    return STORAGE_NAMES[naming === 'nightmare' ? 'nightmare' : 'nais']
}

/** 경로에 씬 폴더(옛 이름이든 새 이름이든)가 들어 있는지: 히스토리가 씬 이미지를 구분할 때 쓴다. */
export function isScenePath(path: string): boolean {
    return path.includes(STORAGE_NAMES.nais.scene) || path.includes(STORAGE_NAMES.nightmare.scene)
}

export interface CompatSettings {
    savePath: string
    useAbsolutePath: boolean
    libraryPath: string
    useAbsoluteLibraryPath: boolean
    exifAutoSavePath: string
}

export interface CompatMove {
    kind: 'scene' | 'output' | 'library' | 'exif'
    sourcePath: string
    destinationPath: string
}

export interface CompatPlan {
    moves: CompatMove[]
    /** 옮긴 뒤 바꿔 둘 설정 값 */
    settings: Partial<Pick<CompatSettings, 'savePath' | 'libraryPath' | 'exifAutoSavePath'>>
}

const isAbsolute = (path: string) => /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\\\')
const joinWith = (base: string, name: string) => {
    const separator = base.includes('\\') ? '\\' : '/'
    return `${base.replace(/[\\/]+$/, '')}${separator}${name}`
}
const sameName = (left: string, right: string) => left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase()

/**
 * NAIS 형식 폴더를 Nightmare 형식으로 옮기는 계획.
 * - 씬: <기준>/NAIS_Scene → <기준>/Nightmare_Scene (기준은 직접 지정한 저장 위치, 없으면 사진 폴더)
 * - 출력 · 라이브러리 · EXIF: 기본 이름(NAIS_…)을 그대로 쓰고 있을 때만 옮기고 설정도 새 이름으로 바꾼다.
 *   사용자가 직접 고른 폴더나 이름은 건드리지 않는다.
 * 사진 폴더 아래의 씬 폴더는 저장 위치를 직접 지정했더라도 예전 이미지가 남아 있을 수 있어 함께 옮긴다.
 */
export function planNaisToNightmare(settings: CompatSettings, picturesDir: string): CompatPlan {
    const from = STORAGE_NAMES.nais
    const to = STORAGE_NAMES.nightmare
    const moves: CompatMove[] = []
    const next: CompatPlan['settings'] = {}
    const add = (kind: CompatMove['kind'], sourcePath: string, destinationPath: string) => {
        if (!moves.some(move => move.sourcePath.toLocaleLowerCase() === sourcePath.toLocaleLowerCase())) moves.push({ kind, sourcePath, destinationPath })
    }

    // 씬 폴더는 출력 폴더 안에 들어 있을 수 있으므로 먼저 옮긴다.
    const savePath = settings.savePath.trim()
    if (settings.useAbsolutePath && savePath) add('scene', joinWith(savePath, from.scene), joinWith(savePath, to.scene))
    add('scene', joinWith(picturesDir, from.scene), joinWith(picturesDir, to.scene))

    if (!settings.useAbsolutePath && (!savePath || sameName(savePath, from.output))) {
        add('output', joinWith(picturesDir, from.output), joinWith(picturesDir, to.output))
        next.savePath = to.output
    }

    const libraryPath = settings.libraryPath.trim()
    if (!settings.useAbsoluteLibraryPath && (!libraryPath || sameName(libraryPath, from.library))) {
        add('library', joinWith(picturesDir, from.library), joinWith(picturesDir, to.library))
        next.libraryPath = to.library
    }

    const exifPath = settings.exifAutoSavePath.trim()
    if (!isAbsolute(exifPath) && (!exifPath || sameName(exifPath, from.exif))) {
        add('exif', joinWith(picturesDir, from.exif), joinWith(picturesDir, to.exif))
        next.exifAutoSavePath = to.exif
    }

    return { moves, settings: next }
}

/** 경로의 앞부분이 옮긴 폴더면 새 위치로 바꾼다 (대소문자 · 구분자 무시). */
export function remapMovedPath(path: string, moves: ReadonlyArray<Pick<CompatMove, 'sourcePath' | 'destinationPath'>>): string {
    const normalize = (value: string) => value.replace(/\//g, '\\').replace(/\\+$/, '').toLocaleLowerCase()
    const key = normalize(path)
    for (const move of moves) {
        const root = normalize(move.sourcePath)
        if (key === root || key.startsWith(root + '\\')) {
            return move.destinationPath.replace(/[\\/]+$/, '') + path.slice(move.sourcePath.replace(/[\\/]+$/, '').length)
        }
    }
    return path
}
