import i18n from '@/i18n'
import { toast } from '@/components/ui/use-toast'
import { parseMetadataFromBase64 } from '@/lib/metadata-parser'
import { useSeedVaultStore } from '@/stores/seed-vault-store'
import { useGenerationStore } from '@/stores/generation-store'
import { useSceneStore } from '@/stores/scene-store'
import { findSceneImageOwner } from '@/lib/scene-path'

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
/**
 * 우클릭 메뉴 "현재 시드값 고정": 이미지의 시드를 고정한다.
 * 씬 이미지면 그 씬에만 고정(씬 카드 테두리가 빨갛게), 그 밖의 이미지면 메인 시드에 넣고 잠근다.
 */
export async function lockSeedFromImage(dataUrl: string, imagePath?: string): Promise<void> {
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
        const scenes = useSceneStore.getState()
        const owner = findSceneImageOwner(scenes.presets, imagePath)
        if (owner) {
            scenes.setSceneFixedSeed(owner.presetId, owner.sceneId, seed)
            const sceneName = scenes.presets.find(preset => preset.id === owner.presetId)?.scenes.find(scene => scene.id === owner.sceneId)?.name ?? ''
            toast({ title: t('seedVault.lockedScene', '"{{name}}" 씬을 이 시드로 고정했어요', { name: sceneName }), description: String(seed), variant: 'success' })
            return
        }
        const generation = useGenerationStore.getState()
        generation.setSeed(seed)
        generation.setSeedLocked(true)
        toast({ title: t('seedVault.lockedMain', '메인 시드를 이 시드로 고정했어요'), description: String(seed), variant: 'success' })
    } catch (error) {
        console.error('Failed to lock seed:', error)
        toast({ title: t('seedVault.lockFailed', '시드를 고정하지 못했어요'), description: String(error), variant: 'destructive' })
    }
}

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
