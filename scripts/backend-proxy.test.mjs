// backend-proxy.test.mjs — 選用後端代理的請求大小、完整的 JSON、輸出上限、上游逾時與錯誤、設定不完整時拒絕（#151）
// 以 ES module 載入 backend/worker.js，送真的 Request 給它的 fetch；上游的 globalThis.fetch 換成假的，記錄呼叫與內容。
import { test, describe, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import worker from '../backend/worker.js';

const gate = createRequire(import.meta.url)('../assets/scope-gate.js');

const scope = JSON.parse(readFileSync(new URL('../examples/synthetic-org/scope.json', import.meta.url), 'utf8'));
const ORIGIN = 'https://allowed.example';
const ENV = { ALLOWED_ORIGIN: ORIGIN, PROVIDER: 'openai', MODEL: 'test-model', PROVIDER_API_KEY: 'test-key' };
const LIMIT = 524288; // 512 KB

let upstream = []; // 假上游收到的 [網址, fetch 的第二個參數]
let reply; // 假上游的回應：(url, init) => Response 或 Promise
let ip = 0; // worker 每個 IP 每分鐘只放行 5 次，每個請求用不同的 IP
const request = (body, headers = {}, method = 'POST') => new Request('https://worker.example/api/analyze', {
  method, headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': `198.51.100.${++ip}`, ...headers }, body
});
const send = (req, env = ENV) => worker.fetch(req, env);
// 上游收到的提示詞裡、```json 區塊的內容（OpenAI 相容路徑是 messages[1]，Anthropic 路徑是 messages[0]）
const sentJson = ([, init]) => JSON.parse(init.body).messages.at(-1).content.match(/```json\n([\s\S]*)\n```/)[1];
// 剛好 bytes 位元組、內容合法的請求：scope 合格，多出來的長度放在頂層的 padding 字串
const sized = (bytes) => {
  const head = JSON.stringify({ bundle: { scope }, padding: '' }).slice(0, -2);
  return `${head}${'x'.repeat(bytes - Buffer.byteLength(head) - 2)}"}`;
};

describe('後端代理（backend/worker.js）的請求與上游處理', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    upstream = []; reply = () => new Response('{}', { status: 200 });
    globalThis.fetch = async (url, init) => { upstream.push([url, init]); return reply(url, init); };
  });
  after(() => { globalThis.fetch = realFetch; });

  test('請求大小：不帶 content-length、實際 524,289 位元組的請求回 413，不呼叫上游', async () => {
    const body = sized(LIMIT + 1);
    assert.equal(Buffer.byteLength(body), LIMIT + 1);
    const req = request(body);
    assert.equal(req.headers.get('content-length'), null);
    const r = await send(req);
    assert.equal(r.status, 413);
    assert.equal(upstream.length, 0);
  });

  // Node 的 new Request 會保留手動設的 content-length（Workers 與 Fetch 規格不會），這條靠它做出「標頭比實際小」的請求
  test('請求大小：標頭寫 100、實際 524,289 位元組的請求回 413，不呼叫上游', async () => {
    const req = request(sized(LIMIT + 1), { 'content-length': '100' });
    assert.equal(req.headers.get('content-length'), '100');
    const r = await send(req);
    assert.equal(r.status, 413);
    assert.equal(upstream.length, 0);
  });

  test('請求大小：標頭寫 524,289 的請求回 413，不讀內容、不呼叫上游', async () => {
    const req = request(sized(LIMIT + 1), { 'content-length': String(LIMIT + 1) });
    const r = await send(req);
    assert.equal(r.status, 413);
    assert.equal(req.bodyUsed, false);
    assert.equal(upstream.length, 0);
  });

  test('請求大小：剛好 524,288 位元組、內容合法的請求不算超過，送往上游', async () => {
    const body = sized(LIMIT);
    assert.equal(Buffer.byteLength(body), LIMIT);
    const r = await send(request(body));
    assert.equal(r.status, 200);
    assert.equal(upstream.length, 1);
  });

  test('請求大小：4 MB 的串流，超過上限就停止讀取並回 413', async () => {
    const CHUNK = 64 * 1024, TOTAL = 4 * 1024 * 1024; let pulled = 0;
    const big = new ReadableStream({ pull(c) { if (pulled >= TOTAL) return c.close(); pulled += CHUNK; c.enqueue(new Uint8Array(CHUNK)); } });
    const r = await send(new Request('https://worker.example/api/analyze', {
      method: 'POST', headers: { origin: ORIGIN, 'cf-connecting-ip': `198.51.100.${++ip}` }, body: big, duplex: 'half'
    }));
    assert.equal(r.status, 413);
    assert.equal(upstream.length, 0);
    // 停在超過上限的那一塊；串流可能先預讀一塊
    assert.ok(pulled <= LIMIT + 2 * CHUNK, `讀了 ${pulled} 位元組`);
  });

  test('完整的 JSON：threat_intel 放 450,000 字時，上游收到的 JSON 可以解析，而且等於 scopedBundle(bundle)', async () => {
    const bundle = { scope, threat_intel: { actors: [{ name: 'APT-X', recent_activity: 'y'.repeat(450000) }] } };
    const r = await send(request(JSON.stringify({ bundle })));
    assert.equal(r.status, 200);
    assert.equal(upstream.length, 1);
    const sent = JSON.parse(sentJson(upstream[0]));
    assert.equal(sent.threat_intel.actors[0].recent_activity.length, 450000);
    assert.deepEqual(sent, gate.scopedBundle(bundle));
  });

  // 參數名稱依各供應商的官方文件（OpenAI、xAI：max_completion_tokens；GLM、DeepSeek、Anthropic：max_tokens）；
  // Gemini 的 OpenAI 相容端點官方未說明，照 #151 的預設用 max_tokens，列為待驗證
  const OUTPUT_PARAM = { openai: 'max_completion_tokens', xai: 'max_completion_tokens', glm: 'max_tokens', deepseek: 'max_tokens', gemini: 'max_tokens', anthropic: 'max_tokens' };
  for (const [provider, param] of Object.entries(OUTPUT_PARAM)) {
    test(`輸出上限：PROVIDER=${provider} 帶 ${param}，沒設 MAX_OUTPUT_TOKENS 時是 8000，設成 1234 時是 1234`, async () => {
      for (const [extra, expected] of [[{}, 8000], [{ MAX_OUTPUT_TOKENS: '1234' }, 1234]]) {
        upstream = [];
        const r = await send(request(JSON.stringify({ bundle: { scope } })), { ...ENV, PROVIDER: provider, ...extra });
        assert.equal(r.status, 200);
        const sent = JSON.parse(upstream[0][1].body);
        assert.equal(sent[param], expected);
        const other = param === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';
        assert.equal(other in sent, false, `不應同時送 ${other}`);
      }
    });
  }

  // Node 的 AbortSignal.timeout 計時器不會讓事件迴圈保持運作（Node 22、24 實測），只剩它時 node:test 會判定測試卡住；
  // 假上游等待期間另放一個計時器撐住事件迴圈，中止時清掉（Workers 在等 fetch 時本來就讓請求存活）
  // 沒有 signal 就不撐（測試會因為卡住而失敗）；每條測試結束後清掉剩下的，不讓它留著讓行程結束不了
  const keepAlives = new Set();
  afterEach(() => { for (const t of keepAlives) clearInterval(t); keepAlives.clear(); });
  const untilAbort = (signal, onAbort) => {
    if (!signal) return;
    const keepAlive = setInterval(() => {}, 1000); keepAlives.add(keepAlive);
    signal.addEventListener('abort', () => { clearInterval(keepAlive); onAbort(signal.reason); });
  };
  // 假上游永遠不回應，但遵守 signal：中止時以 signal.reason 拒絕（和真的 fetch 一樣）
  const hang = (url, init) => new Promise((_, reject) => untilAbort(init.signal, reject));
  test('上游逾時：上游不回應、UPSTREAM_TIMEOUT_MS=50 時回 504', { timeout: 2000 }, async () => {
    reply = hang;
    const r = await send(request(JSON.stringify({ bundle: { scope } })), { ...ENV, UPSTREAM_TIMEOUT_MS: '50' });
    assert.equal(r.status, 504);
    assert.equal(upstream.length, 1);
  });

  test('上游逾時：上游回了 200 的標頭、回應內容卻一直不結束時，也回 504，不轉發讀到一半的內容', { timeout: 2000 }, async () => {
    reply = (url, init) => new Response(new ReadableStream({ start(c) {
      c.enqueue(new TextEncoder().encode('{"partial":'));
      untilAbort(init.signal, (reason) => c.error(reason));
    } }), { status: 200 });
    const r = await send(request(JSON.stringify({ bundle: { scope } })), { ...ENV, UPSTREAM_TIMEOUT_MS: '50' });
    assert.equal(r.status, 504);
    assert.equal((await r.text()).includes('partial'), false);
  });

  test('上游錯誤：上游回 401 時回 502，回應不含上游的回應內容', async () => {
    reply = () => new Response('{"error":"UPSTREAM-SECRET-MARKER"}', { status: 401 });
    const r = await send(request(JSON.stringify({ bundle: { scope } })));
    assert.equal(r.status, 502);
    assert.equal((await r.text()).includes('UPSTREAM-SECRET-MARKER'), false);
  });

  test('上游錯誤：呼叫上游時拋出例外就回 502，回應不含例外訊息', async () => {
    reply = () => { throw new TypeError('EXCEPTION-SECRET-MARKER'); };
    const r = await send(request(JSON.stringify({ bundle: { scope } })));
    assert.equal(r.status, 502);
    assert.equal((await r.text()).includes('EXCEPTION-SECRET-MARKER'), false);
  });

  test('上游錯誤：上游回 200 時，回應內容與上游相同', async () => {
    const content = JSON.stringify({ choices: [{ message: { content: '分析結果' } }] });
    reply = () => new Response(content, { status: 200 });
    const r = await send(request(JSON.stringify({ bundle: { scope } })));
    assert.equal(r.status, 200);
    assert.equal(await r.text(), content);
  });

  // 設定不完整或不合格：[說明, env, 回應要提到的變數]
  const without = (key) => { const env = { ...ENV }; delete env[key]; return env; };
  const BAD_CONFIG = [
    ['沒設 ALLOWED_ORIGIN', without('ALLOWED_ORIGIN'), 'ALLOWED_ORIGIN'],
    ['ALLOWED_ORIGIN 是空字串', { ...ENV, ALLOWED_ORIGIN: '' }, 'ALLOWED_ORIGIN'],
    ['沒設 MODEL', without('MODEL'), 'MODEL'],
    ['沒設 PROVIDER_API_KEY', without('PROVIDER_API_KEY'), 'PROVIDER_API_KEY'],
    ['PROVIDER=unknown 又沒有 BASE_URL', { ...ENV, PROVIDER: 'unknown' }, 'PROVIDER'],
    ['PROVIDER=toString（物件原型上的名稱）又沒有 BASE_URL', { ...ENV, PROVIDER: 'toString' }, 'PROVIDER'],
    ...['abc', '0', '-5', '1.5'].flatMap(v => [
      [`MAX_OUTPUT_TOKENS=${v}`, { ...ENV, MAX_OUTPUT_TOKENS: v }, 'MAX_OUTPUT_TOKENS'],
      [`UPSTREAM_TIMEOUT_MS=${v}`, { ...ENV, UPSTREAM_TIMEOUT_MS: v }, 'UPSTREAM_TIMEOUT_MS']
    ]),
    // 計時器上限是 2^31-1 毫秒，超過時 Node 會改成 1 毫秒（實測），每次都會立刻逾時
    ['UPSTREAM_TIMEOUT_MS=2147483648（超過計時器上限）', { ...ENV, UPSTREAM_TIMEOUT_MS: '2147483648' }, 'UPSTREAM_TIMEOUT_MS']
  ];
  for (const [name, env, key] of BAD_CONFIG) {
    test(`設定不完整：${name} 時，POST 與 OPTIONS 都回 500 並說明 ${key}，不呼叫上游`, async () => {
      for (const method of ['POST', 'OPTIONS']) {
        // 來源故意用不符的：設定不完整要先拒絕，不能因為沒設 ALLOWED_ORIGIN 就放行
        const r = await send(request(method === 'POST' ? JSON.stringify({ bundle: { scope } }) : null, { origin: 'https://evil.example' }, method), env);
        assert.equal(r.status, 500, method);
        assert.ok((await r.text()).includes(key), method);
      }
      assert.equal(upstream.length, 0);
    });
  }

  test('來源檢查：設定完整、origin 不等於 ALLOWED_ORIGIN 時回 403，不呼叫上游', async () => {
    const r = await send(request(JSON.stringify({ bundle: { scope } }), { origin: 'https://evil.example' }));
    assert.equal(r.status, 403);
    assert.equal(upstream.length, 0);
  });

  test('設定完整：PROVIDER 不在預設清單、但有 BASE_URL 時照常送往 BASE_URL', async () => {
    const r = await send(request(JSON.stringify({ bundle: { scope } })), { ...ENV, PROVIDER: 'custom', BASE_URL: 'https://llm.example/v1' });
    assert.equal(r.status, 200);
    assert.equal(upstream[0][0], 'https://llm.example/v1/chat/completions');
  });

  test('設定完整：UPSTREAM_TIMEOUT_MS 剛好 2147483647（計時器上限）時照常送往上游', async () => {
    const r = await send(request(JSON.stringify({ bundle: { scope } })), { ...ENV, UPSTREAM_TIMEOUT_MS: '2147483647' });
    assert.equal(r.status, 200);
    assert.equal(upstream.length, 1);
  });

  test('設定完整：選用的數值是空字串時等於沒設定，用預設值', async () => {
    const r = await send(request(JSON.stringify({ bundle: { scope } })), { ...ENV, MAX_OUTPUT_TOKENS: '', UPSTREAM_TIMEOUT_MS: '' });
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(upstream[0][1].body).max_completion_tokens, 8000);
  });
});
