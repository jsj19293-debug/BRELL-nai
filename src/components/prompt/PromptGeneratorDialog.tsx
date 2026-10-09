import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Check, AlertCircle, ChevronDown, Copy, Sparkles } from 'lucide-react'
import GeminiIcon from '@/assets/gemini-color.svg'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings-store'
import {
    AI_MODELS,
    AI_PROVIDER_LABELS,
    AiError,
    DEFAULT_AI_MODEL,
    generatePromptFromText,
    type AiProvider,
    type AiUsage,
} from '@/services/ai-tag-service'
import { matchTags, type TagMatchResult } from '@/lib/tag-search-client'
import { koNameOfTag } from '@/lib/ko-tags'
import { toast } from '@/components/ui/use-toast'

interface PromptGeneratorDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onApply: (tags: string) => void
}

const PROVIDERS: AiProvider[] = ['gemini', 'claude', 'openai']

export function PromptGeneratorDialog({ open, onOpenChange, onApply }: PromptGeneratorDialogProps) {
    const { t } = useTranslation()
    const geminiApiKey = useSettingsStore(state => state.geminiApiKey)
    const anthropicApiKey = useSettingsStore(state => state.anthropicApiKey)
    const openaiApiKey = useSettingsStore(state => state.openaiApiKey)
    const aiTagProvider = useSettingsStore(state => state.aiTagProvider)
    const aiTagModels = useSettingsStore(state => state.aiTagModels)
    const setAiTagConfig = useSettingsStore(state => state.setAiTagConfig)
    const setAiTagModel = useSettingsStore(state => state.setAiTagModel)

    const keys: Record<AiProvider, string> = useMemo(
        () => ({ gemini: geminiApiKey, claude: anthropicApiKey, openai: openaiApiKey }),
        [geminiApiKey, anthropicApiKey, openaiApiKey],
    )
    // 고른 제공사에 키가 없으면 키가 있는 첫 제공사로 연다.
    const provider: AiProvider = keys[aiTagProvider]?.trim()
        ? aiTagProvider
        : PROVIDERS.find(id => keys[id]?.trim()) ?? aiTagProvider
    const model = aiTagModels?.[provider] || DEFAULT_AI_MODEL[provider]
    const modelOptions = AI_MODELS[provider].some(option => option.id === model)
        ? AI_MODELS[provider]
        : [...AI_MODELS[provider], { id: model, name: model }]

    const [userInput, setUserInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [results, setResults] = useState<TagMatchResult[]>([])
    // 결과 순서와 같은 한글 뜻 (AI가 준 값. 없으면 내장 용어집에서 찾는다)
    const [meanings, setMeanings] = useState<string[]>([])
    const [selectedTags, setSelectedTags] = useState<Map<number, string>>(new Map())
    const [natural, setNatural] = useState('')
    const [includeNatural, setIncludeNatural] = useState(false)
    const [tokenUsage, setTokenUsage] = useState<AiUsage | null>(null)

    // Reset when dialog opens
    useEffect(() => {
        if (open) {
            setUserInput('')
            setResults([])
            setMeanings([])
            setSelectedTags(new Map())
            setNatural('')
            setIncludeNatural(false)
            setTokenUsage(null)
        }
    }, [open])

    const errorText = (error: unknown): string => {
        if (error instanceof AiError) {
            const fallback: Record<string, string> = {
                NO_KEY: 'API 키가 없어요.',
                AUTH: 'API 키가 올바르지 않아요.',
                CREDIT: '크레딧(잔액)이 부족해요.',
                RATE: '요청이 너무 많아요. 잠시 뒤 다시 해주세요.',
                MODEL: '이 모델을 쓸 수 없어요. 설정에서 모델 이름을 확인해 주세요.',
                BAD_REQUEST: '요청이 거절됐어요.',
                SERVER: 'AI 서버에 문제가 있어요. 잠시 뒤 다시 해주세요.',
                NETWORK: '네트워크에 연결하지 못했어요.',
                TIMEOUT: '응답이 너무 오래 걸려서 멈췄어요.',
                EMPTY: 'AI가 빈 답을 보냈어요. 다시 시도해 주세요.',
            }
            const message = t(`promptGenerator.aiError.${error.code}`, fallback[error.code] || error.code)
            return error.detail ? `${message} (${error.detail})` : message
        }
        return String(error)
    }

    const handleGenerate = async () => {
        if (!keys[provider]?.trim()) {
            toast({
                title: t('promptGenerator.anyKeyRequired', 'AI API 키가 필요합니다'),
                description: t('promptGenerator.goToSettings', '설정 페이지에서 API 키를 입력해주세요'),
                variant: 'destructive',
            })
            return
        }

        if (!userInput.trim()) return

        setIsLoading(true)
        setResults([])

        try {
            const generated = await generatePromptFromText(userInput, { provider, apiKey: keys[provider], model })

            // 앱의 단부루 태그 색인과 대조한다. 색인에 없는 태그는 "선택 필요" 또는 제외로 표시된다.
            const matchResults = await matchTags(generated.tags.map(item => item.tag))
            setResults(matchResults)
            // 한글 뜻은 원래 태그 이름으로 잇는다. 동의어로 바뀌어 못 찾은 것은 내장 용어집 이름을 쓴다.
            const byOriginal = new Map(generated.tags.map(item => [item.tag, item.ko]))
            setMeanings(matchResults.map(result => byOriginal.get(result.original.trim().toLowerCase()) || ''))
            setNatural(generated.natural)

            // Initialize selected tags with matched ones
            const initialSelections = new Map<number, string>()
            matchResults.forEach((r, i) => {
                if (r.status === 'matched' && r.matched) {
                    initialSelections.set(i, r.matched.value)
                } else if (r.status === 'fuzzy' && r.alternatives.length > 0) {
                    // Pre-select the first alternative
                    initialSelections.set(i, r.alternatives[0].value)
                }
            })
            setSelectedTags(initialSelections)
            setTokenUsage(generated.usage)

            if (matchResults.length === 0 && !generated.natural) {
                toast({
                    title: t('promptGenerator.noTags', '태그를 찾지 못했어요'),
                    description: t('promptGenerator.noTagsHint', '설명을 조금 더 구체적으로 써 보세요.'),
                })
            }
        } catch (error) {
            console.error('Generate error:', error)
            toast({
                title: t('promptGenerator.error', '오류 발생'),
                description: errorText(error),
                variant: 'destructive',
            })
        } finally {
            setIsLoading(false)
        }
    }

    const handleSelectTag = (index: number, value: string) => {
        const newSelections = new Map(selectedTags)
        newSelections.set(index, value)
        setSelectedTags(newSelections)
    }

    const handleRemoveTag = (index: number) => {
        const newSelections = new Map(selectedTags)
        newSelections.delete(index)
        setSelectedTags(newSelections)
    }

    const finalText = (): string => {
        const tags: string[] = []
        results.forEach((_, i) => {
            const selected = selectedTags.get(i)
            if (selected) tags.push(selected)
        })
        const parts = [tags.join(', ')]
        if (includeNatural && natural.trim()) parts.push(natural.trim())
        return parts.filter(Boolean).join(', ')
    }

    const handleApply = () => {
        const text = finalText()
        if (text) {
            onApply(text)
            onOpenChange(false)
        }
    }

    const getStatusIcon = (result: TagMatchResult) => {
        switch (result.status) {
            case 'matched':
                return <Check className="h-3.5 w-3.5 text-green-500" />
            case 'fuzzy':
                return <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
            case 'unmatched':
                return <AlertCircle className="h-3.5 w-3.5 text-red-500" />
        }
    }

    const getStatusClass = (result: TagMatchResult, index: number) => {
        // If tag is removed, show muted style
        if (!selectedTags.has(index)) {
            return 'border-muted/50 bg-muted/20 opacity-50'
        }
        switch (result.status) {
            case 'matched':
                return 'border-green-500/50 bg-green-500/10'
            case 'fuzzy':
                return 'border-yellow-500/50 bg-yellow-500/10'
            case 'unmatched':
                return 'border-red-500/50 bg-red-500/10'
        }
    }

    const meaningOf = (index: number): string => {
        const selected = selectedTags.get(index) || results[index]?.matched?.value || ''
        return meanings[index] || (selected ? koNameOfTag(selected) || '' : '')
    }

    const providerIcon = provider === 'gemini'
        ? <img src={GeminiIcon} alt="Gemini" className="h-5 w-5" />
        : <Sparkles className="h-5 w-5 text-violet-500" />
    const hasOutput = results.length > 0 || !!natural
    const canApply = selectedTags.size > 0 || (includeNatural && !!natural.trim())

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {providerIcon}
                        {t('promptGenerator.title', 'AI 프롬프트 생성')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('promptGenerator.descriptionKo', '한글로 장면을 설명하면 단부루 태그와 자연어 문장으로 바꿔 줍니다. 앱의 태그 목록에 있는 태그만 초록색으로 표시돼요.')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 space-y-4 overflow-hidden">
                    {/* Provider & model */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground shrink-0">
                            {t('promptGenerator.provider', 'AI')}:
                        </span>
                        <Select value={provider} onValueChange={(v: string) => setAiTagConfig({ aiTagProvider: v as AiProvider })}>
                            <SelectTrigger className="w-32 h-8 text-sm focus:ring-0 focus:ring-offset-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PROVIDERS.map((id) => (
                                    <SelectItem key={id} value={id} disabled={!keys[id]?.trim()}>
                                        {AI_PROVIDER_LABELS[id]}
                                        {!keys[id]?.trim() && ` (${t('promptGenerator.noKey', '키 없음')})`}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="text-sm text-muted-foreground shrink-0">
                            {t('promptGenerator.model', '모델')}:
                        </span>
                        <Select value={model} onValueChange={(v: string) => setAiTagModel(provider, v)}>
                            <SelectTrigger className="flex-1 h-8 text-sm focus:ring-0 focus:ring-offset-0">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {modelOptions.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Input Area */}
                    <div className="space-y-2">
                        <Textarea
                            placeholder={t('promptGenerator.inputPlaceholder', '예: 카페에서 커피를 마시는 소녀')}
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            className="min-h-[80px] resize-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.ctrlKey && !e.nativeEvent.isComposing) {
                                    handleGenerate()
                                }
                            }}
                        />
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-muted-foreground">
                                {t('promptGenerator.hint', 'Ctrl+Enter로 생성')}
                            </p>
                            <Button
                                onClick={handleGenerate}
                                disabled={isLoading || !userInput.trim()}
                                className=""
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        {t('promptGenerator.generating', '생성 중...')}
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        {t('promptGenerator.generate', '생성')}
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Results Area */}
                    {results.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium flex items-center gap-2">
                                    {t('promptGenerator.results', '생성된 태그')}
                                    {tokenUsage && (
                                        <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                            {t('promptGenerator.tokenUsage', '토큰')}: {tokenUsage.totalTokens}
                                        </span>
                                    )}
                                </h4>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <Check className="h-3 w-3 text-green-500" />
                                        {t('promptGenerator.matched', '매칭됨')}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3 text-yellow-500" />
                                        {t('promptGenerator.selectRequired', '선택 필요')}
                                    </span>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {t('promptGenerator.rightClickHint', '우클릭으로 태그 제거')}
                            </p>

                            <ScrollArea className="h-[190px] border rounded-lg p-3" data-allow-context-menu>
                                <div className="flex flex-wrap gap-2">
                                    {results.map((result, index) => (
                                        <div
                                            key={index}
                                            className={cn(
                                                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-sm cursor-context-menu transition-opacity",
                                                getStatusClass(result, index)
                                            )}
                                            onContextMenu={(e) => {
                                                e.preventDefault()
                                                if (selectedTags.has(index)) {
                                                    handleRemoveTag(index)
                                                } else {
                                                    // Re-add if previously removed
                                                    if (result.status === 'matched' && result.matched) {
                                                        handleSelectTag(index, result.matched.value)
                                                    } else if (result.status === 'fuzzy' && result.alternatives.length > 0) {
                                                        handleSelectTag(index, result.alternatives[0].value)
                                                    }
                                                }
                                            }}
                                        >
                                            {selectedTags.has(index) && getStatusIcon(result)}

                                            {result.status === 'matched' ? (
                                                <span className={cn("font-medium", !selectedTags.has(index) && "line-through")}>
                                                    {result.matched?.value}
                                                </span>
                                            ) : result.status === 'fuzzy' && result.alternatives.length > 0 ? (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button className={cn(
                                                            "flex items-center gap-1 font-medium hover:underline",
                                                            !selectedTags.has(index) && "line-through"
                                                        )}>
                                                            {selectedTags.get(index) || result.original}
                                                            <ChevronDown className="h-3 w-3" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="start">
                                                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                                            {t('promptGenerator.original', '원본')}: {result.original}
                                                        </div>
                                                        {result.alternatives.map((alt, altIndex) => (
                                                            <DropdownMenuItem
                                                                key={altIndex}
                                                                onClick={() => handleSelectTag(index, alt.value)}
                                                                className={cn(
                                                                    selectedTags.get(index) === alt.value && "bg-primary/10"
                                                                )}
                                                            >
                                                                <span>{alt.label}</span>
                                                                <span className="ml-auto text-xs text-muted-foreground">
                                                                    {alt.count >= 1000 ? `${(alt.count / 1000).toFixed(1)}k` : alt.count}
                                                                </span>
                                                            </DropdownMenuItem>
                                                        ))}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            ) : (
                                                <span className="text-muted-foreground line-through">
                                                    {result.original}
                                                </span>
                                            )}
                                            {meaningOf(index) && (
                                                <span className="text-xs text-muted-foreground">({meaningOf(index)})</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </div>
                    )}

                    {/* Natural-language sentence */}
                    {natural && (
                        <div className="space-y-1.5">
                            <label className="flex items-center gap-2 text-sm font-medium">
                                <input
                                    type="checkbox"
                                    checked={includeNatural}
                                    onChange={(e) => setIncludeNatural(e.target.checked)}
                                    className="h-3.5 w-3.5 accent-primary"
                                />
                                {t('promptGenerator.natural', '자연어 문장도 함께 넣기')}
                            </label>
                            <Textarea
                                value={natural}
                                onChange={(e) => setNatural(e.target.value)}
                                className="min-h-[56px] resize-none text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            />
                        </div>
                    )}
                </div>

                {/* Only show Apply button when there are results */}
                {hasOutput && (
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                navigator.clipboard.writeText(finalText())
                                toast({
                                    title: t('common.copied', '복사됨'),
                                    description: t('promptGenerator.copiedToClipboard', '클립보드에 복사되었습니다'),
                                })
                            }}
                            disabled={!canApply}
                        >
                            <Copy className="h-4 w-4 mr-1" />
                            {t('common.copy', '복사')}
                        </Button>
                        <Button
                            onClick={handleApply}
                            disabled={!canApply}
                        >
                            {t('promptGenerator.apply', '프롬프트에 적용')}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    )
}
