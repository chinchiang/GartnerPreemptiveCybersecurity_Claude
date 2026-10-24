# 技能包組裝器裡讀磁碟的 sourceFilesFrom

技能包組裝器（`skills/` 的母本變成各平臺複本、嵌入區塊與規則說明行的那支 module）以純函式為主，只有一個例外：`sourceFilesFrom(root)` 從磁碟讀出建置的輸入。這個例外是刻意留下的，不打算搬出去。

## 為什麼不搬

`sourceFilesFrom(root)` 把整個 `skills/` 加上 `assets/scope-gate.js` 讀成 `[{ path, content }]`，交給 `generatedFiles()`。建置和技能包組裝器的整合檢查都呼叫它，所以兩邊的輸入一定相同。這是 #120 的要求：建置輸入的組法只寫一份（CODING_STANDARDS §6），不在測試裡另外寫一份走訪。

「需要讀哪些輸入」跟「拿這些輸入產生什麼」，會因為同一個理由一起改：技能包的組成變了。所以兩者放在同一個 module。走訪目錄、POSIX 路徑、換行正規化這些跟技能包無關的規則，已經在 `scripts/repo-files.mjs`。

考慮過的搬法都比現狀差：

- **搬到 `repo-files.mjs`**：讀檔工具得知道 `skills/` 的版面和 `scope-gate.js` 的路徑，技能包的知識會進到一支共用工具。
- **另開一支只放讀檔的 module**：輸入的清單和用法分在兩個地方，加一個輸入要改兩支檔案。
- **搬回 `scripts/build-data.mjs`**：建置在頂層就會寫檔，也沒有 export，測試沒辦法 import 它，只能另寫一份組法。

```js
// 組裝器的 interface：除了這一個，都是輸入內容、回傳內容的純函式
export function sourceFilesFrom(root) { /* skills/ ＋ assets/scope-gate.js → [{ path, content }] */ }
export function generatedFiles(files) { /* [{ path, content }] → [{ path, content }] */ }
```

## 什麼時候值得重新考慮

- 讀檔的邏輯開始有自己的判斷，例如依平臺挑檔案，不再只是「一個目錄加幾支檔案」。
- 有第三個呼叫端需要同一組輸入，但不需要組裝器的其他部分。

## 先前的提議

- #127：PR #124 的 Standards 審查提出的 Divergent Change
