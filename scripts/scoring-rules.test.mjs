// scoring-rules.test.mjs — 評分規則一致性：母本散文的數值與示範引擎的規則資料比對
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

test('示範頁的預設權重取自規則資料，但是可調整的複製品', () => {
  assert.deepEqual(DEMO.DEFAULTS.weights, DEMO.RULES.weights);
  assert.ok(!Object.isFrozen(DEMO.DEFAULTS.weights), '網站會讓使用者調整 DEFAULTS 的權重，它不能被凍結');
  assert.notEqual(DEMO.DEFAULTS.weights, DEMO.RULES.weights, 'DEFAULTS.weights 必須是複製品，不能直接是 RULES 的物件');
});

test('網站規則卡的文字由引擎依規則資料產生：預設規則與改動前的卡片逐字相同', () => {
  assert.deepEqual(DEMO.rulesSummary(), [
    '可能性 = 對外曝露 3 + EASM 議題 0.5 + 公開利用程式 2 + EPSS×3 + KEV 3 + 身分弱點 + 設定偏差 + 控制缺口 − 既有控制 + 情資命中（依行為者信心 2／1.5／1）（各乘權重，上限 10）；缺 EPSS/KEV 時以 CVSS/10×1.5 近似',
    '影響 = 業務重要性×1.4 + 資料等級（Restricted 3／Confidential 2／Internal 1／Public 0）+2 若為 crown jewel +2 若為可達 crown jewel 的入口（上限 10）',
    '分數 = 可能性 × 影響（0–100）；平衡胃納 P1 ≥ 60、P2 ≥ 40、P3 ≥ 20（嚴格 50/30/15；寬鬆 70/50/25）。',
    '信心：缺 0 類 → 高；缺 1–2 類 → 中；缺 3 類以上或清冊完整度 < 80% → 低。攻擊路徑可行性 = 入口可能性×0.5 + 最弱節點×0.3 + 身分／設定邊×1 − (跳數−1)×0.6；無任何發現的節點取 3。'
  ]);
});

test('規則卡的數字全部取自規則資料：卡片用到的每個欄位都換成不同的值，卡片逐一跟著改', () => {
  const changed = {
    likelihood: { exposed: 11, easmIssues: 12, exploitPublic: 13, epss: 14, kev: 15, cvssFallback: 16, intel: { high: 17, medium: 18, low: 19 }, range: [1, 20] },
    impact: { criticality: 21, dataWeight: { Restricted: 22, Confidential: 23, Internal: 24, Public: 25 }, crownJewel: 26, entry: 27, range: [2, 28] },
    thresholds: { balanced: [31, 32, 33], strict: [34, 35, 36], tolerant: [37, 38, 39] },
    feasibility: { entry: 41, weakest: 42, trustEdge: 43, perHop: 44, unknownNode: 45 },
    confidence: { lowMissing: 46, inventoryThreshold: 47 }
  };
  assert.deepEqual(DEMO.rulesSummary(changed), [
    '可能性 = 對外曝露 11 + EASM 議題 12 + 公開利用程式 13 + EPSS×14 + KEV 15 + 身分弱點 + 設定偏差 + 控制缺口 − 既有控制 + 情資命中（依行為者信心 17／18／19）（各乘權重，上限 20）；缺 EPSS/KEV 時以 CVSS/10×16 近似',
    '影響 = 業務重要性×21 + 資料等級（Restricted 22／Confidential 23／Internal 24／Public 25）+26 若為 crown jewel +27 若為可達 crown jewel 的入口（上限 28）',
    '分數 = 可能性 × 影響（2–560）；平衡胃納 P1 ≥ 31、P2 ≥ 32、P3 ≥ 33（嚴格 34/35/36；寬鬆 37/38/39）。',
    '信心：缺 0 類 → 高；缺 1–45 類 → 中；缺 46 類以上或清冊完整度 < 47% → 低。攻擊路徑可行性 = 入口可能性×41 + 最弱節點×42 + 身分／設定邊×43 − (跳數−1)×44；無任何發現的節點取 45。'
  ]);
});

