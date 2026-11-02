/**
 * Cloudflare Worker：模型 API 代理（範例）。
 * 環境變數：必填 MODEL、PROVIDER_API_KEY（secret）、ALLOWED_ORIGIN；選用 PROVIDER（openai|anthropic|xai|glm|deepseek|gemini，預設 openai；
 * 其他值要有 BASE_URL）、BASE_URL（覆寫端點）、MAX_OUTPUT_TOKENS（輸出上限，預設 8000）、UPSTREAM_TIMEOUT_MS（上游逾時，毫秒，預設 60000、最大 2147483647）。
 * 設定不完整或不合格時一律回 500，不呼叫上游。
 * 安全：固定 system prompt；來源限制；請求大小上限 512 KB（以實際讀到的位元組計算）；上游逾時回 504、上游錯誤回 502 且不轉發上游的內容；
 * 簡易速率限制（每 IP 每分鐘 5 次，使用記憶體 Map，僅示範）。這是範例，不可直接上線（缺的部分見 backend/README.md）。
 */
// 授權範圍守門：規則只來自 schema，由 assets/scope-gate.js 判定（與網站示範引擎共用，見 docs/adr/0004）；
// 部署用的 dist/worker.js 由 scripts/build-worker.mjs 把它內嵌，仍是單一檔案
import GATE from '../assets/scope-gate.js';

const CORE_PROMPT = `（部署時以 build 步驟把 skills/shared/core-prompt.md 的提示詞區塊貼入此處）`;
// 已知的供應商：預設端點（不帶尾端斜線，下面接 /chat/completions 或 /v1/messages）與 OpenAI 相容端點的輸出上限參數。
// 參數依各供應商官方文件：OpenAI、xAI 用 max_completion_tokens（max_tokens 已 deprecated），GLM、DeepSeek 用 max_tokens；
// Gemini 的 OpenAI 相容端點（官方標示 beta）官方未說明參數名稱，與 BASE_URL 指定的其他端點一樣用 max_tokens（待驗證）。
// Anthropic 走自己的 Messages API，用 max_tokens。
const PROVIDERS = {
  openai: { base: 'https://api.openai.com/v1', outputParam: 'max_completion_tokens' },
  xai: { base: 'https://api.x.ai/v1', outputParam: 'max_completion_tokens' },
  glm: { base: 'https://api.z.ai/api/paas/v4' },
  deepseek: { base: 'https://api.deepseek.com' },
  gemini: { base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  anthropic: { base: 'https://api.anthropic.com' }
};
const MAX_BODY = 512 * 1024; // 請求內容上限（位元組）
const MAX_TIMER_MS = 2 ** 31 - 1; // 計時器的上限；超過時 Node 會改成 1 毫秒（實測），等於每次都立刻逾時
const hits = new Map();

// 讀設定並檢查：必填的沒設（或是空字串）、PROVIDER 不認得又沒有 BASE_URL、選用的數值不是正整數（或超過上限）時，
// 都列進 problems，呼叫端一律拒絕、不放行。選用的數值沒設或是空字串時用預設值
function readConfig(env) {
  const problems = ['ALLOWED_ORIGIN', 'MODEL', 'PROVIDER_API_KEY'].filter(k => !env[k]);
  const provider = env.PROVIDER || 'openai';
  const known = Object.hasOwn(PROVIDERS, provider) ? PROVIDERS[provider] : null;
  if (!known && !env.BASE_URL) problems.push('PROVIDER');
  const positiveInt = (key, fallback, max = Infinity) => {
    if (env[key] === undefined || env[key] === '') return fallback;
    const n = /^[1-9]\d*$/.test(String(env[key])) ? Number(env[key]) : NaN;
    if (!(n <= max)) problems.push(key);
    return n;
  };
  return {
    problems, provider, base: env.BASE_URL || known?.base, outputParam: known?.outputParam || 'max_tokens',
    maxOutput: positiveInt('MAX_OUTPUT_TOKENS', 8000), timeoutMs: positiveInt('UPSTREAM_TIMEOUT_MS', 60000, MAX_TIMER_MS)
  };
}

// 以實際讀到的位元組計算請求大小：content-length 可能沒有或不正確，所以逐塊累計；超過 limit 就停止讀取、回 null
async function readLimited(request, limit) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(bytes);
}

export default {
  async fetch(request, env) {
    const config = readConfig(env);
    if (config.problems.length) return new Response(`後端代理的設定不完整或不合格：${config.problems.join('、')}`, { status: 500 });
    const origin = request.headers.get('origin') || '';
    const cors = { 'access-control-allow-origin': env.ALLOWED_ORIGIN, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/analyze') return new Response('Not found', { status: 404 });
    if (origin !== env.ALLOWED_ORIGIN) return new Response('Forbidden origin', { status: 403 });
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const now = Date.now(); const rec = hits.get(ip) || []; const recent = rec.filter(t => now - t < 60000);
    if (recent.length >= 5) return new Response('Rate limited', { status: 429, headers: cors });
    hits.set(ip, [...recent, now]);
    const tooLarge = () => new Response('Payload too large', { status: 413, headers: cors });
    // 宣告的大小超過就不讀內容；宣告的不一定正確，實際位元組仍由 readLimited 數
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return tooLarge();
    const text = await readLimited(request, MAX_BODY);
    if (text === null) return tooLarge();
    let body; try { body = JSON.parse(text); } catch { return new Response('Bad JSON', { status: 400, headers: cors }); }
    const problems = GATE.scopeProblems(body?.bundle?.scope);
    if (problems.length) return new Response(`缺少 scope 或必填欄位不合格：${problems.join('、')}；無授權範圍不得分析`, { status: 400, headers: cors });
    const user = `請依系統指令進行先制型曝險分析。輸入：\n\`\`\`json\n${JSON.stringify(GATE.scopedBundle(body.bundle))}\n\`\`\``;
    const { provider, base, outputParam, maxOutput, timeoutMs } = config;
    const [url, init] = provider === 'anthropic'
      ? [`${base}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.PROVIDER_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: env.MODEL, max_tokens: maxOutput, system: CORE_PROMPT, messages: [{ role: 'user', content: user }] }) }]
      : [`${base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PROVIDER_API_KEY}` }, body: JSON.stringify({ model: env.MODEL, [outputParam]: maxOutput, messages: [{ role: 'system', content: CORE_PROMPT }, { role: 'user', content: user }] }) }];
    // Cloudflare 對子請求沒有時間上限，UPSTREAM_TIMEOUT_MS 是唯一的界線；逾時看自己的 signal，不比對錯誤名稱（各執行環境不一定相同）
    const signal = AbortSignal.timeout(timeoutMs);
    // 上游的錯誤內容與例外訊息可能含帳號或金鑰的資訊，不轉發給用戶端；非 2xx 只附狀態碼數字方便除錯
    let status, content;
    try {
      const upstream = await fetch(url, { ...init, signal });
      if (!upstream.ok) { await upstream.body?.cancel(); return new Response(`Upstream error: ${upstream.status}`, { status: 502, headers: cors }); }
      // 回應內容也在逾時內讀完，逾時就回 504，不會轉發讀到一半的內容
      status = upstream.status; content = await upstream.text();
    } catch {
      return signal.aborted ? new Response('Upstream timeout', { status: 504, headers: cors }) : new Response('Upstream error', { status: 502, headers: cors });
    }
    return new Response(content, { status, headers: { ...cors, 'content-type': 'application/json' } });
  }
};
