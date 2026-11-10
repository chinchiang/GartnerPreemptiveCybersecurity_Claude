// verdict-cases.test.mjs — 輸出判定的共用案例：scripts/output-verdict.mjs 的 outputVerdict 這一份（#275）
// Python 分析工作流程核心的 output_verdict 讀同一份 tests/fixtures/verdict-cases.json（tests/python/test_output_verdict.py），
// 後端代理與 API 腳本因此用同一個判定順序；兩份實作只改一份時，其中一邊會失敗。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { outputVerdict } from './output-verdict.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const FIXTURE = read('../tests/fixtures/verdict-cases.json');
const SCHEMA = read('../skills/shared/output-schema.json');
const BASE = read('../examples/acceptance-fixture.json');

function applyChanges(changes) {
  const output = structuredClone(BASE);
  for (const [path, value] of changes) {
    const node = path.slice(0, -1).reduce((n, key) => n[key], output);
    node[path.at(-1)] = value;
  }
  return output;
}

for (const c of FIXTURE.cases) {
  test(`輸出判定（JS）：${c.name}`, () => {
    const table = c.with_table ? structuredClone(FIXTURE.table) : null;
    assert.deepEqual(outputVerdict(applyChanges(c.changes), SCHEMA, table), c.expected);
  });
}