// ---------------------------------------------------------------------------
// 一致性檢查：輸入文件（路徑與內容），回傳漂移清單
// ---------------------------------------------------------------------------
const ROOT = new URL('../', import.meta.url);
const repoDocs = () => DOCUMENTS.map(d => ({ path: d.path, content: readFileSync(new URL(d.path, ROOT), 'utf8').replace(/\r\n/g, '\n') }));
// 在記憶體中改一份文件：old 必須恰好出現一次，免得測試改錯地方
const withEdit = (docs, path, old, replacement) => {
  assert.ok(docs.some(d => d.path === path), `對照表沒有 ${path}`);
  return docs.map(d => {
    if (d.path !== path) return d;
    assert.equal(d.content.split(old).length - 1, 1, `${path} 裡「${old}」必須恰好出現一次`);
    return { ...d, content: d.content.replace(old, replacement) };
  });
};
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

  const withoutHops = { ...DEMO.RULES, feasibility: { ...DEMO.RULES.feasibility, maxHops: undefined } };
  const noRule = scoringRuleDrift(repoDocs(), withoutHops);
  assert.deepEqual(summary(noRule), ['skills/shared/scoring-rules.md｜最大跳數', 'data/process.js｜S4：最大跳數']);
  assert.match(noRule[0].reason, /規則資料缺少/);
  const noSection = scoringRuleDrift(repoDocs(), { ...DEMO.RULES, confidence: undefined });
  assert.deepEqual(summary(noSection), [`${C}｜信心`, 'skills/shared/task-spec.md｜信心', 'skills/chatgpt/preemptive-exposure-analysis/SKILL.md｜信心', 'skills/chatgpt/custom-gpt-instructions.md｜信心']);
});

