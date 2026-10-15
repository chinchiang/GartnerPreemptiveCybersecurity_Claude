// 評分規則一致性：示範引擎匯出的規則資料是規則數值的唯一可讀來源，
// scripts/scoring-rules.mjs 的一致性檢查從母本抽出數值和它比對（見 issue #39）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { scoringRuleDrift, DOCUMENTS } from './scoring-rules.mjs';

const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');

const deepFrozen = (o) => Object.isFrozen(o) && Object.values(o).every(v => typeof v !== 'object' || v === null || deepFrozen(v));

test('示範引擎匯出唯讀的規則資料，涵蓋可能性、身分弱點、影響、門檻、路徑可行性、信心與預設權重', () => {
  const R = DEMO.RULES;
  assert.ok(R, '示範引擎沒有匯出 RULES');
  assert.deepEqual(Object.keys(R).sort(), ['confidence', 'feasibility', 'identityIssue', 'impact', 'likelihood', 'thresholds', 'weights']);
  assert.ok(deepFrozen(R), 'RULES 必須整份唯讀');
  // 已知正確值：與母本目前陳述的示範規則相同
  assert.deepEqual(R.thresholds, { strict: [50, 30, 15], balanced: [60, 40, 20], tolerant: [70, 50, 25] });
  assert.equal(R.feasibility.unknownNode, 3);
  assert.equal(R.feasibility.maxHops, 5);
  assert.deepEqual(R.impact.dataWeight, { Restricted: 3, Confidential: 2, Internal: 1, Public: 0 });
  assert.deepEqual(R.likelihood.intel, { high: 2, medium: 1.5, low: 1 });
  assert.deepEqual(R.confidence, { lowMissing: 3, inventoryThreshold: 80 });
});

test('示範頁的預設參數取自規則資料：權重與門檻相同', () => {
  assert.deepEqual(DEMO.DEFAULTS.weights, DEMO.RULES.weights);
  assert.deepEqual(DEMO.THRESHOLDS, DEMO.RULES.thresholds);
  assert.ok(!Object.isFrozen(DEMO.DEFAULTS.weights), '網站會複製 DEFAULTS 再讓使用者調整，預設權重本身不必凍結，但不能直接是 RULES 的物件');
  assert.notEqual(DEMO.DEFAULTS.weights, DEMO.RULES.weights);
});

// ---------------------------------------------------------------------------
// 一致性檢查：輸入文件（路徑與內容），回傳漂移清單
// ---------------------------------------------------------------------------
const ROOT = new URL('../', import.meta.url);
const repoDocs = () => DOCUMENTS.map(d => ({ path: d.path, content: readFileSync(new URL(d.path, ROOT), 'utf8').replace(/\r\n/g, '\n') }));
// 在記憶體中改一份文件：old 必須恰好出現一次，免得測試改錯地方
const withEdit = (docs, path, old, replacement) => docs.map(d => {
  if (d.path !== path) return d;
  assert.equal(d.content.split(old).length - 1, 1, `${path} 裡「${old}」必須恰好出現一次`);
  return { ...d, content: d.content.replace(old, replacement) };
});
const summary = (drift) => drift.map(d => `${d.path}｜${d.rule}`);

test('repo 現有的母本與規則資料一致：沒有漂移', () => {
  assert.deepEqual(scoringRuleDrift(repoDocs()), []);
});

test('核心提示詞的係數被改掉時，回報文件、規則、預期值與實際值', () => {
  const drift = scoringRuleDrift(withEdit(repoDocs(), 'skills/shared/core-prompt.md', '設定偏差數·0.75', '設定偏差數·0.7'));
  assert.deepEqual(summary(drift), ['skills/shared/core-prompt.md｜可能性']);
  assert.ok(drift[0].expected.includes(0.75) && !drift[0].expected.includes(0.7));
  assert.ok(drift[0].actual.includes(0.7) && !drift[0].actual.includes(0.75));
});

test('共用任務規格附錄 A 與信心規則的數值被改掉時，各自回報', () => {
  const T = 'skills/shared/task-spec.md';
  const cases = [
    ['tolerant → 70/50/25', 'tolerant → 70/55/25', '分數門檻'],
    ['完全無發現的節點取 3（未知）', '完全無發現的節點取 2（未知）', '無發現節點取值'],
    ['或資產清冊完整度 < 80% → 低（topology', '或資產清冊完整度 < 70% → 低（topology', '信心'],
    ['− min(2, controls·0.6)·0.8', '− min(2, controls·0.5)·0.8', '可能性']
  ];
  for (const [old, replacement, rule] of cases) {
    assert.deepEqual(summary(scoringRuleDrift(withEdit(repoDocs(), T, old, replacement))), [`${T}｜${rule}`], old);
  }
});

