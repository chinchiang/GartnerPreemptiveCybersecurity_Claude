// scope-cases.test.mjs — 授權範圍守門的共用案例套在示範引擎與選用後端代理上，另檢查後端代理的供應商路由
// 授權範圍守門的共用案例（tests/fixtures/scope-cases.json）套在網站示範引擎與選用後端代理（backend/worker.js）上：
// 兩者都委派給 assets/scope-gate.js（規則只來自 schema，見 docs/adr/0004）；Python 那邊（tests/python/test_scope_gate.py）用同一份案例。
// worker 送真的 Request 給它的 fetch，只看回應與有沒有往上游送請求；上游的 globalThis.fetch 換成假的。
// 另有一支看供應商路由：PROVIDER=gemini 時送到哪個網址、帶什麼金鑰與模型。
import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import worker from '../backend/worker.js';

const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');
const base = JSON.parse(readFileSync(new URL('../examples/synthetic-org/scope.json', import.meta.url), 'utf8'));
const { cases } = JSON.parse(readFileSync(new URL('../tests/fixtures/scope-cases.json', import.meta.url), 'utf8'));

// 依案例的 set／remove 修改一份合成資料 scope 的深拷貝
function applyCase(scope, { set = {}, remove = [] }) {
  const s = structuredClone(scope);
  const walk = (path) => { const keys = path.split('.'); const last = keys.pop(); let node = s; for (const k of keys) { if (typeof node[k] !== 'object' || node[k] === null) node[k] = {}; node = node[k]; } return [node, last]; };
  for (const [path, value] of Object.entries(set)) { const [node, k] = walk(path); node[k] = value; }
  for (const path of remove) { const [node, k] = walk(path); delete node[k]; }
  return s;
}

for (const c of cases) {
  test(`示範引擎守門：${c.name}`, () => {
    assert.deepEqual(DEMO.scopeProblems(applyCase(base, c)), c.problems);
  });
}

test('示範引擎守門：必填欄位有填但不合格時拒絕分析，reason 說明缺少或不合格', () => {
  const R = DEMO.analyze({ scope: { ...base, analysis_date: '2026-02-30' } });
  assert.equal(R.refused, true);
  assert.equal(R.reason, '缺少授權範圍（scope），或必要欄位缺少或不合格，無授權範圍不得分析。');
  assert.deepEqual(R.problemFields, ['analysis_date']);
});

let upstreamRequests = []; // 假的上游收到的 [網址, fetch 的第二個參數]
let ip = 0; // worker 每個 IP 每分鐘只放行 5 次，每個請求用不同的 IP
const analyze = (scope, target = worker, env = {}) => target.fetch(new Request('https://worker.example/api/analyze', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': `203.0.113.${++ip}` },
  body: JSON.stringify({ bundle: { scope } })
}), { PROVIDER: 'openai', MODEL: 'test-model', PROVIDER_API_KEY: 'test-key', ...env });

describe('後端代理（backend/worker.js）', () => {
  const realFetch = globalThis.fetch;
  before(() => { globalThis.fetch = async (url, init) => { upstreamRequests.push([url, init]); return new Response('{}', { status: 200 }); }; });
  after(() => { globalThis.fetch = realFetch; });
  afterEach(() => { upstreamRequests = []; });

  test('後端代理：PROVIDER=gemini 送到 Gemini 的 OpenAI 相容端點（chat/completions），帶 Bearer 金鑰與 MODEL', async () => {
    const r = await analyze(base, worker, { PROVIDER: 'gemini', MODEL: 'gemini-3.8-flash', PROVIDER_API_KEY: 'gemini-key' });
    assert.equal(r.status, 200);
    assert.equal(upstreamRequests.length, 1);
    const [url, init] = upstreamRequests[0];
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    assert.equal(init.headers.authorization, 'Bearer gemini-key');
    assert.equal(JSON.parse(init.body).model, 'gemini-3.8-flash');
  });

  test('後端代理守門：建置出的部署用 Worker（scope-gate.js 已內嵌）對空物件 scope 回 400，不往上游送請求', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pea-worker-'));
    try {
      const built = join(dir, 'worker.mjs');
      execFileSync(process.execPath, [fileURLToPath(new URL('./build-worker.mjs', import.meta.url)), built], { stdio: 'pipe' });
      const { default: deployed } = await import(pathToFileURL(built).href);
      const r = await analyze({}, deployed);
      assert.equal(r.status, 400);
      assert.equal(upstreamRequests.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('後端代理守門：scope 是空物件時回 400，不往上游送請求', async () => {
    const r = await analyze({});
    assert.equal(r.status, 400);
    assert.equal(upstreamRequests.length, 0);
  });

  for (const c of cases) {
    test(`後端代理守門：${c.name}`, async () => {
      const r = await analyze(applyCase(base, c));
      if (c.problems.length === 0) {
        assert.equal(r.status, 200);
        assert.equal(upstreamRequests.length, 1);
        return;
      }
      assert.equal(r.status, 400);
      assert.equal(upstreamRequests.length, 0);
      assert.equal(await r.text(), `缺少 scope 或必填欄位不合格：${c.problems.join('、')}；無授權範圍不得分析`);
    });
  }
});
