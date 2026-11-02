// scoring.test.mjs — 示範引擎依示範評分規則的計算行為
// 示範引擎依示範評分規則的計算行為（見 GLOSSARY.md「示範引擎」「示範評分規則」，issue #61）。
// 一致性檢查（scoring-rules.test.mjs）只比對文件與規則資料的數值；這裡經由 analyze() 斷言引擎實際算出的結果。
// - 預期值一律是手算的字面數字，旁邊註明算式；不從 RULES 取係數，否則公式寫錯時測試也會跟著錯。
// - 依據是 skills/shared/task-spec.md 附錄 A（信心規則在第 5 節）。文件沒寫的細節照引擎現行行為釘住，
//   測試名稱標明「文件未寫」：多個行為者命中取最高、未標信心以 low 計、未標資料等級以 Internal 計、分數取到小數一位，
//   以及各權重乘在哪幾項（附錄 A 只寫預設權重 0.8 的兩組；EASM 歸曝露權重、CVSS 近似歸利用權重、
//   情資乘情資權重、影響權重也乘在 crown jewel 與入口加分上）。
// - 跳數上限與入口加分另見 attack-paths.test.mjs。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');

// 最小資料：資產 A（業務重要性 3、Internal、不對外）上一筆弱點，其他輸入都是空的。
// 基本案例的可能性 = 0、影響 = 3×1.4 + 1 = 5.2；每個測試只覆寫自己要的欄位。
const asset = (id, fields = {}) => ({ asset_id: id, name: id, type: 'server', business_criticality: 3, data_classification: 'Internal',
  internet_exposed: false, environment: 'IT', owner: '測試', ...fields });
const vuln = (fields = {}) => ({ finding_id: 'F1', asset_id: 'A', vuln_id: 'TEST-1', title: '測試弱點', cvss_base: 5,
  exploit_public: false, epss_sim: 0, kev_sim: false, ...fields });
