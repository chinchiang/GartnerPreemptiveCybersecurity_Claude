// demo-output.test.mjs — 示範引擎對合成組織的整份輸出：黃金快照與 items 必填鍵
// 示範引擎對合成組織（data/case.js 的 CASE_DATA）的整份輸出，對上已提交的參考：
// 黃金快照（golden snapshot：examples/demo-snapshot.txt，run-demo.mjs 的輸出），以及 toSchema 輸出的 items 必填鍵（skills/shared/output-schema.json）。行為規則的測試在 scoring.test.mjs、attack-paths.test.mjs，驗收在 acceptance.test.mjs。
// 執行：node --test scripts/demo-output.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const RUN_DEMO = fileURLToPath(new URL('./run-demo.mjs', import.meta.url));
const SNAPSHOT = new URL('../examples/demo-snapshot.txt', import.meta.url);
const SCHEMA = JSON.parse(readFileSync(new URL('../skills/shared/output-schema.json', import.meta.url), 'utf8'));

// 載入方式與 acceptance.test.mjs 相同：引擎用 require（demo.js 自己 require scope-gate.js），只有 data/case.js 放進 vm
const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');
const CASE_DATA = (() => { const ctx = { window: {} }; vm.runInNewContext(readFileSync(new URL('../data/case.js', import.meta.url), 'utf8'), ctx); return ctx.window.CASE_DATA; })();
const ENGINE_JSON = DEMO.toSchema(DEMO.analyze(CASE_DATA, {}), CASE_DATA);

test('示範引擎輸出與 examples/demo-snapshot.txt 一致', () => {
  const actual = execFileSync(process.execPath, [RUN_DEMO], { encoding: 'utf8' }).replace(/\r\n/g, '\n');
  const expected = readFileSync(SNAPSHOT, 'utf8').replace(/\r\n/g, '\n');
  assert.ok(actual === expected,
    '示範引擎輸出已變動：若是刻意變更評分規則，先讓其他測試（評分規則一致性檢查、scoring.test.mjs）通過，再執行 npm run snapshot 更新快照');
});

// 必填鍵從 schema 讀，不手抄；每段至少一筆，空陣列不算通過
for (const section of ['attack_path_hypotheses', 'validation_plan', 'remediation']) {
  test(`${section}.items 每一筆都有 output-schema.json 宣告的必填鍵`, () => {
    const required = SCHEMA.properties[section].properties.items.items.required;
    const items = ENGINE_JSON[section].items;
    assert.ok(items.length > 0, `${section}.items 是空的`);
    assert.deepEqual(items.flatMap((item, i) => required.filter(k => !(k in item)).map(k => `第 ${i + 1} 筆缺 ${k}`)), []);
  });
}

test('稽核 5（#150）：修補狀態三態——有修補、確認無修補、尚未確認（缺少或不是布林值）', () => {
  const actionFor = (value) => {
    const data = structuredClone(CASE_DATA);
    const v = data.vulnerabilities.find(x => x.finding_id === 'F001');
    if (value === undefined) delete v.patch_available; else v.patch_available = value;
    return DEMO.analyze(data).recs.find(r => r.finding_id === 'F001');
  };
  assert.equal(actionFor(true).patch_status, 'available');
  assert.match(actionFor(true).action, /^套用修補（SYN-2026-0101）/);
  assert.equal(actionFor(false).patch_status, 'none');
  assert.match(actionFor(false).action, /^確認無修補：/);
  for (const unknown of [undefined, 'true', null]) {
    const r = actionFor(unknown);
    assert.equal(r.patch_status, 'unknown', String(unknown));
    assert.match(r.action, /^修補狀態未確認：先查閱廠商公告/, String(unknown));
    assert.doesNotMatch(r.action, /無修補/, String(unknown));
    assert.match(r.verify, /^確認修補狀態後再決定修補或緩解/, String(unknown));
  }
});
