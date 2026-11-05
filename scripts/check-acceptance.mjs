#!/usr/bin/env node
/**
 * check-acceptance.mjs — 驗收的 CLI
 * 對「真實模型輸出」執行可機器判定的驗收項目。
 *
 *   node scripts/check-acceptance.mjs output/chatgpt-output.json
 *   node scripts/check-acceptance.mjs output/chatgpt-output.json --variant no-intel
 *   node scripts/check-acceptance.mjs output/chatgpt-output.json --variant injection
 *   node scripts/check-acceptance.mjs output/chatgpt-output.json --json
 *
 * 結束碼：0 全部通過、1 有未通過、2 參數或檔案錯誤。變體只認得 acceptance.mjs 的 VARIANTS（baseline、no-intel、injection）：
 * 名稱寫錯、--variant 後面沒有值、用 --variant=<名稱> 的寫法，都以結束碼 2 中止並列出可用的名稱，不會當成 baseline。
 *
 * 對應 skills/shared/acceptance.md（各平臺 references/acceptance.md 為其複本）的 9 項驗收；判定在 scripts/acceptance.mjs：
 *   1–5   baseline 變體
 *   6     no-intel 變體（另加 --variant no-intel）
 *   7     移除 scope.json 應拒絕分析 —— 由呼叫端檢查分析腳本是否以非零狀態結束，不在判定裡
 *   8     scope 不合格應拒絕分析 —— 腳本在呼叫 API 前就中止（授權範圍守門的測試涵蓋）；模型層在對話介面人工判讀，不在判定裡
 *   9     injection 變體（另加 --variant injection；變體由 injection-variant.mjs 產生）：不遵循輸入資料裡的指令
 *
 * 刻意不檢查的部分（需要人工判讀，見 docs/evidence/model-acceptance-template.md）：
 *   摘要的中文品質與可讀性、改善建議是否合理、補償控制與核准層級是否恰當、遮罩是否足夠。
 *
 * 判定只來自 scripts/acceptance.mjs（驗收 module）；這支 CLI 只解析參數、讀檔、印結果、決定結束碼。
 * 本腳本只讀 JSON，不呼叫任何 API、不需要金鑰。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptanceResults, loadAcceptanceContext, VARIANTS } from './acceptance.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = `用法：node scripts/check-acceptance.mjs <output.json> [--variant ${VARIANTS.join('|')}] [--json]`;
// 參數或檔案錯誤一律結束碼 2，不和「有未通過」的 1 混在一起
const fail = (message) => { console.error(`${message}\n${USAGE}`); process.exit(2); };

// 變體寫錯、漏掉值或用等號寫法，都不能默默當成 baseline（那會跳過第 6、9 項，看起來像通過，#172）
const args = process.argv.slice(2);
let file;
let variant = 'baseline';
let asJson = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--variant') {
    const value = args[++i];
    if (value === undefined || value.startsWith('--')) fail(`--variant 後面要接變體名稱（${VARIANTS.join('、')}）`);
    if (!VARIANTS.includes(value)) fail(`不認得的驗收變體「${value}」，可用的是 ${VARIANTS.join('、')}`);
    variant = value;
  } else if (a.startsWith('--variant=')) fail(`請改用「--variant <名稱>」，不支援等號寫法：${a}`);
  else if (a === '--json') asJson = true;
  else if (!a.startsWith('--') && file === undefined) file = a;
}

if (!file) fail('缺少輸出檔的路徑');

let obj;
try { obj = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error(`無法解析 ${file}：${e.message}`); process.exit(2); }

const results = acceptanceResults(obj, { variant, ...loadAcceptanceContext(ROOT) });

// ---------- 輸出 ----------
const passed = results.filter(r => r.pass).length;
if (asJson) {
  console.log(JSON.stringify({ file, variant, passed, total: results.length, results }, null, 2));
} else {
  console.log(`驗收檢查：${file}（變體 ${variant}）\n`);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n${passed}/${results.length} 通過`);
}
process.exit(passed === results.length ? 0 : 1);
