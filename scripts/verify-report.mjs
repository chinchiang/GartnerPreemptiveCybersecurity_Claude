/**
 * verify-report.mjs — 驗證報告的渲染
 * 驗證報告（verify-report.md）的渲染：靜態、瀏覽器、連結三種檢查的結果都由這裡轉成 Markdown（#100）。
 * 純函式：執行時間由呼叫端傳入，同一組結果永遠渲染出同一份文字；單元測試在 verify-report.test.mjs。
 */

// results：[{ name, pass, detail }]，依檢查的順序；mode：報告的「模式」欄（verify.mjs 傳入參數，沒有參數時是 full）；at：ISO 時間字串
export function renderReport(results, { mode, at }) {
  const passed = results.filter(r => r.pass).length;
  // 說明裡的 | 會切斷 Markdown 表格的欄位，換成 /
  const rows = results.map(r => `| ${r.name} | ${r.pass ? '✅' : '❌'} | ${r.detail.replace(/\|/g, '/')} |`);
  return `# 驗證報告\n\n執行時間：${at}\n模式：${mode}\n結果：${passed}/${results.length} 通過\n\n| 檢查 | 結果 | 說明 |\n|---|---|---|\n${rows.join('\n')}\n`;
}
