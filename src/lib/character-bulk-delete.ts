/**
 * 캐릭터 일괄 삭제에서 실제로 지울 대상 계산.
 * 화면에는 변형(variant) 묶음이 카드 한 장으로 보이므로, 카드를 체크하면 그 묶음 전체를 지운다.
 */
export interface StackMember {
    id: string
}

export function expandSelectionToStacks<T extends StackMember>(
    characters: readonly T[],
    selectedIds: ReadonlySet<string>,
    stackKeyOf: (character: T) => string,
): string[] {
    const selectedStacks = new Set<string>()
    for (const character of characters) {
        if (selectedIds.has(character.id)) selectedStacks.add(stackKeyOf(character))
    }
    return characters.filter(character => selectedStacks.has(stackKeyOf(character))).map(character => character.id)
}

/** 목록이 바뀐 뒤(검색·폴더 이동·삭제) 더 이상 보이지 않는 선택은 버린다. */
export function pruneSelection(selectedIds: ReadonlySet<string>, visibleIds: readonly string[]): Set<string> {
    const visible = new Set(visibleIds)
    return new Set([...selectedIds].filter(id => visible.has(id)))
}

/** 보이는 카드가 모두 선택됐으면 전체 해제, 아니면 전체 선택. */
export function toggleSelectAll(selectedIds: ReadonlySet<string>, visibleIds: readonly string[]): Set<string> {
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
    return allSelected ? new Set() : new Set(visibleIds)
}
