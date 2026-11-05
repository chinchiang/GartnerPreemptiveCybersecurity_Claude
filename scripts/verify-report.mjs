/**
 * verify-report.mjs — 驗證報告的渲染
 * 驗證報告（verify-report.md）的渲染：靜態、瀏覽器、連結三種檢查的結果都由這裡轉成 Markdown（#100）。
 * 純函式：執行時間由呼叫端傳入，同一組結果永遠渲染出同一份文字；單元測試在 verify-report.test.mjs。
 */

// results：[{ name, pass, detail }]，依檢查的順序；mode：報告的「模式」欄（verify.mjs 傳入參數，沒有參數時是 full）；at：ISO 時間字串
export function renderReport(results, { mode, at, incomplete = false }) {
  const passed = results.filter(r => r.pass).length;
  // 所有儲存格的換行改成空白，| 換成 /，避免錯誤訊息破壞 Markdown 表格。
  const cell = text => String(text).replace(/\r\n?|\n/g, ' ').replace(/\|/g, '/');
  const rows = results.map(r => `| ${cell(r.name)} | ${r.pass ? '✅' : '❌'} | ${cell(r.detail)} |`);
  const status = incomplete ? '狀態：未完成（未執行的檢查不列為通過）\n' : '';
  return `# 驗證報告\n\n執行時間：${at}\n模式：${mode}\n${status}結果：${passed}/${results.length} 通過\n\n| 檢查 | 結果 | 說明 |\n|---|---|---|\n${rows.join('\n')}\n`;
}

/** 兩份報告除了「執行時間：」那一行（renderReport 每次都寫不同的時間），其餘是否逐行相同。
    CI 比對已提交的報告、full-check.mjs 決定 --browser 之後要不要還原報告，都用這一份判定（#139）。 */
export function sameReportIgnoringRunTime(a, b) {
  const withoutRunTime = (text) => text.split('\n').filter(line => !line.startsWith('執行時間：')).join('\n');
  return withoutRunTime(a) === withoutRunTime(b);
}
