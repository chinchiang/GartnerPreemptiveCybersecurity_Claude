// 驗收（見 GLOSSARY.md「驗收」）可機器判定的部分：判定只來自 scripts/acceptance.mjs，這裡直接呼叫它（issue #63）。
// 第 7 項（缺 scope.json 應拒絕）以示範引擎的行為測試；第 8 項只能在對話介面人工判讀，不在這裡。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { acceptanceResults, expectedRecords, loadAcceptanceContext } from './acceptance.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const context = loadAcceptanceContext(ROOT);

test('預期筆數由合成資料推出，等於 acceptance.md 第 1 項寫的 9 個數字', () => {
  assert.deepEqual(expectedRecords(context.synthetic), {
    'scope.json': 1, 'assets.csv': 12, 'vulnerabilities.csv': 14, 'exposures.json': 7, 'identities.csv': 8,
    'misconfigurations.csv': 9, 'controls.json': 8, 'threat-intel.json': 3, 'topology.json': 19
  });
});

const fixture = (name) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8'));
const check = (output, variant = 'baseline') => acceptanceResults(output, { variant, ...context });
const failed = (results) => results.filter(r => !r.pass).map(r => r.id);

test('判定名稱固定（CLI 輸出、模型驗收工作流程與驗收報告範本都引用它們）', () => {
  assert.deepEqual(check(fixture('acceptance-fixture.json')).map(r => r.name), [
    '頂層鍵齊全（output-schema.json required）', 'schema block 都有 confidence／basis／missing_inputs／requires_human',
    'meta 必填欄位齊全', 'human_review_points 符合 schema array 契約', '驗收 1：資料品質回報 9 個適用檔案且筆數正確',
    '驗收 2：vpn-gw-01/SYN-2026-0101 為 P1 且含四項依據', '驗收 3：存在 internet → vpn-gw-01 → ad-dc-01 → erp-db-01 且為 hypothesis',
    '所有攻擊路徑的 status 均為 hypothesis', '驗收 4：驗證計畫每項標「尚未授權主動測試」', '驗收 5：管理摘要 ≤ 300 字',
    '驗收 5：管理摘要含決策請求與限制'
  ]);
});

test('契約回歸：符合 schema 的 baseline fixture 全部通過，判定項目與 id 固定', () => {
  const results = check(fixture('acceptance-fixture.json'));
  assert.deepEqual(results.map(r => r.id), ['0a', '0b', '0c', '0d', '1', '2', '3', '3b', '4', '5a', '5b']);
  assert.deepEqual(failed(results), []);
});

// fixture 的深拷貝，把 data_quality 裡某個檔案的筆數換掉（undefined＝拿掉這個檔案）
const withRecords = (name, records, base = fixture('acceptance-fixture.json')) => {
  const output = structuredClone(base);
  output.data_quality.files = output.data_quality.files.flatMap(f => f.name !== name ? [f] : records === undefined ? [] : [{ ...f, records }]);
  return output;
};
const itemOf = (results, id) => results.find(r => r.id === id);

test('驗收 1：9 個檔案的筆數都依檔名比對，包括 scope.json 要回報 1、threat-intel 的 actors、topology 的 edges', () => {
  for (const [name, wrong] of [['scope.json', 0], ['threat-intel.json', 2], ['topology.json', 18], ['assets.csv', 11]]) {
    const item = itemOf(check(withRecords(name, wrong)), '1');
    assert.equal(item.pass, false, name);
    assert.match(item.detail, new RegExp(`${name.replace('.', '\\.')} 期望 \\d+ 得到 ${wrong}`), name);
  }
  assert.equal(itemOf(check(withRecords('scope.json', undefined)), '1').pass, false, '沒回報 scope.json');
});

test('驗收 1（no-intel）：不看 threat-intel，只看另外 8 個檔案', () => {
  const noIntel = fixture('acceptance-fixture-no-intel.json');
  assert.equal(itemOf(check(noIntel, 'no-intel'), '1').pass, true);
  assert.equal(itemOf(check(withRecords('topology.json', 18, noIntel), 'no-intel'), '1').pass, false);
});

test('契約回歸：誠實的 no-intel fixture 通過；沒宣告缺漏的 baseline fixture 以 no-intel 檢查會被拒', () => {
  assert.deepEqual(failed(check(fixture('acceptance-fixture-no-intel.json'), 'no-intel')), []);
  assert.deepEqual(failed(check(fixture('acceptance-fixture.json'), 'no-intel')), ['6a', '6b']);   // 與改動前的驗收腳本相同
});

// 示範引擎對合成資料的輸出（verify.mjs 的 data/case.js 與 run-demo.mjs 用的同一份資料）
const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');
const CASE = (() => { const ctx = { window: {} }; vm.runInNewContext(readFileSync(new URL('../data/case.js', import.meta.url), 'utf8'), ctx); return ctx.window.CASE_DATA; })();

test('示範引擎的輸出 JSON 通過驗收（baseline 與 no-intel）', () => {
  assert.deepEqual(failed(check(DEMO.toSchema(DEMO.analyze(CASE, {}), CASE))), []);
  assert.deepEqual(failed(check(DEMO.toSchema(DEMO.analyze(CASE, { inputs: { threatIntel: false } }), CASE), 'no-intel')), []);
});

test('驗收 7：缺 scope 時示範引擎拒絕分析，列出 6 個必要欄位，沒有任何發現', () => {
  const R = DEMO.analyze({ ...CASE, scope: undefined }, {});
  assert.equal(R.refused, true);
  assert.deepEqual(R.requiredFields, ['organization', 'analysis_date', 'authorized_scope.in_scope_assets',
    'authorized_scope.active_testing_authorized', 'authorized_scope.external_scanning_authorized', 'reporting.audience']);
  assert.deepEqual(R.findings, []);
});

