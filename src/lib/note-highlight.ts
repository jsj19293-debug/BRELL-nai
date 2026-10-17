/**
 * 프롬프트 메모 칸 색 입히기: "# 제목", "## 소제목", "### 작은 제목" 줄과 {{user}} 같은 치환어.
 * 글자 굵기나 크기는 바꾸지 않는다 (입력 칸 글자와 위치가 어긋나지 않게 색만 바꾼다).
 */
export type HighlightKind = 'h1' | 'h2' | 'h3' | 'macro' | 'text'

export interface HighlightPiece {
    kind: HighlightKind
    text: string
}

const MACRO = /\{\{[^{}\n]{1,40}\}\}/g

function splitMacros(text: string, base: HighlightKind): HighlightPiece[] {
    const pieces: HighlightPiece[] = []
    let last = 0
    for (const match of text.matchAll(MACRO)) {
        const at = match.index ?? 0
        if (at > last) pieces.push({ kind: base, text: text.slice(last, at) })
        pieces.push({ kind: 'macro', text: match[0] })
        last = at + match[0].length
    }
    if (last < text.length) pieces.push({ kind: base, text: text.slice(last) })
    return pieces
}

export function highlightNote(text: string): HighlightPiece[] {
    const pieces: HighlightPiece[] = []
    const lines = text.split('\n')
    lines.forEach((line, index) => {
        const heading = /^\s{0,3}(#{1,3})(?=\s|$)/.exec(line)
        const kind: HighlightKind = heading ? (heading[1].length === 1 ? 'h1' : heading[1].length === 2 ? 'h2' : 'h3') : 'text'
        pieces.push(...splitMacros(line, kind))
        if (index < lines.length - 1) pieces.push({ kind: 'text', text: '\n' })
    })
    // 이웃한 같은 종류는 합친다.
    return pieces.reduce<HighlightPiece[]>((merged, piece) => {
        const previous = merged[merged.length - 1]
        if (previous && previous.kind === piece.kind) previous.text += piece.text
        else if (piece.text) merged.push({ ...piece })
        return merged
    }, [])
}
