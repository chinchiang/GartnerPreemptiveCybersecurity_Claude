// 授權範圍守門的共用案例（tests/fixtures/scope-cases.json）套在網站示範引擎與選用後端代理（backend/worker.js）上：
// demo.js 的 scopeProblems 是判定基準，Python 那邊（tests/python/test_scope_gate.py）用同一份案例。
// worker 送真的 Request 給它的 fetch，只看回應與有沒有往上游送請求；上游的 globalThis.fetch 換成假的。
import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

let upstreamCalls = 0;
let ip = 0; // worker 每個 IP 每分鐘只放行 5 次，每個請求用不同的 IP
const analyze = (scope) => worker.fetch(new Request('https://worker.example/api/analyze', {
  method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': `203.0.113.${++ip}` },
  body: JSON.stringify({ bundle: { scope } })
}), { PROVIDER: 'openai', MODEL: 'test-model', PROVIDER_API_KEY: 'test-key' });

describe('後端代理（backend/worker.js）', () => {
  const realFetch = globalThis.fetch;
  before(() => { globalThis.fetch = async () => { upstreamCalls += 1; return new Response('{}', { status: 200 }); }; });
  after(() => { globalThis.fetch = realFetch; });
  afterEach(() => { upstreamCalls = 0; });

  test('後端代理守門：scope 是空物件時回 400，不往上游送請求', async () => {
    const r = await analyze({});
    assert.equal(r.status, 400);
    assert.equal(upstreamCalls, 0);
  });

  for (const c of cases) {
    test(`後端代理守門：${c.name}`, async () => {
      const r = await analyze(applyCase(base, c));
      if (c.problems.length === 0) {
        assert.equal(r.status, 200);
        assert.equal(upstreamCalls, 1);
        return;
      }
      assert.equal(r.status, 400);
      assert.equal(upstreamCalls, 0);
      assert.equal(await r.text(), `缺少 scope 或必填欄位：${c.problems.join('、')}；無授權範圍不得分析`);
    });
  }
});