test('文件少了最後一個數字（例如漏寫一個信心等級）也算漂移', () => {
  const S = 'skills/shared/scoring-rules.md';
  const drift = scoringRuleDrift(withEdit(repoDocs(), S, '／+1.5（medium）／+1（low）', '／+1.5（medium）'));
  assert.deepEqual(summary(drift), [`${S}｜可能性：威脅情資`]);
  assert.deepEqual(drift[0].actual, ['+', 2, '+', 1.5]);
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

test('運算子也要一致：既有控制與跳數的扣分「−」被改成「+」時回報', () => {
  const cases = [
    ['skills/shared/core-prompt.md', '− min(2,既有控制數·0.6)', '+ min(2,既有控制數·0.6)', '可能性'],
    ['skills/shared/core-prompt.md', '− (跳數−1)·0.6', '+ (跳數−1)·0.6', '路徑可行性與無發現節點取值'],
    ['skills/shared/task-spec.md', '− min(2, controls·0.6)', '+ min(2, controls·0.6)', '可能性'],
    ['skills/shared/task-spec.md', '− (hops−1)·0.6', '+ (hops−1)·0.6', '路徑可行性'],
    ['skills/shared/scoring-rules.md', '| −0.8 × min(2, 數量 × 0.6) |', '| +0.8 × min(2, 數量 × 0.6) |', '可能性：既有控制'],
    ['skills/shared/scoring-rules.md', '− (hops − 1) × 0.6', '+ (hops − 1) × 0.6', '路徑可行性']
  ];
  for (const [path, old, replacement, rule] of cases) {
    assert.deepEqual(summary(scoringRuleDrift(withEdit(repoDocs(), path, old, replacement))), [`${path}｜${rule}`], `${path}：${old}`);
  }
});

test('文件寫的係數含預設權重：權重 1 的因子（例如對外曝露）權重被改掉，文件的數字也算漂移', () => {
  const R = DEMO.RULES;
  const drift = scoringRuleDrift(repoDocs(), { ...R, weights: { ...R.weights, exposure: 1.2 } });
  assert.deepEqual(summary(drift), [
    'skills/shared/core-prompt.md｜可能性',
    'skills/shared/task-spec.md｜可能性',
    'skills/shared/scoring-rules.md｜可能性：對外曝露',
    'skills/shared/scoring-rules.md｜可能性：EASM 議題',
    'skills/chatgpt/preemptive-exposure-analysis/SKILL.md｜可能性',
    'skills/chatgpt/custom-gpt-instructions.md｜可能性'
  ]);
  const impact = scoringRuleDrift(repoDocs(), { ...R, weights: { ...R.weights, impact: 0.9 } });
  assert.deepEqual(summary(impact), ['skills/shared/core-prompt.md｜影響', 'skills/shared/task-spec.md｜影響', 'skills/shared/scoring-rules.md｜影響',
    'skills/chatgpt/preemptive-exposure-analysis/SKILL.md｜影響', 'skills/chatgpt/custom-gpt-instructions.md｜影響']);
  assert.equal(impact[0].expected[0], 1.4 * 0.9, '業務重要性係數也要乘上影響權重');
});

test('分數範圍由可能性與影響的上下限推得：可能性上限改了，分數範圍也要跟著改', () => {
  const R = DEMO.RULES;
  const drift = scoringRuleDrift(repoDocs(), { ...R, likelihood: { ...R.likelihood, range: [0, 5] } });
  const scoreRange = drift.filter(d => d.rule.endsWith('分數範圍'));
  assert.deepEqual(summary(scoreRange), ['skills/shared/task-spec.md｜分數範圍', 'skills/shared/scoring-rules.md｜分數範圍', 'data/process.js｜S3：分數範圍']);
  assert.deepEqual(scoreRange[0].expected, [0, 50]);
});

test('範圍也要一致：可能性、影響、路徑可行性的 0–10 與分數的 0–100', () => {
  const cases = [
    ['skills/shared/scoring-rules.md', '## 1. 可能性（likelihood，0–10）', '## 1. 可能性（likelihood，0–12）', '可能性範圍'],
    ['skills/shared/scoring-rules.md', '## 2. 影響（impact，0–10）', '## 2. 影響（impact，1–10）', '影響範圍'],
    ['skills/shared/scoring-rules.md', '## 4. 攻擊路徑可行性（0–10）', '## 4. 攻擊路徑可行性（0–5）', '路徑可行性範圍'],
    ['skills/shared/scoring-rules.md', '`score = likelihood × impact`（0–100）', '`score = likelihood × impact`（0–10）', '分數範圍'],
    ['skills/shared/task-spec.md', 'score = likelihood × impact  (0–100)', 'score = likelihood × impact  (0–1000)', '分數範圍']
  ];
  for (const [path, old, replacement, rule] of cases) {
    assert.deepEqual(summary(scoringRuleDrift(withEdit(repoDocs(), path, old, replacement))), [`${path}｜${rule}`], `${path}：${old}`);
  }
});

test('改寫版與網站流程文字也受檢查：Codex SKILL.md、Custom GPT 指示、流程資料的 S3／S4 說明', () => {
  const X = 'skills/chatgpt/preemptive-exposure-analysis/SKILL.md';
  const G = 'skills/chatgpt/custom-gpt-instructions.md';
  const P = 'data/process.js';
  const cases = [
    [X, '設定偏差數·0.75)·0.8', '設定偏差數·0.7)·0.8', '可能性'],
    [X, '（缺 epss/kev：以 cvss_base/10·1.5', '（缺 epss/kev：以 cvss_base/10·2', 'CVSS 近似'],
    [X, 'Internal 1, Public 0}', 'Internal 2, Public 0}', '影響'],
    [X, '嚴格 50/30/15', '嚴格 50/35/15', '分數門檻'],
    [X, '− (跳數−1)·0.6', '+ (跳數−1)·0.6', '路徑可行性'],
    [X, '（無任何發現的節點取 3', '（無任何發現的節點取 2', '無發現節點取值'],
    [X, '`last_login_days` > 90', '`last_login_days` > 60', '身分弱點定義'],
    [X, '缺 3 類以上或資產清冊完整度 < 80%', '缺 3 類以上或資產清冊完整度 < 70%', '信心'],
    [G, 'low 1）, 0, 10)', 'low 0.5）, 0, 10)', '可能性'],
    [G, '或 last_login_days > 90）', '或 last_login_days > 30）', 'CVSS 近似與身分弱點定義'],
    [G, 'Internal 1, Public 0}', 'Internal 1, Public 1}', '影響'],
    [G, '寬鬆：70／50／25', '寬鬆：70／50／30', '分數門檻'],
    [G, '無任何發現的節點可能性取 3', '無任何發現的節點可能性取 4', '路徑可行性與無發現節點取值'],
    [G, '缺 1–2 類 → 中', '缺 1–3 類 → 中', '信心'],
    [P, '分數 0–100', '分數 0–10', 'S3：分數範圍'],
    [P, '最多 5 跳', '最多 6 跳', 'S4：最大跳數'],
    [P, '最弱節點×0.3', '最弱節點×0.4', 'S4：路徑可行性'],
    [P, '身分／設定邊數×1 − (跳數−1)', '身分／設定邊數×1 + (跳數−1)', 'S4：路徑可行性']
  ];
  for (const [path, old, replacement, rule] of cases) {
    assert.deepEqual(summary(scoringRuleDrift(withEdit(repoDocs(), path, old, replacement))), [`${path}｜${rule}`], `${path}：${old}`);
  }
});
