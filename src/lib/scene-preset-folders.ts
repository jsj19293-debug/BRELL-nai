/** 씬 모드 작품(프리셋) 정리 폴더: 어느 작품이 어느 폴더에 있는지와 목록 묶기 */
export interface ScenePresetFolder {
    id: string
    name: string
    collapsed: boolean
}

export interface PresetGroup<Preset> {
    /** null = 폴더에 넣지 않은 작품 */
    folder: ScenePresetFolder | null
    presets: Preset[]
}

/** 폴더 순서대로 묶고, 폴더에 없는(또는 지워진 폴더를 가리키는) 작품은 맨 끝 묶음으로. 작품 순서는 원래 목록 순서 그대로. */
export function groupPresets<Preset extends { id: string }>(
    presets: readonly Preset[],
    folders: readonly ScenePresetFolder[],
    assignment: Readonly<Record<string, string>>,
): PresetGroup<Preset>[] {
    const known = new Set(folders.map(folder => folder.id))
    const groups: PresetGroup<Preset>[] = folders.map(folder => ({ folder, presets: [] }))
    const loose: Preset[] = []
    for (const preset of presets) {
        const folderId = assignment[preset.id]
        if (folderId && known.has(folderId)) groups[folders.findIndex(folder => folder.id === folderId)].presets.push(preset)
        else loose.push(preset)
    }
    return [...groups, { folder: null, presets: loose }]
}

export function uniqueFolderName(base: string, taken: readonly string[]): string {
    const names = new Set(taken)
    if (!names.has(base)) return base
    for (let counter = 2; ; counter++) {
        const name = `${base}(${counter})`
        if (!names.has(name)) return name
    }
}
