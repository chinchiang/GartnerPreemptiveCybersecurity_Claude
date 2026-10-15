// 授權範圍守門的共用案例（tests/fixtures/scope-cases.json）套在網站示範引擎上：
// demo.js 的 scopeProblems 是判定基準，Python 那邊（tests/python/test_scope_gate.py）用同一份案例。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');
const base = JSON.parse(readFileSync(new URL('../examples/synthetic-org/scope.json', import.meta.url), 'utf8'));
const { cases } = JSON.parse(readFileSync(new URL('../tests/fixtures/scope-cases.json', import.meta.url), 'utf8'));

// 依案例的 set／remove 修改一份合成資料 scope 的深拷貝
function applyCase(scope, { set = {}, remove = [] }) {
  const s = structuredClone(scope);
  const walk = (path) => { const keys = path.split('.'); const last = keys.pop(); let node = s; for (const k of keys) { if (typeof node[k] !== 'object' || node[k] === null) node[k] = {}; node = node[k]; } return [node, last]; };
  for (const [path, value] of Object.entries(set)) { const [node, k] = walk(path); node[k] = value; }
  for (const path of remove) { const [node, k] = walk(path); delete node[k]; }
  return s;
}

for (const c of cases) {
  test(`示範引擎守門：${c.name}`, () => {
    assert.deepEqual(DEMO.scopeProblems(applyCase(base, c)), c.problems);
  });
}
