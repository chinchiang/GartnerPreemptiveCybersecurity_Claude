// backend-proxy.test.mjs — 選用後端代理的請求大小、完整的 JSON、輸出上限、上游逾時與錯誤、設定不完整時拒絕（#151）
// 以 ES module 載入 backend/worker.js，送真的 Request 給它的 fetch；上游的 globalThis.fetch 換成假的，記錄呼叫與內容。
import { test, describe, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import worker from '../backend/worker.js';

const gate = createRequire(import.meta.url)('../assets/scope-gate.js');
const DEMO = createRequire(import.meta.url)('../assets/demo.js');

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
// 第一個 ```json 區塊是資料；有分數表時後面還有第二個區塊（#230），所以用非貪婪比對
const sentText = ([, init]) => JSON.parse(init.body).messages.at(-1).content;
const sentJson = (call) => sentText(call).match(/```json\n([\s\S]*?)\n```/)[1];
const sentTable = (call) => { const m = sentText(call).match(/【腳本預先計算的曝險分數】[^\n]*\n```json\n([\s\S]*?)\n```/); return m && JSON.parse(m[1]); };
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

  // #230：網站「AI 分析」經代理送出時，也附上示範引擎依授權範圍篩選後的資料算好的分數表，跟 API 腳本相同
  const SYNTHETIC = (() => {
    const ctx = { window: {} };
    vm.runInNewContext(readFileSync(new URL('../data/case.js', import.meta.url), 'utf8'), ctx);
    const { threatIntel, ...rest } = ctx.window.CASE_DATA;
    return { ...rest, threat_intel: threatIntel };
  })();

  // 預期值取自共用分數表案例（手算，CODING_STANDARDS §2），不由被測的 scoreTable 推算
  const TABLE_CASES = JSON.parse(readFileSync(new URL('../tests/fixtures/score-table-cases.json', import.meta.url), 'utf8'));

  test('分數表：送出時附上分數表，區塊跟共用案例的字面值逐字相同（#230）', async () => {
    const r = await send(request(JSON.stringify({ bundle: TABLE_CASES.cases[0].bundle })));
    assert.equal(r.status, 502); // 假的上游回 {}，不是模型回覆的形狀，代理回 output_unparseable（#247）；這裡主要看送出的內容
    assert.equal(JSON.parse(await r.text()).error, 'output_unparseable');
    assert.deepEqual(sentTable(upstream[0]), TABLE_CASES.cases[0].expected);
    assert.ok(sentText(upstream[0]).endsWith(`\n\n${TABLE_CASES.section}`), '區塊格式跟 API 腳本相同');
    assert.deepEqual(JSON.parse(sentJson(upstream[0])), gate.scopedBundle(TABLE_CASES.cases[0].bundle), '第一個區塊仍是篩選後的資料');
  });

  test('分數表：合成資料的 F001 是 P1／86（示範快照 examples/demo-snapshot.txt，#230）', async () => {
    const r = await send(request(JSON.stringify({ bundle: SYNTHETIC })));
    assert.equal(r.status, 502); // 假的上游回 {}，不是模型回覆的形狀，代理回 output_unparseable（#247）；這裡主要看送出的內容
    assert.equal(JSON.parse(await r.text()).error, 'output_unparseable');
    const top = sentTable(upstream[0]).findings[0];
    assert.deepEqual([top.finding_id, top.priority, top.score, top.likelihood, top.impact], ['F001', 'P1', 86, 10, 8.6]);
  });

  test('分數表：只根據授權範圍篩選後的資料計算，範圍外的資產與弱點不進分數表（#230）', async () => {
    const bundle = { ...SYNTHETIC, assets: [...SYNTHETIC.assets, { ...SYNTHETIC.assets[0], asset_id: 'A99', name: 'outside' }],
      vulnerabilities: [...SYNTHETIC.vulnerabilities, { ...SYNTHETIC.vulnerabilities[0], finding_id: 'F099', asset_id: 'A99' }] };
    const r = await send(request(JSON.stringify({ bundle })));
    assert.equal(r.status, 502); // 假的上游回 {}，不是模型回覆的形狀，代理回 output_unparseable（#247）；這裡主要看送出的內容
    assert.equal(JSON.parse(await r.text()).error, 'output_unparseable');
    const ids = sentTable(upstream[0]).findings.map(f => f.finding_id);
    assert.equal(ids.length, 14);
    assert.ok(!ids.includes('F099'), 'A99 不在 in_scope_assets，F099 不能出現在分數表');
  });

  test('分數表：缺弱點時不附分數表，資料照常送出（#230）', async () => {
    const { vulnerabilities, ...bundle } = SYNTHETIC;
    const r = await send(request(JSON.stringify({ bundle })));
    assert.equal(r.status, 200);
    assert.equal(sentTable(upstream[0]), null);
    assert.ok(!sentText(upstream[0]).includes('【腳本預先計算的曝險分數】'));
  });

  test('分數表：算不出可信的分數（business_criticality 不是數字）時不附分數表，不擋送出（#230）', async () => {
    const bundle = { ...SYNTHETIC, assets: SYNTHETIC.assets.map(a => a.asset_id === 'A01' ? { ...a, business_criticality: 'high' } : a) };
    const r = await send(request(JSON.stringify({ bundle })));
    assert.equal(r.status, 200);
    assert.equal(sentTable(upstream[0]), null);
  });

  test('分數表：密集拓樸（40 個資產完全連通）2 秒內送出，附上分數表，每一項都有入口加分（#248）', async () => {
    // internet 連到每一個資產，資產之間兩兩互連，crown jewel 是 D0：每個資產都有一條直達 D0 的邊，所以每一項都是可達 crown jewel 之入口
    const ids = Array.from({ length: 40 }, (_, i) => `D${i}`);
    const bundle = {
      scope: { ...scope, authorized_scope: { ...scope.authorized_scope, in_scope_assets: ids, excluded_assets: [] } },
      assets: ids.map(id => ({ ...SYNTHETIC.assets[0], asset_id: id, name: id })),
      vulnerabilities: ids.map((id, i) => ({ ...SYNTHETIC.vulnerabilities[0], finding_id: `F${i}`, asset_id: id })),
      topology: { crown_jewels: ['D0'], edges: [
        ...ids.map(id => ({ from: 'internet', to: id, trust: 'network' })),
        ...ids.flatMap(from => ids.filter(to => to !== from).map(to => ({ from, to, trust: 'network' })))
      ] }
    };
    const started = performance.now();
    const r = await send(request(JSON.stringify({ bundle })));
    const elapsed = performance.now() - started;
    assert.equal(r.status, 502); // 假的上游回 {}，不是模型回覆的形狀，代理回 output_unparseable（#247）；這裡主要看送出的內容
    assert.equal(JSON.parse(await r.text()).error, 'output_unparseable');
    assert.ok(elapsed < 2000, `代理花了 ${Math.round(elapsed)} 毫秒`);
    const table = sentTable(upstream[0]);
    assert.equal(table.findings.length, 40);
    assert.ok(table.findings.every(f => f.factors.includes('可達 crown jewel 之入口（blast radius）')), '每一項都有入口加分');
  });

  // 模型輸出跟分數表的對照（#247）。送出的是共用分數表案例第一筆，分數表是它手算的 expected：
  // F1 P1／86、F3 P2／47.1、F4 P4／19、F2 P4／5.7。模型的回覆是報告加上最後一個 ```json 區塊。
  const AGREED = [['F1', 'P1', 86], ['F3', 'P2', 47.1], ['F4', 'P4', 19], ['F2', 'P4', 5.7]];
  const jsonBlock = (rows) => '```json\n' + JSON.stringify({ exposure_priorities: { items: rows.map(([finding_id, priority, score]) => ({ finding_id, priority, score })) } }) + '\n```';
  const report = (rows) => `## 曝險優先序\n\n報告本文。\n\n${jsonBlock(rows)}`;
  const openaiReply = (text, finish = 'stop') => JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: finish }] });
  const anthropicReply = (text, stop = 'end_turn') => JSON.stringify({ content: [{ type: 'text', text }], stop_reason: stop });
  const ANTHROPIC = { ...ENV, PROVIDER: 'anthropic' };
  const withTable = () => request(JSON.stringify({ bundle: TABLE_CASES.cases[0].bundle }));
  const rejected = async (r) => { assert.equal(r.status, 502); assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN); return JSON.parse(await r.text()); };

  test('模型輸出：priority 跟分數表不同時回 502，列出不一致的項目並附上游原文（#247）', async () => {
    const content = openaiReply(report([['F1', 'P2', 86], ...AGREED.slice(1)]));
    reply = () => new Response(content, { status: 200 });
    const body = await rejected(await send(withTable()));
    assert.deepEqual(body, { error: 'score_table_mismatch', upstream: content,
      problems: [{ index: 0, finding_id: 'F1', kind: 'mismatch', expected: { priority: 'P1', score: 86 }, got: { priority: 'P2', score: 86 } }] });
  });

  test('模型輸出：跟分數表一致時，狀態碼與內容都跟上游逐字相同（OpenAI 相容與 Anthropic，#247）', async () => {
    for (const [env, content] of [[ENV, openaiReply(report(AGREED))], [ANTHROPIC, anthropicReply(report(AGREED))]]) {
      reply = () => new Response(content, { status: 200 });
      const r = await send(withTable(), env);
      assert.equal(r.status, 200, env.PROVIDER);
      assert.equal(await r.text(), content, env.PROVIDER);
    }
  });

  test('模型輸出：Anthropic 的回覆裡 finding_id 不在分數表時回 502（#247）', async () => {
    // 文字分成兩個 text 區塊，中間夾一個不是文字的區塊：代理把 text 區塊接起來再取 JSON。
    // 最後還有一個不是 text、卻帶著 text 欄位的區塊（內容是一致的 JSON）：只接 type 是 text 的區塊，所以它不算
    const text = report([...AGREED, ['F9', 'P1', 70]]);
    const cut = text.indexOf('```json');
    const content = JSON.stringify({ content: [{ type: 'text', text: text.slice(0, cut) }, { type: 'tool_use', id: 't1', name: 'x', input: {} },
      { type: 'text', text: text.slice(cut) }, { type: 'tool_result', text: `\n\n${jsonBlock(AGREED)}` }], stop_reason: 'end_turn' });
    reply = () => new Response(content, { status: 200 });
    const body = await rejected(await send(withTable(), ANTHROPIC));
    assert.deepEqual(body, { error: 'score_table_mismatch', upstream: content,
      problems: [{ index: 4, finding_id: 'F9', kind: 'not_in_table', got: { priority: 'P1', score: 70 } }] });
  });

  test('模型輸出：回覆裡有兩個 ```json 區塊時，取最後一個（#247）', async () => {
    const wrong = [['F1', 'P3', 1], ...AGREED.slice(1)];
    // 前面的區塊不一致、最後的一致：照常轉回
    let content = openaiReply(`${jsonBlock(wrong)}\n\n${report(AGREED)}`);
    reply = () => new Response(content, { status: 200 });
    let r = await send(withTable());
    assert.equal(r.status, 200);
    assert.equal(await r.text(), content);
    // 前面的區塊一致、最後的不一致：回 502
    content = openaiReply(`${jsonBlock(AGREED)}\n\n${report(wrong)}`);
    r = await send(withTable());
    assert.equal((await rejected(r)).error, 'score_table_mismatch');
  });

  test('模型輸出：沒標語言、標大寫 JSON、結尾的 ``` 有縮排的區塊也算 JSON 區塊（#247 審查）', async () => {
    const items = JSON.stringify({ exposure_priorities: { items: AGREED.map(([finding_id, priority, score]) => ({ finding_id, priority, score })) } });
    for (const [name, text] of [['沒標語言', `報告\n\n\`\`\`\n${items}\n\`\`\``], ['大寫 JSON', `報告\n\n\`\`\`JSON\n${items}\n\`\`\``],
                                ['結尾有縮排', `報告\n\n  \`\`\`json  \n${items}\n   \`\`\`  `]]) {
      const content = openaiReply(text);
      reply = () => new Response(content, { status: 200 });
      const r = await send(withTable());
      assert.equal(r.status, 200, name);
      assert.equal(await r.text(), content, name);
    }
  });

  test('模型輸出：標別的語言的區塊不算 JSON 區塊，JSON 區塊後面接 ```text 也照樣取到 JSON（#247 審查）', async () => {
    // 不一致的 JSON 區塊後面接一個 ```text 區塊：取到的是 JSON 區塊，回 502 的 score_table_mismatch（不是 output_unparseable）
    const content = openaiReply(`${report([['F1', 'P3', 1], ...AGREED.slice(1)])}\n\n\`\`\`text\n本分析由語言模型整理。\n\`\`\``);
    reply = () => new Response(content, { status: 200 });
    assert.equal((await rejected(await send(withTable()))).error, 'score_table_mismatch');
  });

  test('模型輸出：取不到文字、找不到或解析不了 JSON 時回 502 的 output_unparseable，不放行（#247）', async () => {
    const cases = [
      ['上游回應不是 JSON', ENV, '分析結果'],
      ['沒有 choices', ENV, JSON.stringify({ id: 'x' })],
      ['message.content 不是字串', ENV, JSON.stringify({ choices: [{ message: { content: null }, finish_reason: 'stop' }] })],
      ['沒有 ```json 區塊', ENV, openaiReply('## 報告\n\n只有本文，沒有 JSON。')],
      ['```json 區塊解析不了', ENV, openaiReply('## 報告\n\n```json\n{ "exposure_priorities": \n```')],
      ['Anthropic 沒有 text 區塊', ANTHROPIC, JSON.stringify({ content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} }], stop_reason: 'end_turn' })]
    ];
    for (const [name, env, content] of cases) {
      reply = () => new Response(content, { status: 200 });
      assert.deepEqual(await rejected(await send(withTable(), env)), { error: 'output_unparseable', upstream: content }, name);
    }
  });

  test('模型輸出：回覆被輸出上限截斷時回 502 的 output_incomplete，不拿截斷的內容對照（#247）', async () => {
    // JSON 區塊本身一致，但結束原因代表回覆不完整；清單跟 Python 核心的 require_complete 相同（#247 審查）
    const cases = [[ENV, openaiReply(report(AGREED), 'length')], [ENV, openaiReply(report(AGREED), 'content_filter')],
      [ANTHROPIC, anthropicReply(report(AGREED), 'max_tokens')], [ANTHROPIC, anthropicReply(report(AGREED), 'model_context_window_exceeded')],
      [ANTHROPIC, anthropicReply(report(AGREED), 'refusal')]];
    for (const [env, content] of cases) {
      reply = () => new Response(content, { status: 200 });
      assert.deepEqual(await rejected(await send(withTable(), env)), { error: 'output_incomplete', upstream: content }, `${env.PROVIDER} ${content.slice(-40)}`);
    }
  });

  test('模型輸出：沒附分數表（缺弱點）時不檢查，上游的回應照常轉回（#247）', async () => {
    const { vulnerabilities, ...bundle } = SYNTHETIC;
    const content = openaiReply('## 報告\n\n沒有 JSON 區塊。');
    reply = () => new Response(content, { status: 200 });
    const r = await send(request(JSON.stringify({ bundle })));
    assert.equal(r.status, 200);
    assert.equal(await r.text(), content);
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
