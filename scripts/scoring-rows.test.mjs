// scoring-rows.test.mjs — 評分入口的正規化（#262）：示範引擎 scoringRows 這一份
// Python 核心的 scoring_rows 讀同一份 tests/fixtures/scoring-rows-cases.json（tests/python/test_scoring_rows.py），
// 兩份實作只改一份時，其中一邊會失敗。預期值是手寫的，規則見 fixture 的 description。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');
const FIXTURE = JSON.parse(readFileSync(new URL('../tests/fixtures/scoring-rows-cases.json', import.meta.url), 'utf8'));

for (const c of FIXTURE.cases) {
  test(`共用正規化案例（示範引擎）：${c.name}`, () => {
    const data = structuredClone(c.data);
    assert.deepEqual(DEMO.scoringRows(data), c.expected);
    assert.deepEqual(data, c.data, '不修改輸入');
  });
}

test('形狀表的鍵＝輸入 schema 頂層 properties 去掉 scope（threat_intel 換成 threatIntel）：新的輸入類別沒補進形狀表就失敗', () => {
  const schema = JSON.parse(readFileSync(new URL('../skills/shared/input-schema.json', import.meta.url), 'utf8'));
  const expected = Object.keys(schema.properties).filter(k => k !== 'scope').map(k => k === 'threat_intel' ? 'threatIntel' : k);
  assert.deepEqual(Object.keys(DEMO.ROW_SHAPES).sort(), expected.sort());
});

test('報告輸出讀正規化過的清單：資產與 EASM 清單混有 null 時 toSchema 不出錯，除了檔案筆數，整份輸出跟乾淨資料相同', () => {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../data/case.js', import.meta.url), 'utf8'), ctx);
  const clean = structuredClone(ctx.window.CASE_DATA); // 兩份都在同一個 realm，deepEqual 才不會因 prototype 不同而失敗
  const dirty = structuredClone(clean);
  dirty.assets = [null, ...dirty.assets];
  dirty.exposures.exposures = [null, ...dirty.exposures.exposures];
  const want = DEMO.toSchema(DEMO.analyze(clean, {}), clean);
  const got = DEMO.toSchema(DEMO.analyze(dirty, {}), dirty);
  assert.ok(want.attack_path_hypotheses.items.length > 0, '合成資料要有路徑假設，比對才有意義');
  assert.ok(want.data_quality.files.find(f => f.name === 'exposures.json').anomalies.length > 0, '合成資料要有未納入清冊的對外資產，比對才有意義');
  // 檔案筆數（recordCount）照舊讀原始清單，多出的 null 算一筆：assets.csv 與 exposures.json 各多 1，其餘不變
  const count = (out, name) => out.data_quality.files.find(f => f.name === name).records;
  assert.equal(count(got, 'assets.csv'), count(want, 'assets.csv') + 1);
  assert.equal(count(got, 'exposures.json'), count(want, 'exposures.json') + 1);
  const withoutRecords = (out) => ({ ...out, data_quality: { ...out.data_quality, files: out.data_quality.files.map(({ records, ...rest }) => rest) } });
  assert.deepEqual(withoutRecords(got), withoutRecords(want));
});
