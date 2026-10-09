import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SeedVaultPicker } from '@/components/seed/SeedVaultDialog'
import { parseSeedInput } from '@/lib/seed-vault'

interface SceneSeedLockDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    sceneName: string
    currentSeed?: number
    /** null 이면 고정 해제 */
    onApply: (seed: number | null) => void
}

/** 씬 카드 우클릭 > 시드값 고정: 이 씬만 정해 둔 시드로 생성한다. */
export function SceneSeedLockDialog({ open, onOpenChange, sceneName, currentSeed, onApply }: SceneSeedLockDialogProps) {
    const { t } = useTranslation()
    const [text, setText] = useState('')

    useEffect(() => {
        if (open) setText(currentSeed ? String(currentSeed) : '')
    }, [open, currentSeed])

    const seed = parseSeedInput(text)
    const apply = () => {
        if (seed === null) return
        onApply(seed)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md" data-scene-seed-lock>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4 text-red-500" />{t('sceneSeedLock.title', '시드값 고정')} · {sceneName}</DialogTitle>
                    <DialogDescription>
                        {t('sceneSeedLock.desc', '이 씬만 아래 시드로 생성합니다 (I2I 싸이클의 원본 · I2I 모두). 고정된 씬은 테두리가 빨갛게 표시됩니다. 예약대형에서 돌릴 때는 예약할 때 정한 시드 설정이 먼저 적용됩니다.')}
                    </DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2">
                    <Input
                        autoFocus
                        inputMode="numeric"
                        value={text}
                        onChange={event => setText(event.target.value)}
                        onKeyDown={event => { if (event.key === 'Enter') apply() }}
                        placeholder={t('sceneSeedLock.placeholder', '시드 숫자 입력')}
                        className="h-9 flex-1 font-mono"
                    />
                    <SeedVaultPicker onPick={(picked: number) => setText(String(picked))} />
                </div>
                {text.trim() !== '' && seed === null && (
                    <p className="text-xs text-red-500">{t('sceneSeedLock.invalid', '1 ~ 4294967295 사이의 숫자만 쓸 수 있습니다.')}</p>
                )}
                <DialogFooter className="gap-2 sm:justify-between">
                    <Button variant="outline" disabled={!currentSeed} onClick={() => { onApply(null); onOpenChange(false) }}>
                        {t('sceneSeedLock.clear', '고정 해제')}
                    </Button>
                    <Button disabled={seed === null} onClick={apply}>{t('sceneSeedLock.apply', '이 시드로 고정')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
