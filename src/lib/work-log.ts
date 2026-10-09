/**
 * 작업 기록: 날짜별 · 모델별로 몇 장을 뽑았고 얼마를 썼는지.
 * V4.5 이하 모델은 Anlas로, V5는 사용량 %로 빠지므로 둘 다 적는다.
 */

export interface WorkLogModelEntry {
    images: number
    /** 그 모델로 생성하면서 줄어든 Anlas */
    anlas: number
    /** 그 모델로 생성하면서 줄어든 V5 사용량 (%p) */
    v5Percent: number
}

export interface WorkLogDay {
    /** 'YYYY-MM-DD' (이 PC의 날짜) */
    date: string
    models: Record<string, WorkLogModelEntry>
}

export interface UsageSnapshot {
    /** 계정을 구분하는 값 (바뀌면 차이를 계산하지 않는다) */
    account: string
    anlas: number | null
    /** V5 남은 사용량 % */
    v5Percent: number | null
}

export const WORK_LOG_MAX_DAYS = 365
/** 생성 직후 이 시간 안에 줄어든 잔량만 그 생성의 사용량으로 본다 */
export const WORK_LOG_ATTRIBUTION_MS = 3 * 60 * 1000

const MODEL_LABELS: Record<string, string> = {
    'nai-diffusion-5-full': 'V5 Full',
    'nai-diffusion-5-curated': 'V5 Curated',
    'nai-diffusion-4-5-full': 'V4.5 Full',
    'nai-diffusion-4-5-curated': 'V4.5 Curated',
    'nai-diffusion-4-full': 'V4 Full',
    'nai-diffusion-4-curated-preview': 'V4 Curated',
    'nai-diffusion-3': 'V3',
    'nai-diffusion-furry-3': 'Furry V3',
}

export function workLogModelLabel(model: string): string {
    return MODEL_LABELS[model] || model || '알 수 없음'
}

export function dateKey(timestamp: number): string {
    const date = new Date(timestamp)
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const round = (value: number) => Math.round(value * 100) / 100

/** 그날 · 그 모델의 기록에 더한다. 최신 날짜가 앞에 오고, 오래된 날짜는 버린다. */
export function addToWorkLog(
    days: readonly WorkLogDay[],
    date: string,
    model: string,
    change: Partial<WorkLogModelEntry>,
): WorkLogDay[] {
    const add = {
        images: Math.max(0, Math.floor(change.images ?? 0)),
        anlas: Math.max(0, change.anlas ?? 0),
        v5Percent: Math.max(0, change.v5Percent ?? 0),
    }
    if (!date || !model || (add.images === 0 && add.anlas === 0 && add.v5Percent === 0)) return [...days]
    const existing = days.find(day => day.date === date)
    const previous = existing?.models[model] ?? { images: 0, anlas: 0, v5Percent: 0 }
    const updated: WorkLogDay = {
        date,
        models: {
            ...(existing?.models ?? {}),
            [model]: {
                images: previous.images + add.images,
                anlas: round(previous.anlas + add.anlas),
                v5Percent: round(previous.v5Percent + add.v5Percent),
            },
        },
    }
    return [updated, ...days.filter(day => day.date !== date)]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, WORK_LOG_MAX_DAYS)
}

/**
 * 잔량이 줄어든 만큼만 사용량으로 본다. 늘어난 것(충전, 구독 갱신)이나 계정이 바뀐 경우,
 * 값을 모르는 경우는 0이다.
 */
export function usageSpent(previous: UsageSnapshot | null, next: UsageSnapshot): { anlas: number; v5Percent: number } {
    if (!previous || previous.account !== next.account) return { anlas: 0, v5Percent: 0 }
    const drop = (before: number | null, after: number | null) =>
        (before !== null && after !== null && Number.isFinite(before) && Number.isFinite(after) && after < before ? round(before - after) : 0)
    return { anlas: drop(previous.anlas, next.anlas), v5Percent: drop(previous.v5Percent, next.v5Percent) }
}

export function summarizeDay(day: WorkLogDay): WorkLogModelEntry {
    return Object.values(day.models).reduce<WorkLogModelEntry>((sum, entry) => ({
        images: sum.images + entry.images,
        anlas: round(sum.anlas + entry.anlas),
        v5Percent: round(sum.v5Percent + entry.v5Percent),
    }), { images: 0, anlas: 0, v5Percent: 0 })
}

export function summarizeWorkLog(days: readonly WorkLogDay[]): WorkLogModelEntry {
    return days.map(summarizeDay).reduce<WorkLogModelEntry>((sum, entry) => ({
        images: sum.images + entry.images,
        anlas: round(sum.anlas + entry.anlas),
        v5Percent: round(sum.v5Percent + entry.v5Percent),
    }), { images: 0, anlas: 0, v5Percent: 0 })
}

/** 모델별 줄: 많이 뽑은 모델부터 */
export function dayModelRows(day: WorkLogDay): Array<WorkLogModelEntry & { model: string; label: string }> {
    return Object.entries(day.models)
        .map(([model, entry]) => ({ model, label: workLogModelLabel(model), ...entry }))
        .sort((a, b) => b.images - a.images || a.label.localeCompare(b.label))
}

/** 기록을 CSV로 (엑셀에서 열 수 있게). */
export function workLogCsv(days: readonly WorkLogDay[]): string {
    const lines = ['날짜,모델,장수,Anlas,V5 사용량(%)']
    for (const day of days) {
        for (const row of dayModelRows(day)) lines.push([day.date, row.label, row.images, row.anlas, row.v5Percent].join(','))
    }
    return lines.join('\r\n') + '\r\n'
}
