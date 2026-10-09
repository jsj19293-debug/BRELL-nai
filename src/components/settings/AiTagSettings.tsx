// 설정 > API: 한글 → 태그 찾기에 쓰는 Claude · GPT 키와 옵션.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/use-toast'
import { useSettingsStore } from '@/stores/settings-store'
import {
    AI_MODELS,
    AI_PROVIDER_LABELS,
    AiError,
    DEFAULT_AI_MODEL,
    suggestTagsForTerm,
    type AiProvider,
} from '@/services/ai-tag-service'
import { clearKoTagCache } from '@/lib/ko-tag-suggest'

const KEY_FIELDS: { provider: 'claude' | 'openai'; placeholder: string; help: string; helpKey: string }[] = [
    { provider: 'claude', placeholder: 'sk-ant-...', help: 'Claude Console(console.anthropic.com)에서 API 키를 발급받으세요', helpKey: 'settingsPage.aiTags.claudeHelp' },
    { provider: 'openai', placeholder: 'sk-...', help: 'OpenAI Platform(platform.openai.com)에서 API 키를 발급받으세요', helpKey: 'settingsPage.aiTags.openaiHelp' },
]
const PROVIDERS: AiProvider[] = ['gemini', 'claude', 'openai']

export function AiTagSettings() {
    const { t } = useTranslation()
    const geminiApiKey = useSettingsStore(state => state.geminiApiKey)
    const anthropicApiKey = useSettingsStore(state => state.anthropicApiKey)
    const openaiApiKey = useSettingsStore(state => state.openaiApiKey)
    const aiTagProvider = useSettingsStore(state => state.aiTagProvider)
    const aiTagModels = useSettingsStore(state => state.aiTagModels)
    const koTagAiSuggestEnabled = useSettingsStore(state => state.koTagAiSuggestEnabled)
    const koTagHintEnabled = useSettingsStore(state => state.koTagHintEnabled)
    const setAiTagConfig = useSettingsStore(state => state.setAiTagConfig)
    const setAiTagModel = useSettingsStore(state => state.setAiTagModel)

    const savedKeys: Record<AiProvider, string> = { gemini: geminiApiKey, claude: anthropicApiKey, openai: openaiApiKey }
    const [drafts, setDrafts] = useState({ claude: anthropicApiKey, openai: openaiApiKey })
    const [testing, setTesting] = useState<AiProvider | null>(null)

    const modelOf = (provider: AiProvider): string => aiTagModels?.[provider] || DEFAULT_AI_MODEL[provider]

    const saveKey = (provider: 'claude' | 'openai') => {
        const value = drafts[provider].trim()
        setAiTagConfig(provider === 'claude' ? { anthropicApiKey: value } : { openaiApiKey: value })
        toast({ title: t('settingsPage.saved'), variant: 'success' })
    }

    // 실제로 짧은 요청을 한 번 보내 키와 모델 이름을 함께 확인한다 (토큰이 조금 든다).
    const testKey = async (provider: AiProvider) => {
        const apiKey = provider === 'gemini' ? geminiApiKey : drafts[provider].trim()
        if (!apiKey) return
        setTesting(provider)
        try {
            const tags = await suggestTagsForTerm('벚꽃', { provider, apiKey, model: modelOf(provider) })
            toast({
                title: t('settingsPage.aiTags.testOk', '{{provider}} 연결 확인', { provider: AI_PROVIDER_LABELS[provider] }),
                description: tags.length
                    ? t('settingsPage.aiTags.testSample', '벚꽃 → {{tags}}', { tags: tags.slice(0, 3).map(item => item.tag).join(', ') })
                    : undefined,
                variant: 'success',
            })
        } catch (error) {
            toast({
                title: t('settingsPage.aiTags.testFailed', '{{provider}} 연결 실패', { provider: AI_PROVIDER_LABELS[provider] }),
                description: error instanceof AiError ? `${error.code}${error.detail ? ` · ${error.detail}` : ''}` : String(error),
                variant: 'destructive',
            })
        } finally {
            setTesting(null)
        }
    }

    return (
        <div className="space-y-4 pt-4 border-t border-border/30">
            <div>
                <label className="text-sm font-medium flex items-center gap-2">
                    <Languages className="h-4 w-4 text-violet-500" />
                    {t('settingsPage.aiTags.title', '한글 → 태그 찾기 (Claude · GPT)')}
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                    {t('settingsPage.aiTags.description', '프롬프트 칸에 한글을 치면 영어 태그 (한글 뜻)이 추천되고, 누르면 영어 태그가 들어갑니다. 앱의 단부루 태그 목록에 있는 태그만 보여줍니다. 키는 이 PC에만 저장됩니다.')}
                </p>
            </div>

            {KEY_FIELDS.map(field => (
                <div key={field.provider} className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                        {t(`settingsPage.aiTags.${field.provider}Key`, `${AI_PROVIDER_LABELS[field.provider]} API Key`)}
                    </label>
                    <div className="flex gap-2">
                        <Input
                            type="password"
                            placeholder={field.placeholder}
                            value={drafts[field.provider]}
                            onChange={(e) => setDrafts(previous => ({ ...previous, [field.provider]: e.target.value }))}
                            className="flex-1"
                        />
                        <Button
                            variant="outline"
                            disabled={!drafts[field.provider].trim() || testing !== null}
                            onClick={() => void testKey(field.provider)}
                        >
                            {testing === field.provider
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : t('settingsPage.aiTags.test', '확인')}
                        </Button>
                        <Button onClick={() => saveKey(field.provider)}>
                            {t('settingsPage.saveBtn')}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t(field.helpKey, field.help)}</p>
                </div>
            ))}

            <div className="space-y-2">
                <label className="text-sm font-medium">
                    {t('settingsPage.aiTags.provider', '태그 찾기에 쓸 AI')}
                </label>
                <div className="flex flex-wrap gap-2">
                    {PROVIDERS.map(provider => (
                        <Button
                            key={provider}
                            size="sm"
                            variant={aiTagProvider === provider ? 'default' : 'outline'}
                            disabled={!savedKeys[provider]?.trim()}
                            onClick={() => setAiTagConfig({ aiTagProvider: provider })}
                        >
                            {AI_PROVIDER_LABELS[provider]}
                            {!savedKeys[provider]?.trim() && ` (${t('promptGenerator.noKey', '키 없음')})`}
                        </Button>
                    ))}
                </div>
                {!savedKeys[aiTagProvider]?.trim() && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t('settingsPage.aiTags.providerNoKey', '고른 AI의 키가 없어요. 지금은 내장 용어집(자주 쓰는 태그 약 430개)만 사용합니다.')}
                    </p>
                )}
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
                {PROVIDERS.map(provider => (
                    <label key={provider} className="space-y-1 text-xs text-muted-foreground">
                        <span>{t('settingsPage.aiTags.model', '{{provider}} 모델', { provider: AI_PROVIDER_LABELS[provider] })}</span>
                        <Input
                            value={aiTagModels?.[provider] ?? ''}
                            placeholder={DEFAULT_AI_MODEL[provider]}
                            list={`ai-tag-models-${provider}`}
                            onChange={(e) => setAiTagModel(provider, e.target.value)}
                        />
                        <datalist id={`ai-tag-models-${provider}`}>
                            {AI_MODELS[provider].map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                        </datalist>
                    </label>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
                {t('settingsPage.aiTags.modelHelp', '비워 두면 기본 모델을 씁니다. 모델 이름은 제공사가 바꿀 수 있어서, 오류가 나면 최신 모델 ID를 직접 입력하세요.')}
            </p>

            <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                    {t('settingsPage.aiTags.aiSuggest', '한글 입력 시 AI에게도 태그 물어보기')}
                    <span className="block text-xs text-muted-foreground">
                        {t('settingsPage.aiTags.aiSuggestHelp', '입력을 멈추면 한 번 물어보고, 같은 말은 저장해 두어 다시 묻지 않아요. 끄면 내장 용어집만 씁니다.')}
                    </span>
                </span>
                <Switch
                    checked={koTagAiSuggestEnabled}
                    onChange={event => setAiTagConfig({ koTagAiSuggestEnabled: event.target.checked })}
                />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
                <span>{t('settingsPage.aiTags.hint', '영어 태그 자동완성 옆에 한글 뜻 보여주기')}</span>
                <Switch
                    checked={koTagHintEnabled}
                    onChange={event => setAiTagConfig({ koTagHintEnabled: event.target.checked })}
                />
            </label>
            <Button
                variant="outline"
                size="sm"
                onClick={() => {
                    clearKoTagCache()
                    toast({ title: t('settingsPage.aiTags.cacheCleared', '저장해 둔 AI 태그 결과를 지웠어요'), variant: 'success' })
                }}
            >
                {t('settingsPage.aiTags.clearCache', 'AI 태그 결과 캐시 지우기')}
            </Button>
        </div>
    )
}
