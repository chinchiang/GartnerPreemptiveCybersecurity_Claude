// summary-length.test.mjs — 管理摘要在網站可調的每一種參數組合下都 ≤ 300 字（稽核 4，#149）。
// 窮舉示範頁的 7 個輸入開關 × 清冊完整度 30–100%（滑桿 8 格）× 3 種風險胃納，再乘上是否遮罩識別資訊。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const demo = createRequire(import.meta.url)('../assets/demo.js');
const ctx = { window: {} }; vm.runInNewContext(readFileSync(new URL('../data/case.js', import.meta.url), 'utf8'), ctx);

test('每一種參數組合：摘要正文 ≤ 300 字，且保留決策請求、限制與「所有路徑為假設」', () => {
  const keys = Object.keys(demo.DEFAULTS.inputs);
  let combos = 0, compacted = 0;
  for (const mask of [true, false]) {
    const data = structuredClone(ctx.window.CASE_DATA);
    data.scope.reporting.mask_identifiers = mask;
    for (let m = 0; m < 2 ** keys.length; m++) for (const inventoryCompleteness of [30, 40, 50, 60, 70, 80, 90, 100]) for (const riskAppetite of ['strict', 'balanced', 'tolerant']) {
      const inputs = Object.fromEntries(keys.map((k, i) => [k, Boolean(m >> i & 1)]));
      const { summary } = demo.analyze(data, { inputs, inventoryCompleteness, riskAppetite });
      const where = JSON.stringify({ mask, inputs, inventoryCompleteness, riskAppetite });
      assert.ok(summary.length <= 300, `${summary.length} 字：${where}`);
      assert.equal(summary.length, [...summary.text].length, where);
      for (const kept of ['決策請求', '限制', '所有路徑為假設']) assert.ok(summary.text.includes(kept), `缺「${kept}」：${where}`);
      combos++; if (summary.compaction > 0) compacted++;
    }
  }
  assert.equal(combos, 6144);
  assert.ok(compacted > 0, '至少有組合需要精簡，否則這個測試沒有測到精簡邏輯');
});

test('預設參數不精簡：基準案例的摘要與示範快照逐字相同', () => {
  const { summary } = demo.analyze(ctx.window.CASE_DATA);
  assert.equal(summary.compaction, 0);
  assert.ok(readFileSync(new URL('../examples/demo-snapshot.txt', import.meta.url), 'utf8').includes(summary.text));
});
