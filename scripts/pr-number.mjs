// pr-number.mjs — PR 與議題工具的共用參數判定：--pr、--issue 的編號只收正整數（screenshot-crosscheck、pr-status、pr-cleanup、issue-start 共用）

// 只收沒有前導 0 的正整數字串（例如 "314"）；0、負數、小數、有前導 0、空字串、沒給值都回傳 null，由呼叫端決定怎麼報錯
export function parsePrNumber(arg) {
  return typeof arg === 'string' && /^[1-9]\d*$/.test(arg) ? Number(arg) : null;
}