function caseWith({ assets = [asset('A')], vulnerabilities = [vuln()], identities = [], misconfigurations = [], controls = [],
                    actors = [], exposures = [], crownJewels = [], edges = [] } = {}) {
  return {
    scope: { organization: '測試', analysis_date: '2026-10-17', reporting: { audience: ['CISO'] },
             authorized_scope: { in_scope_assets: assets.map(a => a.asset_id), active_testing_authorized: false, external_scanning_authorized: false } },
    assets, vulnerabilities, identities, misconfigurations, controls: { controls }, threatIntel: { actors },
    exposures: { exposures }, topology: { crown_jewels: crownJewels, edges }
  };
}
// 案例裡唯一一筆弱點 F1 的評分結果
const findingF1 = (data, params) => DEMO.analyze(data, params).findings.find(f => f.finding_id === 'F1');
const likelihoodOf = (data, params) => findingF1(data, params).likelihood;
// 浮點加總（例如 0.6000000000000001）只比到 1e-9
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} 預期 ${expected}，實際 ${actual}`);
const EXPOSED = asset('A', { internet_exposed: true }); // 可能性 3：讓扣分項不會被 clamp 到 0

// n 筆連到資產 A 的設定偏差（fail）、身分、既有控制（覆蓋 A）、控制缺口（A 是它的缺口）
const failing = (n) => Array.from({ length: n }, (_, i) => ({ config_id: `M${i}`, asset_id: 'A', control: '基準', status: 'fail' }));
const identity = (i, fields = {}) => ({ identity_id: `I${i}`, account: `u${i}`, privilege_level: 'user', linked_assets: 'A',
                                        mfa_enabled: true, last_login_days: 1, ...fields });
const noMfa = (n) => Array.from({ length: n }, (_, i) => identity(i, { mfa_enabled: false }));
const control = (i, { coverage_assets = [], gaps = [] }) => ({ control_id: `C${i}`, name: `控制${i}`, coverage_assets, gaps, maturity: 'full' });
const covering = (n) => Array.from({ length: n }, (_, i) => control(i, { coverage_assets: ['A'] }));
const gapping = (n) => Array.from({ length: n }, (_, i) => control(i, { gaps: ['A'] }));
const EASM_ISSUE = { asset_id: 'A', hostname: 'a.example', issues: ['TLS 過期'] };
// internet → A → B（B 是 crown jewel 時，A 是可達 crown jewel 的入口）；第二條邊的信任類型可指定
const pathAtoB = (trust = 'network') => [{ from: 'internet', to: 'A', via: 'VPN', trust: 'network' }, { from: 'A', to: 'B', via: '服務帳號', trust }];
const actor = (i, confidence) => ({ actor_id: `T${i}`, name: `行為者${i}`, ttps: [], exploits_vuln_ids: ['TEST-1'], ...(confidence && { confidence }) });

test('可能性逐項加總：對外曝露、EASM 議題、公開利用程式、EPSS×係數、KEV；EASM 乘曝露權重、其餘利用項乘利用權重（權重歸屬：文件未寫）', () => {
  const data = caseWith({ assets: [EXPOSED], vulnerabilities: [vuln({ exploit_public: true, epss_sim: 0.2, kev_sim: true })],
                          exposures: [EASM_ISSUE] });
  near(likelihoodOf(data), 9.1);                                                     // 3 + 0.5 + 2 + 3×0.2 + 3
  // 每個加分項都記成依據；EPSS 0.2 < 0.5 不另列
  assert.deepEqual(findingF1(data).factors, ['對外曝露', 'EASM 議題：TLS 過期', '公開利用程式', '模擬 KEV（已知遭利用）']);
  near(likelihoodOf(data, { weights: { exposure: 0.5 } }), 7.35);                     // (3 + 0.5)×0.5 + 2 + 0.6 + 3
  near(likelihoodOf(data, { weights: { exploit: 0.5 } }), 6.3);                       // 3 + 0.5 + (2 + 0.6 + 3)×0.5
});

test('身分弱點、設定偏差、控制缺口、既有控制各有上限；既有控制是扣分', () => {
  near(likelihoodOf(caseWith({ assets: [EXPOSED], misconfigurations: failing(1) })), 3.6);   // 3 + min(1.5, 1×0.75)×0.8
  near(likelihoodOf(caseWith({ assets: [EXPOSED], misconfigurations: failing(5) })), 4.2);   // 3 + min(1.5, 5×0.75)×0.8
  near(likelihoodOf(caseWith({ assets: [EXPOSED], identities: noMfa(3) })), 4.6);            // 3 + min(2, 3)×0.8
  near(likelihoodOf(caseWith({ assets: [EXPOSED], controls: gapping(4) })), 4.2);    // 3 + min(1.5, 4×0.4)×0.8
  near(likelihoodOf(caseWith({ assets: [EXPOSED], controls: covering(1) })), 2.52); // 3 − min(2, 1×0.6)×0.8
  near(likelihoodOf(caseWith({ assets: [EXPOSED], controls: covering(4) })), 1.4);  // 3 − min(2, 4×0.6)×0.8
});

test('clamp：可能性超過 10 取 10、扣到負數取 0；影響超過 10 取 10', () => {
  const all = caseWith({ assets: [EXPOSED], vulnerabilities: [vuln({ exploit_public: true, epss_sim: 1, kev_sim: true })],
                         exposures: [EASM_ISSUE] });
  near(likelihoodOf(all), 10);                                                       // 3 + 0.5 + 2 + 3 + 3 = 11.5 → 10
  near(likelihoodOf(caseWith({ controls: covering(4) })), 0);               // 0 − min(2, 2.4)×0.8 = −1.6 → 0
  const crown = caseWith({ assets: [asset('A', { business_criticality: 5, data_classification: 'Restricted' })], crownJewels: ['A'] });
  near(findingF1(crown).impact, 10);                                                 // 5×1.4 + 3 + 2 = 12 → 10
});

test('威脅情資：多個行為者命中時取最高信心，不是加總（文件未寫）；未標信心以 low 計（文件未寫）', () => {
  near(likelihoodOf(caseWith({ assets: [EXPOSED], actors: [actor(1, 'high'), actor(2, 'low')] })), 5);    // 3 + max(2, 1)
  near(likelihoodOf(caseWith({ assets: [EXPOSED], actors: [actor(1, 'medium'), actor(2, 'medium')] })), 4.5); // 3 + 1.5
  near(likelihoodOf(caseWith({ assets: [EXPOSED], actors: [actor(1)] })), 4);                             // 3 + 1（low）
  near(likelihoodOf(caseWith({ assets: [EXPOSED], actors: [actor(1, 'high')] }), { weights: { intel: 0.5 } }), 4); // 3 + 2×0.5（情資乘情資權重：文件未寫）
});

test('CVSS 近似：關掉 EPSS 輸入時以 cvss_base/10×1.5 取代 EPSS 與 KEV，並記入缺漏', () => {
  const data = caseWith({ assets: [EXPOSED], vulnerabilities: [vuln({ cvss_base: 8, epss_sim: 0.9, kev_sim: true })] });
  const f = findingF1(data, { inputs: { epss: false } });
  near(f.likelihood, 4.2);                                                           // 3 + 8/10×1.5（EPSS 0.9、KEV 不計）
  assert.ok(f.missing.includes('EPSS/KEV（改用 CVSS 近似）'), f.missing.join('、'));
  near(likelihoodOf(data, { inputs: { epss: false }, weights: { exploit: 0.5 } }), 3.6); // 3 + 1.2×0.5（CVSS 近似乘利用權重：文件未寫）
});

test('影響：業務重要性×1.4 + 資料等級權重 + crown jewel 2 + 可達 crown jewel 之入口 2；未標資料等級以 Internal 計（文件未寫）', () => {
  const impactOf = (fields, extra = {}, params) => findingF1(caseWith({ assets: [asset('A', fields), asset('B')], ...extra }), params).impact;
  near(impactOf({ business_criticality: 4, data_classification: 'Confidential' }), 7.6);   // 4×1.4 + 2
  near(impactOf({ business_criticality: 4, data_classification: 'Public' }), 5.6);         // 4×1.4 + 0
  const unlabeled = asset('A', { business_criticality: 2 });
  delete unlabeled.data_classification;                                                    // 資產根本沒有這個欄位
  near(findingF1(caseWith({ assets: [unlabeled] })).impact, 3.8);                          // 2×1.4 + 1（Internal）
  const crownJewel = { crownJewels: ['A'] }, entry = { crownJewels: ['B'], edges: pathAtoB() }; // entry：A 是 internet → A → B 的入口
  near(impactOf({ business_criticality: 2 }, crownJewel), 5.8);                             // 2×1.4 + 1 + 2
  near(impactOf({ business_criticality: 2 }, entry), 5.8);                                  // 2×1.4 + 1 + 2
});

test('影響權重乘在整個影響上，包括 crown jewel 與入口的加分（權重歸屬：文件未寫）', () => {
  const impactOf = (fields, extra = {}) => findingF1(caseWith({ assets: [asset('A', fields), asset('B')], ...extra }),
                                                    { weights: { impact: 0.5 } }).impact;
  near(impactOf({ business_criticality: 4, data_classification: 'Confidential' }), 3.8);   // (4×1.4 + 2)×0.5
  near(impactOf({ business_criticality: 2 }, { crownJewels: ['A'] }), 2.9);                 // (2×1.4 + 1 + 2)×0.5
  near(impactOf({ business_criticality: 2 }, { crownJewels: ['B'], edges: pathAtoB() }), 2.9); // (2×1.4 + 1 + 2)×0.5
});

test('分數＝可能性×影響，取到小數一位（文件未寫）；剛好等於門檻算高一級，三種風險胃納各有門檻', () => {
  // impact10：資產 A 的影響 10（業務重要性 5、Restricted：5×1.4 + 3），對外曝露
  const impact10 = (vulnFields, assetFields = {}) => caseWith({
    assets: [asset('A', { internet_exposed: true, business_criticality: 5, data_classification: 'Restricted', ...assetFields })],
    vulnerabilities: [vuln(vulnFields)] });
  const scored = (data, params) => { const f = findingF1(data, params); return [f.score, f.priority]; };
  assert.deepEqual(scored(impact10({ kev_sim: true })), [60, 'P1']);                              // (3 + 3)×10 = 60 ≥ 60
  assert.deepEqual(scored(impact10({ exploit_public: true, epss_sim: 0.3 })), [59, 'P2']);        // (3 + 2 + 0.9)×10 = 59
  assert.deepEqual(scored(impact10({ exploit_public: true }), { riskAppetite: 'strict' }), [50, 'P1']);   // (3 + 2)×10 = 50 ≥ 50
  assert.deepEqual(scored(impact10({ epss_sim: 0.63 }), { riskAppetite: 'strict' }), [48.9, 'P2']);       // (3 + 1.89)×10 = 48.9
  // 寬鬆：可能性 clamp 到 10，影響 7（5×1.4 + Public 0）→ 70；影響權重 0.99 → 6.93 → 69.3
  const tolerant = impact10({ exploit_public: true, epss_sim: 1, kev_sim: true }, { data_classification: 'Public' });
  assert.deepEqual(scored(tolerant, { riskAppetite: 'tolerant' }), [70, 'P1']);
  assert.deepEqual(scored(tolerant, { riskAppetite: 'tolerant', weights: { impact: 0.99 } }), [69.3, 'P2']);
  // 平衡的 P3／P4 邊界（不對外，影響 10）：公開利用程式 2 × 10 = 20 ≥ 20；EPSS 0.663×3 = 1.989，× 10 = 19.89，取一位 19.9 < 20
  assert.deepEqual(scored(impact10({ exploit_public: true }, { internet_exposed: false })), [20, 'P3']);
  assert.deepEqual(scored(impact10({ epss_sim: 0.663 }, { internet_exposed: false })), [19.9, 'P4']);
  // 小數一位：可能性 3×0.37 = 1.11，影響 5.2 → 5.772 → 5.8
  assert.deepEqual(scored(caseWith({ vulnerabilities: [vuln({ epss_sim: 0.37 })] })), [5.8, 'P4']);
});

test('信心：缺 0 類為高、1–2 類為中、3 類以上為低；清冊完整度 < 80% 為低', () => {
  const confidenceOf = (params) => findingF1(caseWith(), params).confidence;
  const off = (...names) => ({ inputs: Object.fromEntries(names.map(n => [n, false])) });
  assert.equal(confidenceOf(), '高');
  assert.equal(confidenceOf(off('threatIntel')), '中');
  assert.equal(confidenceOf(off('topology')), '中');                                    // 只缺拓樸也是一類
  assert.equal(confidenceOf(off('threatIntel', 'identities')), '中');
  assert.equal(confidenceOf(off('threatIntel', 'identities', 'topology')), '低');      // topology 缺漏亦計為一類
  assert.equal(confidenceOf({ inventoryCompleteness: 80 }), '高');
  assert.equal(confidenceOf({ inventoryCompleteness: 79 }), '低');
  // 清冊不足時每一筆發現都是低，不只 F1（資產 A、B 各一筆，清冊 79% 時兩筆都看得到）
  const twoFindings = caseWith({ assets: [asset('A'), asset('B')], vulnerabilities: [vuln(), vuln({ finding_id: 'F2', asset_id: 'B' })] });
  assert.deepEqual(DEMO.analyze(twoFindings, { inventoryCompleteness: 79 }).findings.map(f => [f.finding_id, f.confidence]), [['F1', '低'], ['F2', '低']]);
});

test('路徑可行性＝入口可能性×0.5 + 最弱節點×0.3 + 身分／設定邊數×1 − (跳數−1)×0.6；無任何發現的節點取 3', () => {
  // internet → A → B，B 是 crown jewel；A 的可能性 5（對外曝露 3 + 公開利用程式 2）
  const path = ({ trust = 'identity', bFindings = [], exploit = true } = {}) => DEMO.analyze(caseWith({
    assets: [EXPOSED, asset('B')], crownJewels: ['B'], vulnerabilities: [vuln({ exploit_public: exploit }), ...bFindings],
    edges: pathAtoB(trust) })).hypotheses[0];
  near(path().feasibility, 3.8);                                           // 5×0.5 + min(5, 3)×0.3 + 1×1 − 1×0.6
  near(path({ trust: 'misconfig' }).feasibility, 3.8);                     // 設定邊也算一條
  near(path({ trust: 'network' }).feasibility, 2.8);                       // 5×0.5 + 3×0.3 + 0 − 0.6
  const zeroOnB = vuln({ finding_id: 'F2', asset_id: 'B', vuln_id: 'TEST-2' });
  near(path({ bFindings: [zeroOnB] }).feasibility, 2.9);                      // B 有發現但可能性 0：5×0.5 + 0 + 1 − 0.6
  near(path({ trust: 'network', bFindings: [zeroOnB], exploit: false }).feasibility, 0.9); // 3×0.5 + 0 + 0 − 0.6
});

test('身分弱點：MFA 未啟用或部分啟用，或超過 90 天未登入（90 天不算、91 天算）', () => {
  const withIdentity = (fields) => likelihoodOf(caseWith({ assets: [EXPOSED], identities: [identity(1, fields)] }));
  near(withIdentity({ mfa_enabled: false }), 3.8);                         // 3 + min(2, 1)×0.8
  near(withIdentity({ mfa_enabled: 'partial' }), 3.8);                     // 3 + min(2, 1)×0.8
  near(withIdentity({ last_login_days: 90 }), 3);                          // MFA 啟用、90 天：不算
  near(withIdentity({ last_login_days: 91 }), 3.8);                        // MFA 啟用、91 天 > 90：3 + 0.8
  near(withIdentity({ mfa_enabled: false, linked_assets: 'B;A' }), 3.8);   // linked_assets 以分號分隔
  near(withIdentity({ mfa_enabled: false, linked_assets: 'B' }), 3);       // 沒連到 A
});
