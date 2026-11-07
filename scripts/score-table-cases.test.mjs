// score-table-cases.test.mjs — 分數表的共用案例：示範引擎 scoreTable／scoreTableSection 這一份（#230、ADR 0010）
// Python 分析工作流程核心的 score_table／score_table_section 讀同一份 tests/fixtures/score-table-cases.json（tests/python/test_score_table.py），
// 後端代理與 API 腳本送給模型的分數表因此格式相同；兩份實作只改一份時，其中一邊會失敗。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const DEMO = require('../assets/demo.js');
const FIXTURE = JSON.parse(readFileSync(new URL('../tests/fixtures/score-table-cases.json', import.meta.url), 'utf8'));

for (const c of FIXTURE.cases) {
  test(`共用分數表案例（示範引擎）：${c.name}`, () => {
    if (c.expected === 'unscorable') assert.throws(() => DEMO.scoreTable(structuredClone(c.bundle)), /分數不是有限數字|finding_id 重複/);
    else assert.deepEqual(DEMO.scoreTable(structuredClone(c.bundle)), c.expected);
  });
}

test('分數表區塊（示範引擎）：說明是共用案例的字面值，接著是縮排 1 的 JSON 區塊，跟 Python 的 score_table_section 逐字相同', () => {
  const table = FIXTURE.cases[0].expected;
  assert.equal(DEMO.scoreTableSection(table), FIXTURE.section);
});
