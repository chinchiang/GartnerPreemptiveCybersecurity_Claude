// 授權範圍守門的 JS schema 解讀（assets/scope-gate.js，見 docs/adr/0004）：規則只來自 input-schema.json 的 scope 定義。
// 共用案例的判定另見 scope-cases.test.mjs（示範引擎與選用後端代理都委派給它）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { extractCorePrompt, RULE_LINE_LEAD, RULE_NOTE_TARGETS } from './skill-packages.mjs';

const require = createRequire(import.meta.url);
const GATE = require('../assets/scope-gate.js');

test('嵌入的 scope 定義等於母本 input-schema.json 的 properties.scope（手改嵌入區塊或改了母本忘了重建都會失敗）', () => {
  const schema = JSON.parse(readFileSync(new URL('../skills/shared/input-schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(GATE.scopeSchema(), schema.properties.scope);
});

test('必填欄位清單來自 schema，順序與 Python 的 required_scope_fields 相同', () => {
  assert.deepEqual(GATE.requiredScopeFields(), [
    'organization', 'analysis_date', 'authorized_scope.in_scope_assets',
    'authorized_scope.active_testing_authorized', 'authorized_scope.external_scanning_authorized', 'reporting.audience'
  ]);
});

test('schema 用到不認得的關鍵字就丟出錯誤，點名該關鍵字；註記關鍵字放行', () => {
  assert.throws(() => GATE.problemsAgainst('Northwind', { type: 'string', maxLength: 3 }), /maxLength/);
  assert.throws(() => GATE.problemsAgainst('2026-09-08', { type: 'string', format: 'date-time' }), /format/);
  assert.throws(() => GATE.problemsAgainst({ a: 'x' }, { type: 'object', required: ['a'], properties: { a: { type: 'string', enum: ['y'] } } }), /enum/);
  assert.deepEqual(GATE.problemsAgainst('Northwind', { type: 'string', default: 'x', description: '組織名稱', title: '組織', $comment: '註記' }), []);
});

// 規則說明（模型側守門的規則來源，見 docs/adr/0005）：與 Python 的 scope_rule_note 斷言同一個字面字串
const RULE_NOTE = 'organization 須含非空白字元；analysis_date 須為 YYYY-MM-DD 的有效日期；'
  + 'in_scope_assets、audience 須為非空陣列，且每項為非空白字串；'
  + 'active_testing_authorized、external_scanning_authorized 須為布林值';

test('規則說明由嵌入的 scope 定義產生，與 Python 的 scope_rule_note 相同', () => {
  assert.equal(GATE.scopeRuleNote(), RULE_NOTE);
});

// 母本 scope 定義的複本，把某個必填欄位的節點換掉
const withField = (key, node) => { const s = GATE.scopeSchema(); s.properties[key] = node; return s; };

test('規則說明寫不出完整規則的節點就丟出錯誤，點名欄位與關鍵字，不退回比較寬鬆的說明', () => {
  const cases = [
    ['organization', { type: 'string', minLength: 1, pattern: '^[A-Z]' }, /organization.*pattern|pattern.*organization/],
    ['organization', { type: 'string', minLength: 3 }, /minLength/],
    ['analysis_date', { type: 'string', format: 'date', pattern: '^20' }, /analysis_date.*pattern|pattern.*analysis_date/],
    ['organization', { type: 'integer' }, /organization.*type|type.*organization/],
    ['organization', { type: 'object' }, /type/],
    ['organization', { type: 'string', minLength: 1, format: 'email' }, /format/],
    ['organization', { type: 'string', minLength: 1, enum: ['Northwind'] }, /enum/],
    ['organization', { type: 'string', maxLength: 3 }, /maxLength/]
  ];
  for (const [key, node, message] of cases) assert.throws(() => GATE.ruleNoteAgainst(withField(key, node)), message, JSON.stringify(node));
  const scope = GATE.scopeSchema();
  scope.properties.authorized_scope.properties.in_scope_assets = { type: 'array', minItems: 2, items: { type: 'string' } };
  assert.throws(() => GATE.ruleNoteAgainst(scope), /authorized_scope\.in_scope_assets.*minItems|minItems.*authorized_scope\.in_scope_assets/);
  scope.properties.authorized_scope.properties.in_scope_assets = { type: 'array', minItems: 1, items: { type: 'boolean' } };
  assert.throws(() => GATE.ruleNoteAgainst(scope), /items/);
  scope.properties.authorized_scope.properties.in_scope_assets = { type: 'array', minItems: 1, items: { type: 'string', minLength: 2 } };
  assert.throws(() => GATE.ruleNoteAgainst(scope), /minLength/);
});

test('規則說明不受註記關鍵字影響', () => {
  const node = { ...GATE.scopeSchema().properties.organization, default: 'x', description: '組織名稱', title: '組織', $comment: '註記' };
  assert.equal(GATE.ruleNoteAgainst(withField('organization', node)), RULE_NOTE);
});

test('核心提示詞與四份改寫版各有恰好一行規則說明，等於固定開頭＋規則說明＋句號（手改或改了母本忘了重建都會失敗）', () => {
  const expected = `${RULE_LINE_LEAD}${GATE.scopeRuleNote()}。`;
  for (const path of RULE_NOTE_TARGETS) {
    const lines = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').split(/\r?\n/).filter(l => l.startsWith(RULE_LINE_LEAD));
    assert.deepEqual(lines, [expected], path);
  }
  assert.ok(extractCorePrompt(readFileSync(new URL('../skills/shared/core-prompt.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n')).includes(expected),
    '規則說明行要在核心提示詞的 ```text 區塊裡');
});
