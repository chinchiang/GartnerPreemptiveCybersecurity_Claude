// attack-paths.test.mjs — 示範引擎攻擊路徑的跳數上限與入口加分、缺拓樸時不產生路徑、驗證計畫的授權旗標、密集拓樸的分數表耗時
// 示範引擎的攻擊路徑假設：從 internet 出發走拓樸的邊到 crown jewel，最多 RULES.feasibility.maxHops（5）跳（見 issue #43）。
// 影響的「可達 crown jewel 之入口」加分比照同一套路徑規則，但不窮舉路徑，改用可達性搜尋（#248）。
// 以最小的鏈狀資料直接呼叫 analyze，只看輸出的路徑與入口資產的 factors。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');

const IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const asset = (id) => ({ asset_id: id, name: id, type: 'server', business_criticality: 3, data_classification: 'Internal', internet_exposed: id === 'A', environment: 'IT' });
// 入口資產 A 上的一筆弱點：只用來讓 A 有 finding，看得到它的影響加分
const vuln = { finding_id: 'F1', asset_id: 'A', vuln_id: 'TEST-1', cvss_base: 5, exploit_public: false, epss_sim: 0, kev_sim: false };
// 只有拓樸不同的最小資料：沒有身分、控制，crown jewel 由呼叫端指定
const caseWith = (edges, crownJewel) => ({
  scope: { organization: '測試', analysis_date: '2026-10-16', reporting: { audience: ['CISO'] },
           authorized_scope: { in_scope_assets: IDS, active_testing_authorized: false, external_scanning_authorized: false } },
  assets: IDS.map(asset), vulnerabilities: [vuln], identities: [], misconfigurations: [], controls: { controls: [] },
  threatIntel: { actors: [] }, exposures: { exposures: [] }, topology: { crown_jewels: [crownJewel], edges }
});
const edge = (from, to) => ({ from, to, via: '測試', trust: 'network' });
// internet → A → B → … 共 hops 跳，終點是 crown jewel
const chain = (hops) => {
  const nodes = IDS.slice(0, hops);
  return caseWith(nodes.map((to, i) => edge(i === 0 ? 'internet' : nodes[i - 1], to)), nodes[hops - 1]);
};
const hopsOf = (data) => DEMO.analyze(data).hypotheses.map(h => h.hops);
const ENTRY_FACTOR = '可達 crown jewel 之入口（blast radius）';
const entryBonusOf = (data, params) => DEMO.analyze(data, params).findings.find(f => f.asset_id === 'A').factors.includes(ENTRY_FACTOR);

test('恰好 5 跳的鏈產生一條 5 跳的路徑；6 跳、7 跳的鏈不產生路徑', () => {
  assert.deepEqual(hopsOf(chain(5)), [5]);
  assert.deepEqual(hopsOf(chain(6)), []);
  assert.deepEqual(hopsOf(chain(7)), []);
});

test('同一個目標有 5 跳與 6 跳兩條路時，只留 5 跳那條', () => {
  // 短路：internet → A → B → C → D → E；長路：internet → A → F → G → H → D → E
  const edges = [edge('internet', 'A'), edge('A', 'B'), edge('B', 'C'), edge('C', 'D'), edge('D', 'E'),
                 edge('A', 'F'), edge('F', 'G'), edge('G', 'H'), edge('H', 'D')];
  assert.deepEqual(hopsOf(caseWith(edges, 'E')), [5]);
});

test('入口加分比照攻擊路徑的跳數上限：5 跳可達 crown jewel 才加分，6 跳不加', () => {
  assert.equal(entryBonusOf(chain(5)), true);
  assert.equal(entryBonusOf(chain(6)), false);
});

test('入口加分只走清冊看得到的節點：中間節點被隱藏時不加分', () => {
  // internet → A → H → B，crown jewel 是 B；清冊完整度 25% 只看得到排在前面的 A、B，中間的 H 被隱藏
  const data = caseWith([edge('internet', 'A'), edge('A', 'H'), edge('H', 'B')], 'B');
  assert.equal(entryBonusOf(data), true);
  assert.equal(entryBonusOf(data, { inventoryCompleteness: 25 }), false);
});

test('缺拓樸（inputs.topology = false）時不產生路徑假設：資料裡有拓樸也不走', () => {
  assert.deepEqual(hopsOf(chain(2)), [2]);
  assert.deepEqual(DEMO.analyze(chain(2), { inputs: { topology: false } }).hypotheses, []);
});

// 驗證計畫的授權（scoring-rules.md 第 3 節、core-prompt.md：兩旗標「任一為 false 時，S6 驗證計畫的每一項都必須標示『尚未授權主動測試』」）：
// 入口對外或不對外都一樣，兩個旗標缺一不可。chain(2) 的入口 A 對外，internalEntry 把它改成不對外
const withAuth = (data, active, external) => ({ ...data, scope: { ...data.scope,
  authorized_scope: { ...data.scope.authorized_scope, active_testing_authorized: active, external_scanning_authorized: external } } });
