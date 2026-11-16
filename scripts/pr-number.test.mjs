// pr-number.test.mjs — --pr 的 PR 編號判定（scripts/pr-number.mjs）的單元測試
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrNumber } from './pr-number.mjs';

test('parsePrNumber：正整數字串回傳數字', () => {
  assert.equal(parsePrNumber('1'), 1);
  assert.equal(parsePrNumber('314'), 314);
});

test('parsePrNumber：0、負數、小數、前導 0、有空白、不是數字、空字串、沒給值都回傳 null', () => {
  for (const arg of ['0', '-1', '3.5', '0314', ' 314', '314 ', 'abc', '#314', '', undefined, 314]) {
    assert.equal(parsePrNumber(arg), null, JSON.stringify(arg));
  }
});