test('示範評分規則的表格列與公式被改掉時，回報對應的規則', () => {
  const S = 'skills/shared/scoring-rules.md';
  const cases = [
    ['| +0.8 × min(1.5, 數量 × 0.4) |', '| +0.8 × min(1.5, 數量 × 0.45) |', '可能性：控制缺口'],
    ['+2（行為者 confidence high）', '+2.5（行為者 confidence high）', '可能性：威脅情資'],
    ['或 > 90 天未登入', '或 > 60 天未登入', '可能性：身分弱點'],
    ['| 寬鬆 | ≥ 70 | ≥ 50 | ≥ 25 |', '| 寬鬆 | ≥ 70 | ≥ 50 | ≥ 30 |', '分數門檻：寬鬆'],
    ['Restricted 3、Confidential 2', 'Restricted 4、Confidential 2', '影響'],
    ['− (hops − 1) × 0.6, 0, 10)', '− (hops − 1) × 0.5, 0, 10)', '路徑可行性'],
    ['最多 5 跳', '最多 6 跳', '最大跳數']
  ];
  for (const [old, replacement, rule] of cases) {
    assert.deepEqual(summary(scoringRuleDrift(withEdit(repoDocs(), S, old, replacement))), [`${S}｜${rule}`], old);
  }
});

test('找不到就失敗：定位文字被改掉或重複、文件沒有提供、規則資料缺值，都列為漂移', () => {
  const C = 'skills/shared/core-prompt.md';
  const renamed = scoringRuleDrift(withEdit(repoDocs(), C, '路徑可行性 = clamp(', '路徑分數 = clamp('));
  assert.deepEqual(summary(renamed), [`${C}｜路徑可行性與無發現節點取值`]);
  assert.match(renamed[0].reason, /出現 0 次/);

  const duplicated = scoringRuleDrift(withEdit(repoDocs(), C, '4. 信心水準\n', '4. 信心水準\n缺 0 類建議輸入（重複）\n'));
  assert.deepEqual(summary(duplicated), [`${C}｜信心`]);
  assert.match(duplicated[0].reason, /出現 2 次/);

  const missing = scoringRuleDrift(repoDocs().filter(d => d.path !== C));
  assert.deepEqual(summary(missing), [`${C}｜（整份文件）`]);

  const DEMO_RULES = DEMO.RULES;
  const withoutHops = { ...DEMO_RULES, feasibility: { ...DEMO_RULES.feasibility, maxHops: undefined } };
  const noRule = scoringRuleDrift(repoDocs(), withoutHops);
  assert.deepEqual(summary(noRule), ['skills/shared/scoring-rules.md｜最大跳數']);
  assert.match(noRule[0].reason, /規則資料缺少/);
  const noSection = scoringRuleDrift(repoDocs(), { ...DEMO_RULES, confidence: undefined });
  assert.deepEqual(summary(noSection), [`${C}｜信心`, 'skills/shared/task-spec.md｜信心']);
});

test('文件少了最後一個數字（例如漏寫一個信心等級）也算漂移', () => {
  const S = 'skills/shared/scoring-rules.md';
  const drift = scoringRuleDrift(withEdit(repoDocs(), S, '／+1.5（medium）／+1（low）', '／+1.5（medium）'));
  assert.deepEqual(summary(drift), [`${S}｜可能性：威脅情資`]);
  assert.deepEqual(drift[0].actual, [2, 1.5]);
});

test('文件多出一個數字（例如新增一個因子）也算漂移', () => {
  const C = 'skills/shared/core-prompt.md';
  const drift = scoringRuleDrift(withEdit(repoDocs(), C, 'low 1）, 0, 10)', 'low 1）, 0, 10)（另加 1）')); // 加在最後，前面的數字都不位移
  assert.deepEqual(summary(drift), [`${C}｜可能性`]);
  assert.equal(drift[0].actual.length, drift[0].expected.length + 1);
});

test('CRLF 換行的文件與 LF 的結果相同', () => {
  const crlf = (docs) => docs.map(d => ({ ...d, content: d.content.replace(/\n/g, '\r\n') }));
  assert.deepEqual(scoringRuleDrift(crlf(repoDocs())), []);
  const edited = withEdit(repoDocs(), 'skills/shared/task-spec.md', 'tolerant → 70/50/25', 'tolerant → 70/55/25');
  assert.deepEqual(scoringRuleDrift(crlf(edited)), scoringRuleDrift(edited));
  assert.equal(scoringRuleDrift(edited).length, 1);
});
