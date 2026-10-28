// audit-regressions.test.mjs — 審查發現的輸出、授權及逐筆缺值回歸案例。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { acceptanceResults, loadAcceptanceContext } from './acceptance.mjs';
import { outputProblems } from './output-schema.mjs';
import { fileURLToPath } from 'node:url';
const context = loadAcceptanceContext(fileURLToPath(new URL('..', import.meta.url)));
const fixture = () => JSON.parse(readFileSync(new URL('../examples/acceptance-fixture.json', import.meta.url)));
const demo = createRequire(import.meta.url)('../assets/demo.js');
const ctx = { window: {} }; vm.runInNewContext(readFileSync(new URL('../data/case.js', import.meta.url), 'utf8'), ctx);
test('不合法的巢狀輸出及空聲明不再被驗收放行，null 也能回報失敗', () => {
  for (const change of [o => o.exposure_priorities.items[0].score = '錯誤', o => o.exposure_priorities.items[0].score = 10000, o => o.exposure_priorities.confidence = '未知', o => o.exposure_priorities.requires_human = 'false', o => o.meta.disclaimer = '']) {
    const o = fixture(); change(o);
    assert.ok(acceptanceResults(o, context).some(r => !r.pass));
  }
  assert.ok(acceptanceResults(null, context).some(r => !r.pass));
});
test('輸出驗證拒絕未知規則', () => assert.throws(() => outputProblems({}, { notSupported: true }), /不支援/));
test('所有授權旗標組合：摘要只建議執行已授權且實際存在的計畫', () => {
  for (const active of [false, true]) for (const external of [false, true]) {
    const data = structuredClone(ctx.window.CASE_DATA);
    Object.assign(data.scope.authorized_scope, { active_testing_authorized: active, external_scanning_authorized: external });
    const r = demo.analyze(data);
    assert.equal(r.summary.decisions.some(d => d.includes('依既有書面授權')), active && external);
  }
  const data = structuredClone(ctx.window.CASE_DATA); data.topology.edges = [];
  data.scope.authorized_scope.active_testing_authorized = true;
  assert.equal(demo.analyze(data).summary.decisions.some(d => d.includes('依既有書面授權')), false);
});
test('逐筆 EPSS／KEV 缺值採 CVSS 替代並下修信心；0 與 false 是有效值', () => {
  const data = structuredClone(ctx.window.CASE_DATA);
  for (const v of data.vulnerabilities) { delete v.epss; delete v.epss_sim; delete v.kev; delete v.kev_sim; }
  const missing = demo.analyze(data);
  assert.ok(missing.findings.every(f => f.confidence === '中' && f.missing.includes('EPSS/KEV（改用 CVSS 近似）')));
  for (const v of data.vulnerabilities) { v.epss = 0; v.kev = false; }
  assert.ok(demo.analyze(data).findings.every(f => f.confidence === '高'));
});

test('共用輸出案例在 JS 與 Python 使用同一份規格', () => {
  const cases = JSON.parse(readFileSync(new URL('../tests/fixtures/output-cases.json', import.meta.url)));
  for (const c of cases) {
    let output = fixture(), node = output;
    for (const key of c.path.slice(0, -1)) node = node[key];
    if (c.path.length) node[c.path.at(-1)] = c.value; else output = c.value;
    assert.equal(outputProblems(output, context.outputSchema).length === 0, c.valid, c.name);
  }
});
test('後端的資料篩選排除範圍外資產、身分、控制與路徑，且不改動原始資料', () => {
  const gate = createRequire(import.meta.url)('../assets/scope-gate.js');
  const bundle = { scope: { authorized_scope: { in_scope_assets: ['A01'] } }, assets: [{ asset_id: 'A01' }, { asset_id: 'A02', name: '排除主機' }], vulnerabilities: [{ asset_id: 'A02' }], identities: [{ linked_assets: 'A01;A02' }, { linked_assets: 'A02' }], controls: { controls: [{ coverage_assets: ['A02'], gaps: [] }] }, exposures: { exposures: [{ asset_id: null }, { asset_id: 'A02' }] }, topology: { crown_jewels: ['A02'], edges: [{ from: 'internet', to: 'A01' }, { from: 'A01', to: 'A02' }] } };
  const result = gate.scopedBundle(bundle);
  assert.equal(JSON.stringify(result).includes('A02'), false);
  assert.equal(result.identities[0].linked_assets, 'A01');
  assert.equal(result.topology.edges.length, 1);
  assert.equal(bundle.assets.length, 2);
});