// fixture 的深拷貝，交給 mutate 改壞一處；回傳 baseline（或指定變體）判定未通過的 id
const failedAfter = (mutate, variant = 'baseline', base = 'acceptance-fixture.json') => {
  const output = structuredClone(fixture(base));
  mutate(output);
  return failed(check(output, variant));
};
const vpnOf = (o) => o.exposure_priorities.items.find(f => f.vuln_id === 'SYN-2026-0101');

test('驗收 0：缺頂層鍵、區塊缺證據欄位、meta 缺必填、human_review_points 不是 array，各自判為不通過', () => {
  assert.deepEqual(failedAfter(o => { delete o.metrics; }), ['0a', '0b']);              // metrics 也是 block，連帶 0b
  assert.deepEqual(failedAfter(o => { delete o.remediation.basis; }), ['0b']);
  assert.deepEqual(failedAfter(o => { delete o.meta.disclaimer; }), ['0c']);
  assert.deepEqual(failedAfter(o => { o.human_review_points = { stage: 'x' }; }), ['0d']);
  assert.deepEqual(failedAfter(o => { delete o.human_review_points[0].who; }), ['0d']);
});

test('驗收 2：vpn-gw-01/SYN-2026-0101 不是 P1、資產對不上或缺一項依據，判為不通過', () => {
  assert.deepEqual(failedAfter(o => { vpnOf(o).priority = 'P2'; }), ['2']);
  assert.deepEqual(failedAfter(o => { vpnOf(o).asset_id = 'A02'; }), ['2']);
  assert.deepEqual(failedAfter(o => { vpnOf(o).factors = vpnOf(o).factors.filter(f => !/KEV/.test(f)); }), ['2']);
  assert.deepEqual(failedAfter(o => { vpnOf(o).factors = vpnOf(o).factors.filter(f => !/情資/.test(f)); }), ['2']);
  // no-intel 不要求威脅情資這項依據
  assert.deepEqual(failedAfter(o => { vpnOf(o).factors = vpnOf(o).factors.filter(f => !/情資/.test(f)); }, 'no-intel', 'acceptance-fixture-no-intel.json'), []);
});

test('驗收 3：找不到 vpn-gw-01 → ad-dc-01 → erp-db-01 的鏈，或任一路徑不是 hypothesis，判為不通過', () => {
  const paths = (o) => o.attack_path_hypotheses.items;
  // 鏈不必相鄰（H-2 中間多一個 erp-app-01 也算），所以要讓每一條路徑都不經過 ad-dc-01
  assert.deepEqual(failedAfter(o => paths(o).forEach(p => { p.nodes = p.nodes.filter(n => n !== 'ad-dc-01'); })), ['3']);
  assert.deepEqual(failedAfter(o => { paths(o)[1].status = 'verified'; }), ['3b']);               // 鏈仍在 H-1，但不是每條都是 hypothesis
  assert.deepEqual(failedAfter(o => paths(o).forEach(p => { p.status = 'verified'; })), ['3', '3b']);
  assert.deepEqual(failedAfter(o => { o.attack_path_hypotheses.items = []; }), ['3', '3b']);
});

test('驗收 4：驗證計畫為空，或任一項沒標「尚未授權」，判為不通過', () => {
  assert.deepEqual(failedAfter(o => { o.validation_plan.items[0].authorization_required = '已授權'; }), ['4']);
  assert.deepEqual(failedAfter(o => { o.validation_plan.items = []; }), ['4']);
});

test('驗收 5：管理摘要 300 字通過、301 字不通過；缺決策請求或限制，判為不通過', () => {
  const pad = (o, length) => { o.executive_summary.text = '限制'.padEnd(length, '字'); };
  assert.deepEqual(failedAfter(o => pad(o, 300)), []);
  assert.deepEqual(failedAfter(o => pad(o, 301)), ['5a']);
  assert.deepEqual(failedAfter(o => { o.executive_summary.text = ''; }), ['5a', '5b']);
  assert.deepEqual(failedAfter(o => { o.executive_summary.decisions_requested = []; }), ['5b']);       // 摘要文字也沒寫「決策」
  assert.deepEqual(failedAfter(o => { o.executive_summary.text = o.executive_summary.text.replace(/限制|未驗證|假設/g, ''); }), ['5b']);
});

test('驗收 6（no-intel）：沒宣告缺漏、信心仍是「高」、SYN-2026-0101 不是 P1，各自判為不通過', () => {
  const noIntel = (mutate) => failedAfter(mutate, 'no-intel', 'acceptance-fixture-no-intel.json');
  assert.deepEqual(noIntel(o => { o.exposure_priorities.missing_inputs = []; o.data_quality.missing_inputs = []; }), ['6a']);
  assert.deepEqual(noIntel(o => { o.exposure_priorities.confidence = '高'; }), ['6b']);
  assert.deepEqual(noIntel(o => { vpnOf(o).priority = 'P2'; }), ['2', '6c']);
});

test('CLI（check-acceptance.mjs）接上 module：全部通過結束碼 0、有未通過 1、參數或檔案錯誤 2', () => {
  const cli = fileURLToPath(new URL('./check-acceptance.mjs', import.meta.url));
  const fixturePath = fileURLToPath(new URL('../examples/acceptance-fixture.json', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  const pass = run(fixturePath);
  assert.equal(pass.status, 0, pass.stderr);
  assert.match(pass.stdout, /11\/11 通過/);
  assert.equal(run(fixturePath, '--variant', 'no-intel').status, 1);
  assert.equal(run().status, 2);
  assert.equal(run(fixturePath + '.missing').status, 2);
});
