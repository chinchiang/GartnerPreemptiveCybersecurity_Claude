#!/usr/bin/env node
/**
 * mutate.mjs — 突變測試：逐一把實作改壞，確認測試會失敗（「抓到」），然後一定還原。
 *
 *   node scripts/mutate.mjs <mutations.json> [--test "<測試指令>"] [--json]
 *
 * mutations.json 是臨時寫的清單（不提交）：[{ "file": "scripts/x.mjs", "from": "原文", "to": "改成", "note": "說明" }]，
 * 路徑相對於目前目錄。測試指令預設 node --test scripts/*.test.mjs，以 shell 執行；結束碼非 0 視為「抓到」。
 * 抓到時從測試輸出列出失敗的 node:test 測試（名稱與檔名，spec 與 TAP 格式都讀；--json 是每筆的 failed），
 * 測試指令不是 node:test 時就不列。
 * 結束碼：0 全部抓到；1 有存活；2 參數或清單有誤（讀不到、不是 JSON、檔案不存在、原文不是恰好一處）
 * 或測試在突變前就失敗，這時一個檔案都不改。
 * 中斷（SIGINT／SIGTERM）時的還原只保證 Linux／macOS：結束測試靠 process.kill(-pid) 送給整個行程群組，Windows 不支援，
 * 測試子行程可能殘留。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isAbsolute, relative } from 'node:path';

// 從測試輸出找出失敗的 node:test 測試 [{ name, file }]，父測試、describe、todo 不算；讀不到（例如不是 node:test）就是 []。
// 兩種格式都讀：spec（Node 24 非 TTY 的預設）讀結尾的 failing tests 那一段，TAP（Node 22 的預設）讀 not ok。
// 已知限制：名稱裡有換行的測試，spec 會漏掉，TAP 列出的名稱是字面的 \n。
export function failingTests(output, cwd = process.cwd()) {
  const file = location => { const path = location.replace(/:\d+:\d+$/, ''); return isAbsolute(path) ? relative(cwd, path) : path; };
  const lines = output.split(/\r?\n/);
  const failed = [];
  const summary = lines.indexOf('✖ failing tests:');
  if (summary !== -1) {
    // 每個失敗的測試是「test at <檔>:<行>:<欄>」接「✖ <名稱> (<ms>ms)」，被取消的沒有耗時；todo 是 ⚠ 開頭
    for (let i = summary + 1; i < lines.length - 1; i++) {
      const at = lines[i].match(/^test at (.+)$/);
      const name = lines[i + 1].match(/^✖ (.*?)(?: \([\d.]+ms\))?$/);
      if (at && name) failed.push({ name: name[1], file: file(at[1]) });
    }
    return failed;
  }
  // TAP：每個 not ok 後面的 YAML 區塊有 location 與 failureType；父測試的 failureType 是 subtestsFailed
  let lastNotOk = null;
  for (const line of lines) {
    const notOk = line.match(/^\s*not ok \d+ - (.*)$/);
    if (notOk) {
      lastNotOk = / # TODO( .*)?$/.test(notOk[1]) ? null : { name: notOk[1].replace(/\\([\\#])/g, '$1'), file: null };
      if (lastNotOk) failed.push(lastNotOk);
    }
    const location = line.match(/^\s*location: '(.+)'$/);
    if (lastNotOk && location) lastNotOk.file = file(location[1]);
    if (lastNotOk && /^\s*failureType: 'subtestsFailed'$/.test(line)) failed.splice(failed.indexOf(lastNotOk), 1);
  }
  return failed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
  // 回傳 { code, output }：output 是 stdout（node --test 的報告寫在這裡），用來找出失敗的測試；等 close（輸出讀完）才算結束
  const runTests = () => new Promise(resolve => {
    // 拿掉 NODE_TEST_CONTEXT：被 node --test 啟動時會繼承它，內層的 node --test 改用子行程模式，測試失敗也以 0 結束
    const { NODE_TEST_CONTEXT, ...env } = process.env;
    child = spawn(testCommand, { shell: true, stdio: ['ignore', 'pipe', 'ignore'], detached: true, env });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('close', code => { child = null; resolve({ code, output }); });
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
  if ((await runTests()).code !== 0) {
    console.error(`測試在突變之前就失敗（${testCommand}），先讓測試通過再做突變`);
    process.exit(2);
  }

  const results = [];
  for (const m of mutations) {
    const original = readFileSync(m.file, 'utf8');
    current = { file: m.file, original };
    try {
      writeFileSync(m.file, original.replace(m.from, () => m.to));
      const { code, output } = await runTests();
      results.push({ ...m, caught: code !== 0, failed: code !== 0 ? failingTests(output) : [] });
    } finally {
      writeFileSync(m.file, original);
      current = null;
    }
  }

  const survived = results.filter(r => !r.caught).length;
  if (args.includes('--json')) {
    console.log(JSON.stringify({ total: results.length, caught: results.length - survived, survived, results }, null, 2));
  } else {
    const red = r => r.failed.length ? `（紅：${r.failed.map(t => `${t.name}［${t.file}］`).join('、')}）` : '';
    for (const r of results) console.log(`${r.caught ? '抓到' : '存活'}  ${r.file}  ${r.note || r.from}${red(r)}`);
    console.log(`\n突變 ${results.length} 種：抓到 ${results.length - survived}、存活 ${survived}`);
  }
  process.exit(survived ? 1 : 0);
}
