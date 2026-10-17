/** SVG 편집 창: 미리보기 문서 만들기 · 크기 읽기 · 파일 이름 */
export type SvgBackground = 'checker' | 'white' | 'black'

export const SVG_SAMPLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  <rect width="400" height="300" rx="24" fill="url(#g)"/>
  <circle cx="200" cy="150" r="70" fill="#fff" opacity="0.9">
    <animate attributeName="r" values="60;80;60" dur="2s" repeatCount="indefinite"/>
  </circle>
  <text x="200" y="160" text-anchor="middle" font-size="28" font-family="sans-serif" fill="#7c3aed">SVG</text>
</svg>
`

const BACKGROUND_CSS: Record<SvgBackground, string> = {
    checker: 'background-color:#fff;background-image:linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0',
    white: 'background:#fff',
    black: 'background:#111',
}

/**
 * 미리보기 창(스크립트가 막힌 iframe)에 넣을 문서. SVG를 가운데에 놓고, zoom 배율로 키운다 (size = 그림 원래 크기).
 * fit 이면 창 크기에 맞춘다.
 */
export function previewDocument(svg: string, background: SvgBackground, zoom: number, fit: boolean, size: { width: number; height: number } = { width: 300, height: 150 }): string {
    const scale = Math.max(0.1, Math.min(8, zoom))
    // 배율 보기는 그림 크기 × 배율로 정확히 그린다 (크기 없이 viewBox만 있는 SVG도 보이게).
    const sizing = fit
        ? 'svg{max-width:100%;max-height:100%;width:auto;height:auto}'
        : `svg{width:${Math.round(size.width * scale)}px!important;height:${Math.round(size.height * scale)}px!important;flex:none}`
    return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;}
body{display:flex;align-items:center;justify-content:center;overflow:auto;${BACKGROUND_CSS[background]}}
.wrap{display:flex;align-items:center;justify-content:center;${fit ? 'width:100%;height:100%;padding:16px;box-sizing:border-box' : 'margin:auto;padding:16px'}}
${sizing}
</style></head><body><div class="wrap">${svg}</div></body></html>`
}

const lengthOf = (value: string | null | undefined): number | null => {
    if (!value) return null
    const match = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/i.exec(value)
    return match ? Number(match[1]) : null
}

/** 그림 크기: width/height(px)가 있으면 그것, 없으면 viewBox 크기, 둘 다 없으면 300×150 */
export function svgSize(attrs: { width?: string | null; height?: string | null; viewBox?: string | null }): { width: number; height: number; viewBox: string | null } {
    const box = (attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number)
    const hasBox = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0
    let width = lengthOf(attrs.width)
    let height = lengthOf(attrs.height)
    if (hasBox) {
        if (width === null && height === null) { width = box[2]; height = box[3] }
        else if (width === null && height !== null) width = height * box[2] / box[3]
        else if (height === null && width !== null) height = width * box[3] / box[2]
    }
    return { width: Math.round(width ?? 300), height: Math.round(height ?? 150), viewBox: hasBox ? box.join(' ') : null }
}

/** PNG로 뽑을 때 쓸 SVG: 크기가 확실하도록 width/height 를 박아 넣는다. */
export function withExplicitSize(svg: string, width: number, height: number): string {
    return svg.replace(/<svg\b([^>]*)>/i, (_, attrs: string) => {
        const cleaned = attrs.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '')
        const ns = /\sxmlns\s*=/.test(cleaned) ? '' : ' xmlns="http://www.w3.org/2000/svg"'
        return `<svg${cleaned}${ns} width="${width}" height="${height}">`
    })
}

export const svgFileName = (name: string, extension: 'svg' | 'png') => {
    const base = (name.trim() || 'image').replace(/\.(svg|png)$/i, '').replace(/[<>:"/\\|?*]/g, '_')
    return `${base}.${extension}`
}
