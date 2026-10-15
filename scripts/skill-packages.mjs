/**
 * skill-packages.mjs
 * 技能包組裝器（見 GLOSSARY.md）：決定每個技能包包含哪些母本、複本與依賴。
 * interface 以純函式為主——輸入母本內容、回傳結果，寫檔交給呼叫端（目前是 build-worker.mjs；build-data.mjs 之後接上），
 * 因此不碰磁碟就能測試（scripts/skill-packages.test.mjs）。純 Node 內建模組，無第三方相依。
 */

// 核心提示詞＝skills/shared/core-prompt.md 裡第一個 ```text 區塊；找不到就拋錯，讓建置中止。
// 只認 LF 換行：呼叫端讀檔後須先把 CRLF 正規化為 LF。
export function extractCorePrompt(md) {
  const m = md.match(/```text\n([\s\S]*?)\n```/);
  if (!m) throw new Error('找不到 core-prompt.md 內的 ```text 區塊');
  return m[1];
}
