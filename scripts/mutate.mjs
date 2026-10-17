#!/usr/bin/env node
/**
 * mutate.mjs — 突變測試：逐一把實作改壞，確認測試會失敗（「抓到」），然後一定還原。
 *
 *   node scripts/mutate.mjs <mutations.json> [--test "<測試指令>"] [--json]
 *
 * mutations.json 是臨時寫的清單（不提交）：[{ "file": "scripts/x.mjs", "from": "原文", "to": "改成", "note": "說明" }]，
 * 路徑相對於目前目錄。測試指令預設 node --test scripts/*.test.mjs，以 shell 執行；結束碼非 0 視為「抓到」。
 * 結束碼：0 全部抓到；1 有存活；2 參數或清單有誤（讀不到、不是 JSON、檔案不存在、原文不是恰好一處）
 * 或測試在突變前就失敗，這時一個檔案都不改。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

// 參數：<清單> [--test "<測試指令>"] [--json]；參數或讀檔有誤一律結束碼 2，不和「有存活」的 1 混在一起
const fail = (message) => { console.error(message); process.exit(2); };
const args = process.argv.slice(2);
let listPath = null;
let testCommand = 'node --test scripts/*.test.mjs';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--test') testCommand = args[++i];
  else if (args[i] !== '--json' && listPath === null) listPath = args[i];
}
if (!listPath || !testCommand) fail('用法：node scripts/mutate.mjs <mutations.json> [--test "<測試指令>"] [--json]');
let mutations;
try { mutations = JSON.parse(readFileSync(listPath, 'utf8')); }
catch (e) { fail(`無法讀取突變清單 ${listPath}：${e.message}`); }

// 先檢查整份清單：每一筆的檔案都讀得到、原文都恰好出現一次，否則一個檔案都不改就中止
const occurrences = (text, from) => text.split(from).length - 1;
const problems = [];
for (const m of mutations) {
  let text;
  try { text = readFileSync(m.file, 'utf8'); } catch (e) { problems.push(`${m.file}：無法讀取（${e.code || e.message}）`); continue; }
  const n = occurrences(text, m.from);
  if (n !== 1) problems.push(`${m.file}：原文${n === 0 ? '找不到' : `不只一處（${n} 處）`}：${m.from}`);
}
if (problems.length) fail(problems.join('\n'));

// 測試以非同步子行程執行，這樣被中斷（SIGINT／SIGTERM）時訊號處理器才跑得到：結束測試、還原正在改的檔案再離開
let current = null;   // 目前改壞的檔案 { file, original } 與測試子行程
let child = null;
const runTests = () => new Promise(resolve => {
  child = spawn(testCommand, { shell: true, stdio: 'ignore', detached: true });
  child.on('exit', code => { child = null; resolve(code); });
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (child) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
    if (current) writeFileSync(current.file, current.original);
    console.error(`\n收到 ${signal}：已還原 ${current ? current.file : '（沒有改動中的檔案）'}`);
    process.exit(130);
  });
}

// 基準：測試在突變之前就必須通過，否則每一種突變都會被誤判成「抓到」
if (await runTests() !== 0) {
  console.error(`測試在突變之前就失敗（${testCommand}），先讓測試通過再做突變`);
  process.exit(2);
}

const results = [];
for (const m of mutations) {
  const original = readFileSync(m.file, 'utf8');
  current = { file: m.file, original };
  try {
    writeFileSync(m.file, original.replace(m.from, () => m.to));
    results.push({ ...m, caught: await runTests() !== 0 });
  } finally {
    writeFileSync(m.file, original);
    current = null;
  }
}

const survived = results.filter(r => !r.caught).length;
if (args.includes('--json')) {
  console.log(JSON.stringify({ total: results.length, caught: results.length - survived, survived, results }, null, 2));
} else {
  for (const r of results) console.log(`${r.caught ? '抓到' : '存活'}  ${r.file}  ${r.note || r.from}`);
  console.log(`\n突變 ${results.length} 種：抓到 ${results.length - survived}、存活 ${survived}`);
}
process.exit(survived ? 1 : 0);
