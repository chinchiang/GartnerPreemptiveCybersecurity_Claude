// rate-limit.test.mjs — 後端代理的速率限制：每個 key 在時間窗內的次數上限，過期的紀錄不留在記憶體裡（#158）
// 測 backend/rate-limit.js 的 createRateLimiter；時間由呼叫端傳入，不必真的等 60 秒。
// 執行：node --test scripts/rate-limit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../backend/rate-limit.js';

const MINUTE = 60000;

test('同一個 key 在時間窗內前 5 次放行，第 6 次擋下', () => {
  const limiter = createRateLimiter({ limit: 5, windowMs: MINUTE });
  const results = [0, 1000, 2000, 3000, 4000, 5000].map(t => limiter.hit('203.0.113.1', t));
  assert.deepEqual(results, [true, true, true, true, true, false]);
});

test('一個 key 滿了不影響其他 key；最早那次過了時間窗，同一個 key 又能放行', () => {
  const limiter = createRateLimiter({ limit: 5, windowMs: MINUTE });
  for (let t = 0; t < 5; t++) limiter.hit('203.0.113.1', t * 1000);
  assert.equal(limiter.hit('203.0.113.1', 5000), false);
  assert.equal(limiter.hit('203.0.113.2', 5000), true);
  assert.equal(limiter.hit('203.0.113.1', MINUTE - 1), false); // 第 1 次（時間 0）還在時間窗內
  assert.equal(limiter.hit('203.0.113.1', MINUTE), true); // 第 1 次剛好滿 60 秒，不再算
});

test('過了時間窗沒有再來的 key，紀錄會清掉：記錄數不隨見過的 key 總數增加', () => {
  const limiter = createRateLimiter({ limit: 5, windowMs: MINUTE });
  for (let i = 1; i <= 100; i++) limiter.hit(`198.51.100.${i}`, 0);
  assert.equal(limiter.size(), 100);
  limiter.hit('192.0.2.1', MINUTE); // 100 個 key 都已經滿 60 秒
  assert.equal(limiter.size(), 1);
});

test('最早出現、但最近又放行過的 key 不會擋住後面已經過期的 key', () => {
  const limiter = createRateLimiter({ limit: 5, windowMs: MINUTE });
  limiter.hit('203.0.113.1', 0);
  limiter.hit('203.0.113.2', 10000);
  limiter.hit('203.0.113.1', 50000); // .1 最先出現，但最後一次放行比 .2 新
  limiter.hit('203.0.113.3', 70000); // .2 已經滿 60 秒，.1 還沒
  assert.equal(limiter.size(), 2); // 剩 .1 與 .3
  assert.equal(limiter.hit('203.0.113.1', 70000), true); // .1 在時間窗內只有 50000 那一次
});
