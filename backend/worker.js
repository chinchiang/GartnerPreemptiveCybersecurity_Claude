/**
 * Cloudflare Worker：模型 API 代理（範例）。
 * 環境變數：PROVIDER（openai|anthropic|xai|glm|deepseek）、MODEL、PROVIDER_API_KEY（secret）、ALLOWED_ORIGIN、BASE_URL（選用覆寫）。
 * 安全：固定 system prompt；來源限制；請求大小上限 512 KB；簡易速率限制（每 IP 每分鐘 5 次，使用記憶體 Map，僅示範）。
 */
const CORE_PROMPT = `（部署時以 build 步驟把 skills/shared/core-prompt.md 的提示詞區塊貼入此處）`;
const DEFAULT_BASE = { openai: 'https://api.openai.com/v1', xai: 'https://api.x.ai/v1', glm: 'https://api.z.ai/api/paas/v4', deepseek: 'https://api.deepseek.com', anthropic: 'https://api.anthropic.com' };
const hits = new Map();

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
    if (!body?.bundle?.scope) return new Response('缺少 scope：無授權範圍不得分析', { status: 400, headers: cors });
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
