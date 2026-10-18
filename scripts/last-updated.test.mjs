// 最後更新時間的顯示格式（assets/last-updated.js，瀏覽器與 Node 共用）：固定換算成臺北時間（UTC+8），
// 「YYYY-MM-DD HH:mm（UTC+8）」；時間是空的或不合法時回 null，畫面上就整個不顯示。預期值都是手算的字面值。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// 固定一個不是 UTC 也不是 UTC+8 的時區：CI 跑在 UTC，誤用執行環境時區的 getHours() 等在那裡會和 getUTCHours() 剛好相等而抓不到，
// 讀者的瀏覽器卻幾乎都不在 UTC
process.env.TZ = 'America/New_York';

const require = createRequire(import.meta.url);
const { formatLastUpdated } = require('../assets/last-updated.js');

test('UTC 的時間換算成臺北時間，到分鐘', () => {
  assert.equal(formatLastUpdated('2026-10-18T06:32:05+00:00'), '2026-10-18 14:32（UTC+8）');
});

test('跨日：UTC 前一天 16:30 是臺北隔天 00:30', () => {
  assert.equal(formatLastUpdated('2026-10-17T16:30:00+00:00'), '2026-10-18 00:30（UTC+8）');
});

test('本來就是 +08:00 的時間不重複加時差', () => {
  assert.equal(formatLastUpdated('2026-10-18T14:32:05+08:00'), '2026-10-18 14:32（UTC+8）');
});

test('秒數直接捨去，不四捨五入：14:32:59 還是 14:32', () => {
  assert.equal(formatLastUpdated('2026-10-18T06:32:59+00:00'), '2026-10-18 14:32（UTC+8）');
});

test('空字串、沒有值或不是時間：回 null（畫面上整個不顯示）', () => {
  for (const empty of ['', undefined, null, 'yesterday', '2026', '2026-02-30T00:00:00+00:00']) assert.equal(formatLastUpdated(empty), null, `應該回 null：${empty}`);
});
