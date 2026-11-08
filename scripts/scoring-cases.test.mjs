// scoring-cases.test.mjs — 評分的共用案例：示範引擎 analyze() 這一份（#228、ADR 0010）
// Python 分析工作流程核心的評分函式讀同一份 tests/fixtures/scoring-cases.json（tests/python/test_scoring.py），
// 兩份實作只改一份時，其中一邊會失敗。預期值是手算的，見 fixture 的 why。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');
const FIXTURE = JSON.parse(readFileSync(new URL('../tests/fixtures/scoring-cases.json', import.meta.url), 'utf8'));
// 取一位小數的共用案例（#260）：Python 那一份在 tests/python/test_scoring.py
const ROUND1 = JSON.parse(readFileSync(new URL('../tests/fixtures/round1-cases.json', import.meta.url), 'utf8'));
const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}：${actual} 不是 ${expected}`);

for (const c of FIXTURE.cases) {
  test(`共用評分案例（示範引擎）：${c.name}`, () => {
    // data：選用，覆蓋 baseData 的某幾個鍵（例如形狀不對的輸入，#237）
    const result = DEMO.analyze(structuredClone({ ...FIXTURE.baseData, ...c.data }), { inputs: c.inputs });
    assert.equal(result.refused, undefined, '授權範圍守門不應該擋下共用案例');
    assert.deepEqual(result.findings.map(f => f.finding_id), c.expected.map(e => e.finding_id), '依分數由高到低排列');
    for (const [i, e] of c.expected.entries()) {
      const f = result.findings[i];
      near(f.likelihood, e.likelihood, `${e.finding_id} 可能性`);
      near(f.impact, e.impact, `${e.finding_id} 影響`);
      assert.equal(f.score, e.score, `${e.finding_id} 分數`);
      assert.equal(f.priority, e.priority, `${e.finding_id} 分級`);
      assert.deepEqual(f.factors, e.factors, `${e.finding_id} 依據`);
    }
  });
}

test('取一位小數：十進位四捨五入、.x5 進位，浮點誤差造成的 .x4999… 當成 .x5（共用案例，#260）', () => {
  for (const c of ROUND1.cases) assert.equal(DEMO.round1(c.value), c.expected, `${c.value}（${c.from}）`);
});

test('顯示用的一位小數：照取一位小數的共用案例，再補成一位小數的字串（1.0499… 顯示 1.1，整數補 .0；#260）', () => {
  for (const c of ROUND1.cases) assert.equal(DEMO.format1(c.value), c.expected.toFixed(1), `${c.value}（${c.from}）`);
});

test('補償控制：control 的 gaps 不是陣列時不出錯，缺口寫成空的（#243；評分的共用案例只比對 findings，補償控制只有示範引擎有）', () => {
  const controls = { controls: [
    { name: 'SIEM', coverage_assets: [], gaps: 'A03', maturity: 'partial', notes: '字串的 gaps' },
    { name: 'EDR', coverage_assets: [], gaps: ['A03'], maturity: 'none', notes: '正常' }
  ] };
  const result = DEMO.analyze(structuredClone({ ...FIXTURE.baseData, controls }), {});
  assert.deepEqual(result.compensating.map(c => [c.control, c.gaps]), [['SIEM', ''], ['EDR', 'app']]);
});
