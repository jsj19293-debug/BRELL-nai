import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { convertFileSrc } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { ImagePlus, X } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { IMAGES_MAX_PER_ITEM, addImages, isImagePath } from '@/lib/prompt-notes'

interface NoteImagesProps {
    images: string[]
    onChange: (images: string[]) => void
}

/**
 * 세계관 · 로어북 · 메모에 붙이는 참고 이미지. 파일을 복사하지 않고 경로만 기억하므로,
 * 원본 파일을 옮기거나 지우면 여기서도 보이지 않는다.
 */
export function NoteImages({ images, onChange }: NoteImagesProps) {
    const { t } = useTranslation()
    const [preview, setPreview] = useState<string | null>(null)
    const [broken, setBroken] = useState<Set<string>>(() => new Set())
    const full = images.length >= IMAGES_MAX_PER_ITEM

    const handleAdd = async () => {
        try {
            const selected = await openDialog({
                multiple: true,
                filters: [{ name: 'Images', extensions: ['png', 'webp', 'jpg', 'jpeg', 'gif', 'avif'] }],
            })
            if (!selected) return
            const paths = (Array.isArray(selected) ? selected : [selected]).filter(isImagePath)
            const next = addImages(images, paths)
            if (next.length < images.length + paths.length && next.length >= IMAGES_MAX_PER_ITEM) {
                toast({ title: t('notes.imagesFull', '이미지는 항목마다 {{n}}장까지 붙일 수 있어요', { n: IMAGES_MAX_PER_ITEM }) })
            }
            onChange(next)
        } catch (error) {
            console.error('Failed to pick note images:', error)
            toast({ title: t('notes.imagesFailed', '이미지를 고르지 못했어요'), description: String(error), variant: 'destructive' })
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {images.map(path => (
                <div key={path} className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                    {broken.has(path) ? (
                        <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground">
                            {t('notes.imageMissing', '파일 없음')}
                        </span>
                    ) : (
                        <button type="button" className="h-full w-full" onClick={() => setPreview(path)} title={path}>
                            <img
                                src={convertFileSrc(path)}
                                alt=""
                                loading="lazy"
                                className="h-full w-full object-cover"
                                onError={() => setBroken(current => new Set(current).add(path))}
                            />
                        </button>
                    )}
                    <button
                        type="button"
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => onChange(images.filter(candidate => candidate !== path))}
                        aria-label={t('notes.removeImage', '이미지 떼기')}
                    >
                        <X className="h-3 w-3" />
                    </button>
                </div>
            ))}
            {!full && (
                <button
                    type="button"
                    className="flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border/70 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    onClick={() => void handleAdd()}
                >
                    <ImagePlus className="h-4 w-4" />
                    {t('notes.addImage', '이미지')}
                    <span className="text-[10px] opacity-70">{images.length}/{IMAGES_MAX_PER_ITEM}</span>
                </button>
            )}
            {preview && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-8"
                    onClick={() => setPreview(null)}
                    role="presentation"
                >
                    <img src={convertFileSrc(preview)} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
                </div>
            )}
        </div>
    )
}
