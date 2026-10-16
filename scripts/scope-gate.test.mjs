// 授權範圍守門的 JS schema 解讀（assets/scope-gate.js，見 docs/adr/0004）：規則只來自 input-schema.json 的 scope 定義。
// 共用案例的判定另見 scope-cases.test.mjs（示範引擎與選用後端代理都委派給它）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const GATE = require('../assets/scope-gate.js');

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
