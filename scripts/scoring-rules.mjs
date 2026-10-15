/**
 * scoring-rules.mjs
 * 評分規則一致性檢查：示範引擎匯出的規則資料（assets/demo.js 的 RULES）是規則數值的唯一可讀來源，
 * 母本以正體中文散文陳述同一套規則（給語言模型讀，維持手寫）；這裡從散文抽出數值和規則資料比對。
 * interface 是純函式——輸入文件內容、回傳漂移清單，讀檔交給呼叫端（scoring-rules.test.mjs 對 repo 的
 * 實際文件執行，納入 npm test），因此不碰磁碟就能測試。所有輸入只認 LF：讀入時先把 CRLF 正規化。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');

// 數字：前後不是英數字或小數點，排除 P1、S3、I2 這類代號與「## 1.」這類章節編號
const NUMBER = /(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g;

// 同一條規則在不同文件裡的寫法常常相同，排列方式集中在這裡（依文件中數字出現的順序）
const likelihoodFormula = ({ likelihood: L, weights: w }) => [
  L.exposed, L.easmIssues, L.exploitPublic, L.epss, L.kev,
  L.identity.cap, w.identity,
  L.misconfig.cap, L.misconfig.perItem, w.control,
  L.controls.cap, L.controls.perItem, w.control,
  L.gaps.cap, L.gaps.perItem, w.control,
  L.intel.high, L.intel.medium, L.intel.low, ...L.range
];
const dataWeights = ({ impact: I }) => ['Restricted', 'Confidential', 'Internal', 'Public'].map(k => I.dataWeight[k]);
const impactFormula = (R) => [R.impact.criticality, ...dataWeights(R), R.impact.crownJewel, R.impact.entry, ...R.impact.range];
const thresholds = ({ thresholds: T }) => [...T.balanced, ...T.strict, ...T.tolerant]; // 平衡（預設）、嚴格、寬鬆
const feasibilityFormula = ({ feasibility: F }) => [F.entry, F.weakest, F.trustEdge, 1, F.perHop, ...F.range]; // 1：(跳數 − 1)
// 缺 0 類 → 高；缺 1–(lowMissing−1) 類 → 中；缺 lowMissing 類以上或清冊完整度 < inventoryThreshold% → 低
const confidence = ({ confidence: C }) => [0, 1, C.lowMissing - 1, C.lowMissing, C.inventoryThreshold];

// 對照表：每份要檢查的文件一列（只放母本與改寫版；複本與嵌入區塊由建置與 CI 的 git diff 守住）。
// checks：rule＝規則名稱（回報用）；start＝定位用的文字，必須在文件中恰好出現一次；end＝區段結尾（預設到行尾，含 end 本身）；
// expect＝從規則資料排出這段文字裡應該依序出現的數字（文件寫死的常數，例如 cvss_base/10 的 10，直接寫在這裡）。
export const DOCUMENTS = [
  { path: 'skills/shared/core-prompt.md', checks: [
    { rule: '可能性', start: 'likelihood = clamp(', expect: likelihoodFormula },
    { rule: 'CVSS 近似與身分弱點定義', start: '缺 epss/kev 時：',
      expect: (R) => [10, R.likelihood.cvssFallback, R.likelihood.epss, R.likelihood.kev, R.identityIssue.staleLoginDays] },
    { rule: '影響', start: 'impact = clamp(', expect: impactFormula },
    { rule: '分數門檻', start: 'score = likelihood × impact', expect: thresholds },
    { rule: '路徑可行性與無發現節點取值', start: '路徑可行性 = clamp(', expect: (R) => [...feasibilityFormula(R), R.feasibility.unknownNode, 0] },
    { rule: '信心', start: '缺 0 類建議輸入', expect: confidence }
  ] },
  { path: 'skills/shared/task-spec.md', checks: [ // 附錄 A 的程式碼區塊，以及第 5 節的信心規則
    { rule: '可能性', start: 'likelihood = clamp(', end: ', 0, 10)', expect: likelihoodFormula },
    { rule: 'CVSS 近似', start: '# 缺 epss/kev：', expect: (R) => [10, R.likelihood.cvssFallback, R.likelihood.epss, R.likelihood.kev] },
    { rule: '身分弱點定義', start: '# identity_issues =', expect: (R) => [R.identityIssue.staleLoginDays] },
    { rule: '影響', start: 'impact = clamp(', expect: impactFormula },
    { rule: '分數門檻', start: 'priority: balanced', expect: thresholds },
    { rule: '路徑可行性', start: 'path_feasibility = clamp(', expect: feasibilityFormula },
    { rule: '無發現節點取值', start: '# 節點可能性：', expect: (R) => [0, R.feasibility.unknownNode] },
    { rule: '信心', start: '- 信心水準：', expect: confidence }
  ] },
  { path: 'skills/shared/scoring-rules.md', checks: [ // 可能性表逐列、影響、門檻表逐列、路徑可行性（本檔沒有信心規則）
    { rule: '可能性：對外曝露', start: '| 對外曝露 `internet_exposed=true` |', expect: (R) => [R.likelihood.exposed] },
    { rule: '可能性：EASM 議題', start: '| EASM 有 `issues` |', expect: (R) => [R.likelihood.easmIssues] },
    { rule: '可能性：公開利用程式', start: '| 公開利用程式 `exploit_public=true` |', expect: (R) => [R.likelihood.exploitPublic] },
    { rule: '可能性：EPSS', start: '| EPSS |', expect: (R) => [R.likelihood.epss] },
    { rule: '可能性：KEV', start: '| KEV（已知遭利用）|', expect: (R) => [R.likelihood.kev] },
    { rule: '可能性：身分弱點', start: '| 身分弱點（',
      expect: (R) => [R.identityIssue.staleLoginDays, R.weights.identity, R.likelihood.identity.cap] },
    { rule: '可能性：設定偏差', start: '| 設定偏差（status=fail）|',
      expect: ({ likelihood: L, weights: w }) => [w.control, L.misconfig.cap, L.misconfig.perItem] },
    { rule: '可能性：既有控制', start: '| 既有控制覆蓋 |', expect: ({ likelihood: L, weights: w }) => [w.control, L.controls.cap, L.controls.perItem] },
    { rule: '可能性：控制缺口', start: '| 控制缺口 |', expect: ({ likelihood: L, weights: w }) => [w.control, L.gaps.cap, L.gaps.perItem] },
    { rule: '可能性：威脅情資', start: '| 威脅情資命中', expect: ({ likelihood: L }) => [L.intel.high, L.intel.medium, L.intel.low] },
    { rule: 'CVSS 近似', start: '缺 EPSS/KEV 時：改用', expect: (R) => [10, R.likelihood.cvssFallback] },
    { rule: '影響', start: '`impact = clamp(',
      expect: (R) => [R.impact.criticality, R.impact.crownJewel, R.impact.entry, ...R.impact.range, ...dataWeights(R)] },
    { rule: '分數門檻：嚴格', start: '| 嚴格 |', expect: (R) => R.thresholds.strict },
    { rule: '分數門檻：平衡', start: '| 平衡（預設）|', expect: (R) => R.thresholds.balanced },
    { rule: '分數門檻：寬鬆', start: '| 寬鬆 |', expect: (R) => R.thresholds.tolerant },
    { rule: '路徑可行性', start: '`feasibility = clamp(', expect: feasibilityFormula },
    { rule: '無發現節點取值', start: '- 節點可能性：', expect: (R) => [0, R.feasibility.unknownNode] },
    { rule: '最大跳數', start: '- 只走 `in_scope_assets` 內的節點', expect: (R) => [R.feasibility.maxHops] }
  ] }
];

// 回傳漂移清單 [{ path, rule, expected, actual, reason }]；空陣列＝全部一致。
// files：[{ path, content }]；rules 預設為示範引擎匯出的規則資料。
// 找不到文件、定位文字不是恰好一次、規則資料缺值，都列為漂移，不默默通過。
export function scoringRuleDrift(files, rules = DEMO.RULES) {
  const drift = [];
  for (const doc of DOCUMENTS) {
    const file = files.find(f => f.path === doc.path);
    if (!file) {
      drift.push({ path: doc.path, rule: '（整份文件）', expected: [], actual: [], reason: '沒有提供這份文件' });
      continue;
    }
    const text = file.content.replace(/\r\n/g, '\n');
    for (const { rule, start, end, expect } of doc.checks) {
      const report = (fields) => drift.push({ path: doc.path, rule, expected: [], actual: [], ...fields });
      let expected;
      try { expected = expect(rules); } catch { expected = null; }
      if (!expected || !expected.every(Number.isFinite)) { report({ reason: '規則資料缺少這條規則的數值' }); continue; }
      const count = text.split(start).length - 1;
      if (count !== 1) { report({ expected, reason: `「${start}」在文件中出現 ${count} 次，必須恰好一次` }); continue; }
      const from = text.indexOf(start);
      const stop = text.indexOf(end ?? '\n', from + start.length);
      const segment = text.slice(from, stop === -1 ? undefined : stop + (end ? end.length : 0));
      const actual = (segment.match(NUMBER) || []).map(Number);
      if (actual.length !== expected.length || actual.some((v, i) => v !== expected[i])) report({ expected, actual, reason: '數值與規則資料不同' });
    }
  }
  return drift;
}
