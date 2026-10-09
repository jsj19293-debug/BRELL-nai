/** 캐릭터 프사: 고른 이미지를 정사각형으로 잘라 작은 JPEG(data URL)로 만든다. */
export const AVATAR_SIZE = 160

/**
 * 정사각형으로 자를 영역. 가로로 긴 이미지는 가운데를, 세로로 긴 이미지는 얼굴이 있는 위쪽을 쓴다.
 */
export function squareCrop(width: number, height: number): { x: number; y: number; side: number } {
    const side = Math.max(1, Math.min(width, height))
    if (width >= height) return { x: Math.max(0, Math.round((width - side) / 2)), y: 0, side }
    return { x: 0, y: Math.max(0, Math.round((height - side) * 0.12)), side }
}

export function fileToSquareAvatar(file: Blob, size: number = AVATAR_SIZE): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const image = new Image()
        image.onload = () => {
            try {
                const crop = squareCrop(image.naturalWidth, image.naturalHeight)
                const canvas = document.createElement('canvas')
                canvas.width = size
                canvas.height = size
                const context = canvas.getContext('2d')
                if (!context) throw new Error('canvas unavailable')
                context.imageSmoothingQuality = 'high'
                context.drawImage(image, crop.x, crop.y, crop.side, crop.side, 0, 0, size, size)
                resolve(canvas.toDataURL('image/jpeg', 0.85))
            } catch (error) {
                reject(error)
            } finally {
                URL.revokeObjectURL(url)
            }
        }
        image.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('image load failed'))
        }
        image.src = url
    })
}
