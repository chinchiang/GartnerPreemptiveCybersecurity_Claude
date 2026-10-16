// 示範引擎的攻擊路徑假設：從 internet 出發走拓樸的邊到 crown jewel，最多 RULES.feasibility.maxHops（5）跳（見 issue #43）。
// 影響的「可達 crown jewel 之入口」加分比照同一套路徑規則。
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
