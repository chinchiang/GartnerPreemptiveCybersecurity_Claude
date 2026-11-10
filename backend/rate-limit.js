// rate-limit.js — 後端代理的速率限制（#158）：每個 key（用戶端 IP）在時間窗內最多放行 limit 次
// 紀錄只在單一實例的記憶體裡，實例之間不共用、重新啟動就清空（範例等級，見 backend/README.md 的「不可直接上線」）。
// 時間由呼叫端傳入，測試不必真的等；每次傳入的 now 不能比上一次小。時鐘倒退時，清除過期紀錄會提早停下，
// 過期的紀錄要等時間追上才清掉（只是晚一點清，紀錄數仍有上限；Workers 的 Date.now() 不會倒退）。dist/worker.js 由 scripts/build-worker.mjs 內嵌，部署的仍是單一檔案、不多 export。
// 這支檔案不能有 import，也只能有 export function：內嵌時拿掉 export 包起來
export function createRateLimiter({ limit, windowMs }) {
  // key → 時間窗內放行過的時間戳。每次放行都先刪再放回去，Map 的順序就是最後一次放行的先後
  const hits = new Map();
  return {
    // 放行就記下這次並回傳 true；時間窗內已經滿了就回傳 false，不記。
    // 先清掉最後一次放行已經過了時間窗的 key：從最舊的開始，碰到還沒過期的就停（後面的都比它新）
    hit(key, now) {
      for (const [k, times] of hits) {
        if (now - times.at(-1) < windowMs) break;
        hits.delete(k);
      }
      const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
      if (recent.length >= limit) return false;
      hits.delete(key);
      hits.set(key, [...recent, now]);
      return true;
    },
    size: () => hits.size
  };
}