const internalEntry = (data) => ({ ...data, assets: data.assets.map(a => a.asset_id === 'A' ? { ...a, internet_exposed: false } : a) });
const requiresOf = (data) => DEMO.analyze(data).validation.map(v => v.requires);
const AUTHORIZED = '已授權主動測試（仍須依書面授權範圍執行）';

test('驗證計畫：主動測試與外部掃描兩個授權旗標缺一不可，入口不對外也一樣', () => {
  assert.deepEqual(requiresOf(withAuth(chain(2), true, false)), ['尚未授權主動測試：需 CISO 另行核准（含外部掃描授權）並排除 OT']);
  assert.deepEqual(requiresOf(withAuth(chain(2), true, true)), [AUTHORIZED]);
  assert.deepEqual(requiresOf(withAuth(chain(2), false, true)), ['尚未授權主動測試：需 CISO 另行核准並排除 OT']);
  assert.deepEqual(requiresOf(withAuth(chain(2), false, false)), ['尚未授權主動測試：需 CISO 另行核准（含外部掃描授權）並排除 OT']);
  // 入口不對外：只差外部掃描授權時仍未授權，說明點名缺的旗標；兩個都缺時不提外部掃描（這一項不做外部驗證）
  assert.deepEqual(requiresOf(withAuth(internalEntry(chain(2)), true, false)), ['尚未授權主動測試：需 CISO 另行核准（含外部掃描授權）並排除 OT']);
  assert.deepEqual(requiresOf(withAuth(internalEntry(chain(2)), true, true)), [AUTHORIZED]);
  assert.deepEqual(requiresOf(withAuth(internalEntry(chain(2)), false, true)), ['尚未授權主動測試：需 CISO 另行核准並排除 OT']);
  assert.deepEqual(requiresOf(withAuth(internalEntry(chain(2)), false, false)), ['尚未授權主動測試：需 CISO 另行核准並排除 OT']);
});

// 輸出 JSON 的 authorization_status（output-schema.json 的 enum，#267）：兩個旗標都是 true 才是「已授權」，其餘都是「尚未授權主動測試」
const statusOf = (data) => DEMO.toSchema(DEMO.analyze(data), data).validation_plan.items.map(v => v.authorization_status);
test('驗證計畫的 authorization_status：兩個授權旗標都是 true 才填「已授權」，入口不對外也一樣（#267）', () => {
  assert.deepEqual(statusOf(withAuth(chain(2), true, true)), ['已授權']);
  assert.deepEqual(statusOf(withAuth(chain(2), true, false)), ['尚未授權主動測試']);
  assert.deepEqual(statusOf(withAuth(chain(2), false, true)), ['尚未授權主動測試']);
  assert.deepEqual(statusOf(withAuth(chain(2), false, false)), ['尚未授權主動測試']);
  assert.deepEqual(statusOf(withAuth(internalEntry(chain(2)), true, true)), ['已授權']);
  assert.deepEqual(statusOf(withAuth(internalEntry(chain(2)), true, false)), ['尚未授權主動測試']);
});

// 密集拓樸（#248）：40 個資產，internet 連到每一個，資產之間兩兩互連，crown jewel 是 D0。
// 窮舉簡單路徑要幾十秒（路徑數約隨資產數的 4 次方成長）；分數表只需要「哪些入口可達 crown jewel」，要在 2 秒內算完。
// 每個資產都有一條直達 D0 的邊（D0 本身是 crown jewel），所以每一項發現都有入口加分。
const DENSE_IDS = Array.from({ length: 40 }, (_, i) => `D${i}`);
const denseBundle = () => ({
  scope: { organization: '測試', analysis_date: '2026-11-08', reporting: { audience: ['CISO'] },
           authorized_scope: { in_scope_assets: DENSE_IDS, active_testing_authorized: false, external_scanning_authorized: false } },
  assets: DENSE_IDS.map(asset),
  vulnerabilities: DENSE_IDS.map((id, i) => ({ ...vuln, finding_id: `F${i}`, asset_id: id })),
  topology: { crown_jewels: ['D0'], edges: [
    ...DENSE_IDS.map(id => edge('internet', id)),
    ...DENSE_IDS.flatMap(from => DENSE_IDS.filter(to => to !== from).map(to => edge(from, to)))
  ] }
});

test('密集拓樸：40 個資產完全連通時，分數表 2 秒內算完，每一項都有入口加分（#248）', () => {
  const started = performance.now();
  const table = DEMO.scoreTable(denseBundle());
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 2000, `scoreTable 花了 ${Math.round(elapsed)} 毫秒`);
  assert.equal(table.findings.length, 40);
  assert.ok(table.findings.every(f => f.factors.includes(ENTRY_FACTOR)), '每一項都有入口加分');
});
