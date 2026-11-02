/**
 * scoring-rules.mjs — 評分規則一致性檢查
 * 評分規則一致性檢查：示範引擎匯出的規則資料（assets/demo.js 的 RULES）是規則數值的唯一可讀來源，
 * 母本以正體中文散文陳述同一套規則（給語言模型讀，維持手寫）；這裡從散文抽出數值和規則資料比對。
 * interface 是純函式——輸入文件內容、回傳漂移清單，讀檔交給呼叫端（scoring-rules.test.mjs 對 repo 的
 * 實際文件執行，納入 npm test），因此不碰磁碟就能測試。所有輸入只認 LF：讀入時先把 CRLF 正規化。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');

// 抽出的記號：數字（前後不是英數字或小數點，排除 P1、S3、I2 這類代號與「## 1.」這類章節編號），以及項與項之間的運算子
// ＋、−（只認 U+2212 減號；連字號與破折號不算）。比對連運算子一起比，扣分項被寫成加分也會被抓到。
const TOKEN = /(?<![\w.])\d+(?:\.\d+)?(?![\w.])|[+−]/g;
const tokensIn = (text) => (text.match(TOKEN) || []).map(t => (t === '+' || t === '−' ? t : Number(t)));

// 文件寫出的係數＝規則資料的基本值 × 預設權重（權重 1 時文件不另寫「× 1」；身分與控制的 0.8 則寫成獨立的乘數），
// 因此預設權重改了，文件的數字也必須跟著改。
const effective = ({ likelihood: L, impact: I, weights: w }) => ({
  exposed: L.exposed * w.exposure, easmIssues: L.easmIssues * w.exposure,
  exploitPublic: L.exploitPublic * w.exploit, epss: L.epss * w.exploit, kev: L.kev * w.exploit, cvssFallback: L.cvssFallback * w.exploit,
  intel: [L.intel.high, L.intel.medium, L.intel.low].map(v => v * w.intel),
  criticality: I.criticality * w.impact, crownJewel: I.crownJewel * w.impact, entry: I.entry * w.impact,
  dataWeights: ['Restricted', 'Confidential', 'Internal', 'Public'].map(k => I.dataWeight[k] * w.impact)
});

// 同一條規則在不同文件裡的寫法常常相同，排列方式集中在這裡（依文件中記號出現的順序）
const likelihoodFormula = (R) => {
  const { likelihood: L, weights: w } = R, e = effective(R);
  return [
    e.exposed, '+', e.easmIssues, '+', e.exploitPublic, '+', e.epss, '+', e.kev,
    '+', L.identity.cap, w.identity,
    '+', L.misconfig.cap, L.misconfig.perItem, w.control,
    '−', L.controls.cap, L.controls.perItem, w.control,            // 既有控制是扣分
    '+', L.gaps.cap, L.gaps.perItem, w.control,
    '+', ...e.intel, ...L.range
  ];
};
// 缺 EPSS/KEV：以 cvss_base/10 × cvssFallback 取代「epss + kev」兩項
const cvssApproximation = (R) => { const e = effective(R); return [10, e.cvssFallback, e.epss, '+', e.kev]; };
const impactFormula = (R) => { const e = effective(R); return [e.criticality, '+', ...e.dataWeights, '+', e.crownJewel, '+', e.entry, ...R.impact.range]; };
const thresholdOrder = ({ thresholds: T }) => [...T.balanced, ...T.strict, ...T.tolerant]; // 平衡（預設）、嚴格、寬鬆
const feasibilityTerms = ({ feasibility: F }) => [F.entry, '+', F.weakest, '+', F.trustEdge, '−', '−', 1, F.perHop]; // − (跳數 − 1) × perHop
const feasibilityFormula = (R) => [...feasibilityTerms(R), ...R.feasibility.range];
const scoreRange = ({ likelihood: L, impact: I }) => [L.range[0] * I.range[0], L.range[1] * I.range[1]]; // score＝likelihood × impact
// 缺 0 類 → 高；缺 1–(lowMissing−1) 類 → 中；缺 lowMissing 類以上或清冊完整度 < inventoryThreshold% → 低
const confidenceRule = ({ confidence: C }) => [0, 1, C.lowMissing - 1, C.lowMissing, C.inventoryThreshold];

// 核心提示詞與 Custom GPT 指示共用的檢查：兩份的評分規則與信心兩節公式寫法相同（Custom GPT 指示的其他措辭刻意改寫）。
// 任一份改了這兩節的寫法，就把它拆成自己的一組檢查。
const CORE_PROMPT_AND_CUSTOM_GPT_CHECKS = [
  { rule: '可能性', start: 'likelihood = clamp(', expect: likelihoodFormula },
  { rule: 'CVSS 近似與身分弱點定義', start: '缺 epss/kev 時：',
    expect: (R) => [...cvssApproximation(R), R.identityIssue.staleLoginDays] },
  { rule: '影響', start: 'impact = clamp(', expect: impactFormula },
  { rule: '分數門檻', start: 'score = likelihood × impact', expect: thresholdOrder },
  { rule: '路徑可行性與無發現節點取值', start: '路徑可行性 = clamp(', expect: (R) => [...feasibilityFormula(R), R.feasibility.unknownNode, 0] },
  { rule: '信心', start: '缺 0 類建議輸入', expect: confidenceRule }
];

// 對照表：每份要檢查的文件一列——三份母本、兩份刻意改寫的版本（Codex SKILL.md、Custom GPT 指示）與網站流程資料；
// 複本與嵌入區塊由建置與 CI 的 git diff 守住，不放這裡。
// checks：rule＝規則名稱（回報用）；start＝定位用的文字，必須在文件中恰好出現一次；end＝區段結尾（預設到行尾，含 end 本身）；
// expect＝從規則資料排出這段文字裡應該依序出現的記號（文件寫死的常數，例如 cvss_base/10 的 10，直接寫在這裡）。
export const DOCUMENTS = [
  { path: 'skills/shared/core-prompt.md', checks: CORE_PROMPT_AND_CUSTOM_GPT_CHECKS },
  { path: 'skills/shared/task-spec.md', checks: [ // 附錄 A 的程式碼區塊，以及第 5 節的信心規則
    { rule: '可能性', start: 'likelihood = clamp(', end: ', 0, 10)', expect: likelihoodFormula },
    { rule: 'CVSS 近似', start: '# 缺 epss/kev：', expect: cvssApproximation },
    { rule: '身分弱點定義', start: '# identity_issues =', expect: (R) => [R.identityIssue.staleLoginDays] },
    { rule: '影響', start: 'impact = clamp(', expect: impactFormula },
    { rule: '分數範圍', start: 'score = likelihood × impact', expect: scoreRange },
    { rule: '分數門檻', start: 'priority: balanced', expect: thresholdOrder },
    { rule: '路徑可行性', start: 'path_feasibility = clamp(', expect: feasibilityFormula },
    { rule: '無發現節點取值', start: '# 節點可能性：', expect: (R) => [0, R.feasibility.unknownNode] },
    { rule: '信心', start: '- 信心水準：', expect: confidenceRule }
  ] },
  { path: 'skills/shared/scoring-rules.md', checks: [ // 各節的範圍、可能性表逐列、影響、分數、門檻表逐列、路徑可行性（本檔沒有信心規則）
    { rule: '可能性範圍', start: '## 1. 可能性（', expect: (R) => R.likelihood.range },
    { rule: '可能性：對外曝露', start: '| 對外曝露 `internet_exposed=true` |', expect: (R) => ['+', effective(R).exposed] },
    { rule: '可能性：EASM 議題', start: '| EASM 有 `issues` |', expect: (R) => ['+', effective(R).easmIssues] },
    { rule: '可能性：公開利用程式', start: '| 公開利用程式 `exploit_public=true` |', expect: (R) => ['+', effective(R).exploitPublic] },
    { rule: '可能性：EPSS', start: '| EPSS |', expect: (R) => ['+', effective(R).epss] },
    { rule: '可能性：KEV', start: '| KEV（已知遭利用）|', expect: (R) => ['+', effective(R).kev] },
    { rule: '可能性：身分弱點', start: '| 身分弱點（',
      expect: (R) => [R.identityIssue.staleLoginDays, '+', R.weights.identity, R.likelihood.identity.cap] },
    { rule: '可能性：設定偏差', start: '| 設定偏差（status=fail）|',
      expect: ({ likelihood: L, weights: w }) => ['+', w.control, L.misconfig.cap, L.misconfig.perItem] },
    { rule: '可能性：既有控制', start: '| 既有控制覆蓋 |', expect: ({ likelihood: L, weights: w }) => ['−', w.control, L.controls.cap, L.controls.perItem] },
    { rule: '可能性：控制缺口', start: '| 控制缺口 |', expect: ({ likelihood: L, weights: w }) => ['+', w.control, L.gaps.cap, L.gaps.perItem] },
    { rule: '可能性：威脅情資', start: '| 威脅情資命中', expect: (R) => effective(R).intel.flatMap(v => ['+', v]) },
    { rule: 'CVSS 近似', start: '缺 EPSS/KEV 時：改用', expect: (R) => [10, effective(R).cvssFallback] },
    { rule: '影響範圍', start: '## 2. 影響（', expect: (R) => R.impact.range },
    { rule: '影響', start: '`impact = clamp(', // data_weight 沒有數字，所以出現連續兩個＋；資料等級權重寫在公式之後
      expect: (R) => { const e = effective(R); return [e.criticality, '+', '+', e.crownJewel, '+', e.entry, ...R.impact.range, ...e.dataWeights]; } },
    { rule: '分數範圍', start: '`score = likelihood × impact`', expect: scoreRange },
    { rule: '分數門檻：嚴格', start: '| 嚴格 |', expect: (R) => R.thresholds.strict },
    { rule: '分數門檻：平衡', start: '| 平衡（預設）|', expect: (R) => R.thresholds.balanced },
    { rule: '分數門檻：寬鬆', start: '| 寬鬆 |', expect: (R) => R.thresholds.tolerant },
    { rule: '路徑可行性範圍', start: '## 4. 攻擊路徑可行性（', expect: (R) => R.feasibility.range },
    { rule: '路徑可行性', start: '`feasibility = clamp(', expect: feasibilityFormula },
    { rule: '無發現節點取值', start: '- 節點可能性：', expect: (R) => [0, R.feasibility.unknownNode] },
    { rule: '最大跳數', start: '- 只走允許範圍內的節點', expect: (R) => [R.feasibility.maxHops] }
  ] },
  { path: 'skills/chatgpt/preemptive-exposure-analysis/SKILL.md', checks: [ // Codex 用的改寫版：評分規則的程式碼區塊、定義段落與信心一節
    { rule: '可能性', start: 'likelihood = clamp(', end: ', 0, 10)', expect: likelihoodFormula },
    { rule: 'CVSS 近似', start: '（缺 epss/kev：', expect: cvssApproximation },
    { rule: '影響', start: 'impact     = clamp(', end: ', 0, 10)', expect: impactFormula },
    { rule: '分數門檻', start: 'score      = likelihood × impact', expect: thresholdOrder },
    { rule: '路徑可行性', start: '路徑可行性 = clamp(', expect: feasibilityFormula },
    { rule: '無發現節點取值', start: '（無任何發現的節點取', expect: (R) => [R.feasibility.unknownNode, 0] },
    { rule: '身分弱點定義', start: '定義：「身分弱點數」', end: '的身分數', expect: (R) => [R.identityIssue.staleLoginDays] },
    { rule: '信心', start: '缺 0 類建議輸入', expect: confidenceRule }
  ] },
  { path: 'skills/chatgpt/custom-gpt-instructions.md', checks: CORE_PROMPT_AND_CUSTOM_GPT_CHECKS }, // 只比數值與運算子；措辭為字數限制刻意精簡
  { path: 'data/process.js', checks: [ // 網站流程頁的 S3、S4 說明
    { rule: 'S3：分數範圍', start: '；分數 ', end: '依風險胃納', expect: scoreRange },
    { rule: 'S4：最大跳數', start: '沿 edges 深度優先搜尋至 crown jewel', end: '跳', expect: (R) => [R.feasibility.maxHops] },
    { rule: 'S4：路徑可行性', start: '可行性 = 入口可能性', end: '；列出', expect: feasibilityTerms }
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
      if (!expected || !expected.every(t => t === '+' || t === '−' || Number.isFinite(t))) { report({ reason: '規則資料缺少這條規則的數值' }); continue; }
      const count = text.split(start).length - 1;
      if (count !== 1) { report({ expected, reason: `「${start}」在文件中出現 ${count} 次，必須恰好一次` }); continue; }
      const from = text.indexOf(start);
      const stop = text.indexOf(end ?? '\n', from + start.length);
      const segment = text.slice(from, stop === -1 ? undefined : stop + (end ? end.length : 0));
      const actual = tokensIn(segment);
      if (actual.length !== expected.length || actual.some((v, i) => v !== expected[i])) report({ expected, actual, reason: '數值與規則資料不同' });
    }
  }
  return drift;
}
