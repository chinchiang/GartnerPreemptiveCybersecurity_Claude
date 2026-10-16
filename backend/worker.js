/**
 * Cloudflare Worker：模型 API 代理（範例）。
 * 環境變數：PROVIDER（openai|anthropic|xai|glm|deepseek）、MODEL、PROVIDER_API_KEY（secret）、ALLOWED_ORIGIN、BASE_URL（選用覆寫）。
 * 安全：固定 system prompt；來源限制；請求大小上限 512 KB；簡易速率限制（每 IP 每分鐘 5 次，使用記憶體 Map，僅示範）。
 */
const CORE_PROMPT = `（部署時以 build 步驟把 skills/shared/core-prompt.md 的提示詞區塊貼入此處）`;
const DEFAULT_BASE = { openai: 'https://api.openai.com/v1', xai: 'https://api.x.ai/v1', glm: 'https://api.z.ai/api/paas/v4', deepseek: 'https://api.deepseek.com', anthropic: 'https://api.anthropic.com' };
const hits = new Map();
// 授權範圍守門：與網站示範引擎（assets/demo.js 的 scopeProblems）同一套規則，由 tests/fixtures/scope-cases.json 的共用案例守住一致。
// Worker 獨立部署，不能載入 demo.js，所以在這裡自帶一份；規則改了要同時改兩處。回傳缺少或不合格的必填欄位清單；空陣列表示可以分析。
const SCOPE_REQUIRED = ['organization', 'analysis_date', 'authorized_scope.in_scope_assets', 'authorized_scope.active_testing_authorized', 'authorized_scope.external_scanning_authorized', 'reporting.audience'];
// 至少一個非空白字元（schema 的 pattern）：明確列出空白字元，取 Python 與 JS 兩邊 \s 的聯集，三份守門判定一致
const NON_BLANK = /[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/;
// RFC 3339 full-date（schema 的 format: date）：恰好 YYYY-MM-DD，而且是存在的日期。不用 Date：它會把 2026-02-30 換算成 3 月 2 日；
// 年份從 1 起算，與 Python 的 date 一致
const isFullDate = (s) => {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = m.slice(1).map(Number);
  const days = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return y >= 1 && mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo - 1];
};
function scopeProblems(scope) {
  if (!scope || typeof scope !== 'object') return [...SCOPE_REQUIRED];
  const get = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
  return SCOPE_REQUIRED.filter(p => {
    const v = get(p);
    if (v === undefined || v === null || v === '') return true;
    if (p === 'organization') return typeof v !== 'string' || !NON_BLANK.test(v);
    if (p === 'analysis_date') return typeof v !== 'string' || !isFullDate(v);
    if (p === 'authorized_scope.in_scope_assets' || p === 'reporting.audience') // 非空陣列，每項都是含非空白字元的字串
      return !Array.isArray(v) || v.length === 0 || !v.every(x => typeof x === 'string' && NON_BLANK.test(x));
    if (p.endsWith('_authorized')) return typeof v !== 'boolean';
    return false;
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const cors = { 'access-control-allow-origin': env.ALLOWED_ORIGIN || '', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/analyze') return new Response('Not found', { status: 404 });
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) return new Response('Forbidden origin', { status: 403 });
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const now = Date.now(); const rec = hits.get(ip) || []; const recent = rec.filter(t => now - t < 60000);
    if (recent.length >= 5) return new Response('Rate limited', { status: 429, headers: cors });
    hits.set(ip, [...recent, now]);
    const len = Number(request.headers.get('content-length') || 0);
    if (len > 512 * 1024) return new Response('Payload too large', { status: 413, headers: cors });
    let body; try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400, headers: cors }); }
    const problems = scopeProblems(body?.bundle?.scope);
    if (problems.length) return new Response(`缺少 scope 或必填欄位不合格：${problems.join('、')}；無授權範圍不得分析`, { status: 400, headers: cors });
    const user = `請依系統指令進行先制型曝險分析。輸入：\n\`\`\`json\n${JSON.stringify(body.bundle).slice(0, 400000)}\n\`\`\``;
    const provider = env.PROVIDER || 'openai';
    const base = env.BASE_URL || DEFAULT_BASE[provider];
    let upstream;
    if (provider === 'anthropic') {
      upstream = await fetch(`${base}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.PROVIDER_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: env.MODEL, max_tokens: 8000, system: CORE_PROMPT, messages: [{ role: 'user', content: user }] }) });
    } else {
      upstream = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.PROVIDER_API_KEY}` }, body: JSON.stringify({ model: env.MODEL, messages: [{ role: 'system', content: CORE_PROMPT }, { role: 'user', content: user }] }) });
    }
    return new Response(upstream.body, { status: upstream.status, headers: { ...cors, 'content-type': 'application/json' } });
  }
};
