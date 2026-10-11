/**
 * 애니메이션 WebP 만들기: 한 장씩 WebP로 인코딩한 프레임들을 하나의 파일(RIFF 컨테이너)로 묶는다.
 * 프레임 인코딩 자체는 브라우저(canvas)가 하고, 여기서는 묶기만 한다. 모든 프레임은 캔버스와 같은 크기여야 한다.
 */
export interface WebpAnimFrame {
    /** 한 장짜리 WebP 파일의 내용 */
    bytes: Uint8Array
    /** 표시 시간 (밀리초) */
    durationMs: number
}

export const WEBP_MAX_SIDE = 16383
const MAX_DURATION_MS = 0xffffff

const fourcc = (bytes: Uint8Array, offset: number) => String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
const u32 = (bytes: Uint8Array, offset: number) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
const put24 = (target: Uint8Array, offset: number, value: number) => {
    target[offset] = value & 0xff
    target[offset + 1] = (value >> 8) & 0xff
    target[offset + 2] = (value >> 16) & 0xff
}
const put32 = (target: Uint8Array, offset: number, value: number) => {
    put24(target, offset, value)
    target[offset + 3] = (value >>> 24) & 0xff
}

function chunk(name: string, payload: Uint8Array): Uint8Array {
    const padded = payload.length + (payload.length & 1)
    const out = new Uint8Array(8 + padded)
    for (let index = 0; index < 4; index++) out[index] = name.charCodeAt(index)
    put32(out, 4, payload.length)
    out.set(payload, 8)
    return out
}

function concat(parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

/** 한 장짜리 WebP에서 이미지 데이터 청크(ALPH · VP8 · VP8L)만 꺼낸다. */
export function extractWebpImageData(bytes: Uint8Array): { data: Uint8Array; hasAlpha: boolean } {
    if (bytes.length < 20 || fourcc(bytes, 0) !== 'RIFF' || fourcc(bytes, 8) !== 'WEBP') throw new Error('WebP 파일이 아닙니다')
    const parts: Uint8Array[] = []
    let hasAlpha = false
    let hasImage = false
    let offset = 12
    while (offset + 8 <= bytes.length) {
        const name = fourcc(bytes, offset)
        const size = u32(bytes, offset + 4)
        const end = offset + 8 + size + (size & 1)
        if (offset + 8 + size > bytes.length) throw new Error('WebP 파일이 손상되었습니다')
        if (name === 'ANMF' || name === 'ANIM') throw new Error('이미 애니메이션인 WebP는 프레임으로 쓸 수 없습니다')
        if (name === 'ALPH' || name === 'VP8 ' || name === 'VP8L') {
            if (name === 'ALPH') hasAlpha = true
            // VP8L(무손실)은 머리말의 한 비트가 투명도 사용 여부다.
            if (name === 'VP8L' && size >= 5 && (bytes[offset + 8 + 4] & 0x10) !== 0) hasAlpha = true
            if (name !== 'ALPH') hasImage = true
            // 홀수 길이면 채움 바이트(0)까지 포함해 짝수로 맞춘다.
            const piece = new Uint8Array(8 + size + (size & 1))
            piece.set(bytes.subarray(offset, Math.min(end, bytes.length)))
            parts.push(piece)
        }
        offset = end
    }
    if (!hasImage) throw new Error('WebP 이미지 데이터를 찾지 못했습니다')
    return { data: concat(parts), hasAlpha }
}

/** 프레임들을 순서대로 재생하는 애니메이션 WebP를 만든다. loopCount 0 = 무한 반복. */
export function buildAnimatedWebp(frames: readonly WebpAnimFrame[], width: number, height: number, loopCount = 0): Uint8Array {
    if (frames.length === 0) throw new Error('프레임이 없습니다')
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > WEBP_MAX_SIDE || height > WEBP_MAX_SIDE) {
        throw new Error(`WebP 크기는 1 ~ ${WEBP_MAX_SIDE} 픽셀이어야 합니다`)
    }
    let anyAlpha = false
    const frameChunks = frames.map(frame => {
        const image = extractWebpImageData(frame.bytes)
        anyAlpha = anyAlpha || image.hasAlpha
        const header = new Uint8Array(16)
        // 위치 (0, 0), 크기는 캔버스 전체
        put24(header, 6, width - 1)
        put24(header, 9, height - 1)
        put24(header, 12, Math.max(1, Math.min(MAX_DURATION_MS, Math.round(frame.durationMs))))
        // 0x02: 앞 프레임과 섞지 않고 통째로 바꾼다
        header[15] = 0x02
        return chunk('ANMF', concat([header, image.data]))
    })

    const vp8x = new Uint8Array(10)
    vp8x[0] = 0x02 | (anyAlpha ? 0x10 : 0)
    put24(vp8x, 4, width - 1)
    put24(vp8x, 7, height - 1)
    const anim = new Uint8Array(6)
    anim[4] = loopCount & 0xff
    anim[5] = (loopCount >> 8) & 0xff

    const body = concat([chunk('VP8X', vp8x), chunk('ANIM', anim), ...frameChunks])
    const out = new Uint8Array(12 + body.length)
    out.set([0x52, 0x49, 0x46, 0x46])
    put32(out, 4, 4 + body.length)
    out.set([0x57, 0x45, 0x42, 0x50], 8)
    out.set(body, 12)
    return out
}

/** 출력 크기: 0은 "첫 사진에 맞춤". 한쪽만 0이면 첫 사진 비율을 지켜 계산한다. 인코더가 받는 짝수 크기로 맞춘다. */
export function slideshowSize(first: { width: number; height: number }, wantWidth: number, wantHeight: number): { width: number; height: number } {
    const w = Math.max(0, Math.floor(wantWidth) || 0)
    const h = Math.max(0, Math.floor(wantHeight) || 0)
    let width = w
    let height = h
    if (w === 0 && h === 0) {
        width = first.width
        height = first.height
    } else if (w === 0) {
        width = Math.round(h * first.width / first.height)
    } else if (h === 0) {
        height = Math.round(w * first.height / first.width)
    }
    const clamp = (value: number) => Math.max(2, Math.min(WEBP_MAX_SIDE - 1, value))
    return { width: clamp(width), height: clamp(height) }
}

/** 비율 버튼: 첫 사진의 너비를 기준으로 그 비율의 크기를 정한다 (예: 2:3 → 너비 832, 높이 1248). */
export function sizeForRatio(first: { width: number; height: number }, ratioWidth: number, ratioHeight: number): { width: number; height: number } {
    // 첫 사진 안에 들어가는 가장 큰 크기
    const byWidth = { width: first.width, height: Math.round(first.width * ratioHeight / ratioWidth) }
    if (byWidth.height <= first.height) return byWidth
    return { width: Math.round(first.height * ratioWidth / ratioHeight), height: first.height }
}

/** 사진을 캔버스에 그릴 위치. cover = 가운데 기준으로 꽉 채우고 넘치는 부분은 잘림, contain = 전부 보이게 맞추고 남는 곳은 여백. */
export function fitRect(
    image: { width: number; height: number },
    canvas: { width: number; height: number },
    mode: 'cover' | 'contain',
): { x: number; y: number; width: number; height: number } {
    const scale = mode === 'cover'
        ? Math.max(canvas.width / image.width, canvas.height / image.height)
        : Math.min(canvas.width / image.width, canvas.height / image.height)
    const width = image.width * scale
    const height = image.height * scale
    return { x: (canvas.width - width) / 2, y: (canvas.height - height) / 2, width, height }
}
