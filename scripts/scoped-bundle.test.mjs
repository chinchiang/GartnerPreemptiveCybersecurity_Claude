// scoped-bundle.test.mjs — 授權資料篩選的跨語言共用邊界案例與後端送出檢查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import worker from '../backend/worker.js';
const gate = createRequire(import.meta.url)('../assets/scope-gate.js');
const cases = JSON.parse(readFileSync(new URL('../tests/fixtures/scoped-bundle-cases.json', import.meta.url)));
test('JS 與 Python 共用篩選案例：形狀、空值、關聯、缺漏、未知頂層鍵、排除清單格式與不修改輸入', () => {
  for (const c of cases) {
    const original = structuredClone(c.bundle);
    assert.deepEqual(gate.scopedBundle(c.bundle), c.expected, c.name);
    assert.deepEqual(gate.excludedAssetsProblems(c.bundle.scope.authorized_scope), c.excludedAssetsProblems ?? [], c.name);
    assert.deepEqual(c.bundle, original, c.name);
  }
});

test('送往模型的類別＝輸入 schema 頂層 properties 的鍵（INPUT_CATEGORIES 是它的複本，#164）', () => {
  const schema = JSON.parse(readFileSync(new URL('../skills/shared/input-schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(gate.INPUT_CATEGORIES, Object.keys(schema.properties));
});

test('excluded_assets 的規則說明由嵌入的 schema 定義產生（後端代理拒絕的訊息用它）', () => {
  assert.equal(gate.excludedAssetsRuleNote(), '須為陣列，且每項為非空白字串');
});
test('後端實際送出的每份 bundle 都符合共用案例，不傳出不合格形狀的原文', async () => {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../data/case.js', import.meta.url), 'utf8'), ctx);
  const scope = structuredClone(ctx.window.CASE_DATA.scope);
  scope.authorized_scope.in_scope_assets = ['A01'];
  const originalFetch = globalThis.fetch;
  try {
    for (const [i, c] of cases.entries()) {
      // 合格的完整 scope 疊上案例自己的授權清單（in_scope_assets、excluded_assets、excluded），排除清單的案例才會真的經過後端
      const caseScope = { ...scope, authorized_scope: { ...scope.authorized_scope, ...c.bundle.scope.authorized_scope } };
      let sent;
      globalThis.fetch = async (url, options) => {
        const content = JSON.parse(options.body).messages[1].content;
        // 第一個 ```json 區塊是資料；有分數表時後面還有第二個區塊（#230），所以用非貪婪比對
        sent = JSON.parse(content.match(/```json\n([\s\S]*?)\n```/)[1]);
        return new Response('{}');
      };
      const response = await worker.fetch(new Request('https://test.invalid/api/analyze', {
        method: 'POST', headers: { origin: 'https://allowed.invalid', 'cf-connecting-ip': `192.0.2.${i + 1}` },
        body: JSON.stringify({ bundle: { ...c.bundle, scope: caseScope } })
      }), { ALLOWED_ORIGIN: 'https://allowed.invalid', MODEL: 'fake', PROVIDER_API_KEY: 'fake' });
      if ((c.excludedAssetsProblems ?? []).length) {
        // 排除清單格式不合格：回 400、訊息寫明 excluded_assets 的規則，不呼叫上游（#164）
        assert.equal(response.status, 400, c.name);
        assert.equal(await response.text(), 'excluded_assets 格式不合格（須為陣列，且每項為非空白字串）；格式不符時排除不會生效，為避免把要排除的資產送往模型，不送出', c.name);
        assert.equal(sent, undefined, `${c.name}：上游被呼叫了`);
      } else {
        // 重點是送往上游的內容。附了分數表時，假的上游回 {} 不是模型回覆的形狀，代理回 502 的 output_unparseable（#247）；
        // 沒附分數表（缺資產清冊或弱點）時照常轉回 200
        if (response.status === 502) assert.equal(JSON.parse(await response.text()).error, 'output_unparseable', c.name);
        else assert.equal(response.status, 200, c.name);
        assert.deepEqual(sent, { ...c.expected, scope: caseScope }, c.name);
      }
    }
  } finally { globalThis.fetch = originalFetch; }
});
