import i18n from '@/i18n'
import { toast } from '@/components/ui/use-toast'
import { parseMetadataFromBase64 } from '@/lib/metadata-parser'
import { useSeedVaultStore } from '@/stores/seed-vault-store'

const THUMBNAIL_SIZE = 320

/** 보관함 목록에 쓸 작은 미리보기를 만든다. 실패하면 미리보기 없이 저장한다. */
function makeThumbnail(dataUrl: string): Promise<string | undefined> {
    return new Promise(resolve => {
        const image = new Image()
        image.onload = () => {
            try {
                const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(image.naturalWidth, image.naturalHeight))
                const canvas = document.createElement('canvas')
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
                const context = canvas.getContext('2d')
                if (!context) return resolve(undefined)
                context.drawImage(image, 0, 0, canvas.width, canvas.height)
                resolve(canvas.toDataURL('image/jpeg', 0.82))
            } catch {
                resolve(undefined)
            }
        }
        image.onerror = () => resolve(undefined)
        image.src = dataUrl
    })
}

/**
 * 우클릭 메뉴 "현재 시드값 저장": 이미지에 들어 있는 시드를 읽어 이미지와 함께 시드 보관함에 넣는다.
 * @param dataUrl 이미지 내용 (data URL)
 * @param imagePath 이미지 파일 위치 (저장된 파일일 때)
 */
export async function saveSeedFromImage(dataUrl: string, imagePath?: string): Promise<void> {
    const t = i18n.t.bind(i18n)
    try {
        const metadata = await parseMetadataFromBase64(dataUrl)
        const seed = metadata?.seed
        if (typeof seed !== 'number' || !Number.isFinite(seed) || seed <= 0) {
            toast({
                title: t('seedVault.noSeed', '이 이미지에서 시드값을 찾지 못했어요'),
                description: t('seedVault.noSeedHelp', 'EXIF(생성 정보)가 지워진 이미지는 시드를 알 수 없습니다.'),
                variant: 'destructive',
            })
            return
        }
        const thumbnail = await makeThumbnail(dataUrl)
        const duplicate = useSeedVaultStore.getState().add({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            seed,
            thumbnail,
            imagePath,
            prompt: metadata?.prompt,
            model: metadata?.model,
            width: metadata?.width,
            height: metadata?.height,
            createdAt: Date.now(),
        })
        toast({
            title: duplicate
                ? t('seedVault.alreadySaved', '이미 보관함에 있는 시드예요')
                : t('seedVault.saved', '시드 보관함에 저장했어요'),
            description: String(seed),
            variant: 'success',
        })
    } catch (error) {
        console.error('Failed to save seed:', error)
        toast({ title: t('seedVault.saveFailed', '시드를 저장하지 못했어요'), description: String(error), variant: 'destructive' })
    }
}
