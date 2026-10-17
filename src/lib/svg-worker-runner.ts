/**
 * SVG 워커 코드 실행기. 코드는 스크립트만 허용된 별도 상자(출처가 없는 iframe) 안에서 돌린다:
 * 앱의 저장 데이터나 화면에는 손댈 수 없다. Cloudflare 전용 캐시(caches.default)는 빈 흉내로 채운다.
 */
export interface WorkerRunResult {
    status: number
    contentType: string
    body: string
}

const RUNNER_HTML = `<!doctype html><meta charset="utf-8"><script>
const shim = { match: async () => undefined, put: async () => {}, delete: async () => false };
try { Object.defineProperty(self, 'caches', { value: { default: shim, open: async () => shim }, configurable: true }); } catch (e) {}
let loaded = { code: null, mod: null };
addEventListener('message', async (event) => {
  const { id, code, url } = event.data || {};
  if (!id) return;
  try {
    if (loaded.code !== code) {
      const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      try { loaded = { code, mod: await import(blobUrl) }; } finally { URL.revokeObjectURL(blobUrl); }
    }
    const handler = loaded.mod && loaded.mod.default;
    if (!handler || typeof handler.fetch !== 'function') throw new Error('export default { fetch } 를 찾지 못했습니다');
    const waits = [];
    const ctx = { waitUntil: (p) => waits.push(Promise.resolve(p).catch(() => {})), passThroughOnException() {} };
    const response = await handler.fetch(new Request(url), {}, ctx);
    const body = await response.text();
    parent.postMessage({ id, ok: true, status: response.status, contentType: response.headers.get('content-type') || '', body }, '*');
  } catch (error) {
    parent.postMessage({ id, ok: false, error: String((error && (error.stack || error.message)) || error) }, '*');
  }
});
</script>`

let frame: HTMLIFrameElement | null = null
let ready: Promise<HTMLIFrameElement> | null = null
let nextId = 1
const pending = new Map<number, { resolve: (value: WorkerRunResult) => void; reject: (error: Error) => void; timer: number }>()

function ensureFrame(): Promise<HTMLIFrameElement> {
    if (ready && frame?.isConnected) return ready
    frame?.remove()
    const element = document.createElement('iframe')
    element.setAttribute('sandbox', 'allow-scripts')
    element.setAttribute('aria-hidden', 'true')
    element.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none'
    element.srcdoc = RUNNER_HTML
    frame = element
    ready = new Promise(resolve => {
        element.addEventListener('load', () => resolve(element), { once: true })
    })
    document.body.appendChild(element)
    return ready
}

window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow) return
    const data = event.data as { id?: number; ok?: boolean; status?: number; contentType?: string; body?: string; error?: string }
    const job = data?.id ? pending.get(data.id) : undefined
    if (!job) return
    pending.delete(data.id!)
    window.clearTimeout(job.timer)
    if (data.ok) job.resolve({ status: data.status ?? 200, contentType: data.contentType ?? '', body: data.body ?? '' })
    else job.reject(new Error(data.error || '워커 실행 오류'))
})

/** 워커 코드에 요청 하나를 보내고 응답을 받는다. 오래 걸리면(15초) 실패로 본다. */
export async function runSvgWorker(code: string, url: string, timeoutMs = 15000): Promise<WorkerRunResult> {
    const target = await ensureFrame()
    const id = nextId++
    return new Promise<WorkerRunResult>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            pending.delete(id)
            // 멈춘 코드(무한 반복 등)일 수 있으니 상자를 새로 만든다.
            frame?.remove()
            frame = null
            ready = null
            reject(new Error('워커가 응답하지 않습니다 (15초 초과)'))
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
        target.contentWindow?.postMessage({ id, code, url }, '*')
    })
}
