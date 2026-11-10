// score-problems-cases.test.mjs — 模型輸出跟分數表對照的共用案例：scripts/output-verdict.mjs 的 scoreTableProblems 這一份（#247、ADR 0010、#275）
// Python 分析工作流程核心的 score_table_problems 讀同一份 tests/fixtures/score-problems-cases.json（tests/python/test_score_table.py），
// 後端代理與 API 腳本因此用同一條規則判斷模型有沒有照用分數表；兩份實作只改一份時，其中一邊會失敗。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreTableProblems } from './output-verdict.mjs';
import { readFileSync } from 'node:fs';

const FIXTURE = JSON.parse(readFileSync(new URL('../tests/fixtures/score-problems-cases.json', import.meta.url), 'utf8'));

for (const c of FIXTURE.cases) {
  test(`模型輸出跟分數表的對照（輸出判定）：${c.name}`, () => {
    assert.deepEqual(scoreTableProblems(structuredClone(c.output), FIXTURE.table), c.expected);
  });
}
