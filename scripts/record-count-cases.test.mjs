// record-count-cases.test.mjs — 檔案筆數的共用案例：示範引擎 recordCount 這一份（#238），另檢查 toSchema 用的是它
// Python 分析工作流程核心的 count_records 讀同一份 tests/fixtures/record-count-cases.json（tests/python/test_record_counts.py），
// 兩份實作只改一份時，其中一邊會失敗。預期值是手數的。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');
const FIXTURE = JSON.parse(readFileSync(new URL('../tests/fixtures/record-count-cases.json', import.meta.url), 'utf8'));

for (const c of FIXTURE.cases) {
  test(`共用筆數案例（示範引擎）：${c.name}`, () => {
    assert.equal(DEMO.recordCount(c.file, structuredClone(c.data)), c.expected);
  });
}

const CASE = (() => { const ctx = { window: {} }; vm.runInNewContext(readFileSync(new URL('../data/case.js', import.meta.url), 'utf8'), ctx); return ctx.window.CASE_DATA; })();
const schemaOf = (data) => DEMO.toSchema(DEMO.analyze(structuredClone(data), {}), data);
const fileOf = (schema, name) => schema.data_quality.files.find(f => f.name === name);
const unlistedMetric = (schema) => schema.metrics.items.find(m => m.name === '未納入清冊的對外資產').value;

test('toSchema 的 data_quality.files 用 recordCount：actors 是字串時 threat-intel.json 寫 0，不是字串長度 7', () => {
  assert.equal(fileOf(schemaOf({ ...CASE, threatIntel: { ...CASE.threatIntel, actors: 'GROUP-A' } }), 'threat-intel.json').records, 0);
});

test('toSchema：exposures 是字串時 exposures.json 寫 0 筆、沒有未納入清冊的對外資產（controls、topology 的清單不是陣列時 analyze 會先出錯，只能由共用案例守）', () => {
  const schema = schemaOf({ ...CASE, exposures: { ...CASE.exposures, exposures: 'abc' } });
  assert.equal(fileOf(schema, 'exposures.json').records, 0);
  assert.equal(unlistedMetric(schema), 0);
});

test('exposures 清單裡的 null 與陣列不算成未納入清冊的對外資產（#238、#241）：指標與資料品質的異常都只算合成資料原本那一筆', () => {
  const schema = schemaOf({ ...CASE, exposures: { ...CASE.exposures, exposures: [null, [], ...CASE.exposures.exposures] } });
  assert.equal(unlistedMetric(schema), 1);
  assert.deepEqual(fileOf(schema, 'exposures.json').anomalies, ['old-test.northwind-synthetic.example（asset_id null）未納入清冊']);
});

test('asset_id 是空字串的項目不算未納入清冊的對外資產，跟 Python 與授權範圍守門一致（#241、ADR 0009）', () => {
  const blank = { asset_id: '', hostname: 'blank.example', issues: ['outdated-cms'] };
  const schema = schemaOf({ ...CASE, exposures: { ...CASE.exposures, exposures: [blank, ...CASE.exposures.exposures] } });
  assert.equal(unlistedMetric(schema), 1);
  assert.deepEqual(fileOf(schema, 'exposures.json').anomalies, ['old-test.northwind-synthetic.example（asset_id null）未納入清冊']);
});
