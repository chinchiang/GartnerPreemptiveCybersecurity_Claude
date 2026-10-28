// scoped-bundle.test.mjs — 授權資料篩選的跨語言共用邊界案例與後端送出檢查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import worker from '../backend/worker.js';
const gate = createRequire(import.meta.url)('../assets/scope-gate.js');
const cases = JSON.parse(readFileSync(new URL('../tests/fixtures/scoped-bundle-cases.json', import.meta.url)));
test('JS 與 Python 共用篩選案例：形狀、空值、關聯、缺漏與不修改輸入', () => {
  for (const c of cases) {
    const original = structuredClone(c.bundle);
    assert.deepEqual(gate.scopedBundle(c.bundle), c.expected, c.name);
    assert.deepEqual(c.bundle, original, c.name);
  }
});
test('後端實際送出的每份 bundle 都符合共用案例，不傳出不合格形狀的原文', async () => {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../data/case.js', import.meta.url), 'utf8'), ctx);
  const scope = structuredClone(ctx.window.CASE_DATA.scope);
  scope.authorized_scope.in_scope_assets = ['A01'];
  const originalFetch = globalThis.fetch;
  try {
    for (const [i, c] of cases.entries()) {
      let sent;
      globalThis.fetch = async (url, options) => {
        const content = JSON.parse(options.body).messages[1].content;
        sent = JSON.parse(content.match(/```json\n([\s\S]*)\n```/)[1]);
        return new Response('{}');
      };
      const response = await worker.fetch(new Request('https://test.invalid/api/analyze', {
        method: 'POST', headers: { origin: 'https://allowed.invalid', 'cf-connecting-ip': `192.0.2.${i + 1}` },
        body: JSON.stringify({ bundle: { ...c.bundle, scope } })
      }), { ALLOWED_ORIGIN: 'https://allowed.invalid', MODEL: 'fake', PROVIDER_API_KEY: 'fake' });
      assert.equal(response.status, 200, c.name);
      assert.deepEqual(sent, { ...c.expected, scope }, c.name);
    }
  } finally { globalThis.fetch = originalFetch; }
});
