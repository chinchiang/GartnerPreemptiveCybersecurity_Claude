// mutate.test.mjs — 突變工具的測試：CLI 以子行程跑暫存目錄底下的小專案
// 突變工具（scripts/mutate.mjs）：吃一份臨時的突變清單，逐一改壞、跑測試、一定還原。
// CLI 以子行程跑，對象是暫存目錄底下的小專案：calc.js 加一支會檢查它的 check.js；
// 從測試輸出找出失敗測試的 failingTests、產生突變紀錄表格的 markdownTable 直接呼叫。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { failingTests, markdownTable } from './mutate.mjs';

const MUTATE = fileURLToPath(new URL('./mutate.mjs', import.meta.url));
const CALC = 'module.exports = (a, b) => a + b;\n';
// 給預設測試指令（node --test scripts/*.test.mjs）跑的 node:test 檔
const CALC_TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { createRequire } from 'node:module';\n" +
  "test('1 + 2 = 3', () => assert.equal(createRequire(import.meta.url)('../calc.js')(1, 2), 3));\n" +
  "test('calc 是函式', () => assert.equal(typeof createRequire(import.meta.url)('../calc.js'), 'function'));\n";

// 回傳小專案的目錄；mutations 寫成 mutations.json；nodeTest 時多放給 node --test 跑的 scripts/calc.test.mjs
function project(mutations, { nodeTest = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mutate-test-'));
  writeFileSync(join(dir, 'calc.js'), CALC);
  writeFileSync(join(dir, 'check.js'), "process.exit(require('./calc.js')(1, 2) === 3 ? 0 : 1);\n");
  writeFileSync(join(dir, 'mutations.json'), JSON.stringify(mutations));
  if (nodeTest) {
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts', 'calc.test.mjs'), CALC_TEST);
  }
  return dir;
}
const run = (dir, ...args) => spawnSync(process.execPath, [MUTATE, 'mutations.json', '--test', 'node check.js', ...args], { cwd: dir, encoding: 'utf8' });

test('突變被測試抓到：結束碼 0，檔案還原', () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }]);
  try {
    const r = run(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /抓到\s+calc\.js\s+加法改減法$/m);   // node check.js 不是 node:test：不列失敗的測試
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('突變照字面寫入：to 裡的 $&、$$ 不當替換樣式展開（寫入的內容與清單、--json 紀錄一致）', () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b /* $& $$ */', note: '含替換樣式的字元' }]);
  try {
    // 測試指令先把它讀到的 calc.js 存成 seen.txt；最後一次執行是突變那一次
    writeFileSync(join(dir, 'save.js'), "require('fs').copyFileSync(__dirname + '/calc.js', __dirname + '/seen.txt');\n");
    const r = spawnSync(process.execPath, [MUTATE, 'mutations.json', '--test', 'node save.js && node check.js'], { cwd: dir, encoding: 'utf8' });
    assert.equal(readFileSync(join(dir, 'seen.txt'), 'utf8'), 'module.exports = (a, b) => a - b /* $& $$ */;\n', r.stdout + r.stderr);
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('不給 --test：用預設測試指令 node --test scripts/*.test.mjs', () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }], { nodeTest: true });
  try {
    const r = spawnSync(process.execPath, [MUTATE, 'mutations.json'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /抓到\s+calc\.js\s+加法改減法/);
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('被 node --test 啟動時（繼承了 NODE_TEST_CONTEXT）：預設測試指令的失敗照樣算抓到', () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }], { nodeTest: true });
  try {
    const r = spawnSync(process.execPath, [MUTATE, 'mutations.json'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: 'child-v8' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /抓到\s+calc\.js\s+加法改減法/);
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('抓到時列出失敗的測試（附檔名）：只列紅的那個，--json 也有', () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }], { nodeTest: true });
  try {
    const text = spawnSync(process.execPath, [MUTATE, 'mutations.json'], { cwd: dir, encoding: 'utf8' });
    assert.match(text.stdout, /抓到\s+calc\.js\s+加法改減法（紅：1 \+ 2 = 3［scripts\/calc\.test\.mjs］）$/m, text.stdout + text.stderr);
    assert.doesNotMatch(text.stdout, /calc 是函式/);
    const json = spawnSync(process.execPath, [MUTATE, 'mutations.json', '--json'], { cwd: dir, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(json.stdout).results[0].failed, [{ name: '1 + 2 = 3', file: 'scripts/calc.test.mjs' }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('測試指令結束後才寫完的輸出也讀得到：等輸出讀完（close）才判定，不是行程一結束（exit）', () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }], { nodeTest: true });
  try {
    // late.js 帶著測試的結束碼先結束，報告由背景行程 0.3 秒後才寫出。用 node 寫而不是 shell，Windows 的 cmd.exe 也能跑；
    // 背景行程要 detached，否則在 Windows 會隨 late.js 一起被結束（libuv 把子行程放在父行程結束時一併結束的 job object）
    writeFileSync(join(dir, 'late.js'),
      "const fs = require('fs');\nconst { spawnSync, spawn } = require('child_process');\n" +
      "const { status } = spawnSync(process.execPath, ['--test', 'scripts/calc.test.mjs'], { stdio: ['ignore', fs.openSync('out.txt', 'w'), 'ignore'] });\n" +
      "spawn(process.execPath, ['-e', \"setTimeout(() => process.stdout.write(require('fs').readFileSync('out.txt')), 300)\"], { stdio: ['ignore', 'inherit', 'ignore'], detached: true }).unref();\n" +
      "process.exit(status);\n");
    const r = spawnSync(process.execPath, [MUTATE, 'mutations.json', '--test', 'node late.js'], { cwd: dir, encoding: 'utf8' });
    assert.match(r.stdout, /抓到\s+calc\.js\s+加法改減法（紅：1 \+ 2 = 3［scripts\/calc\.test\.mjs］）$/m, r.stdout + r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('有突變存活：結束碼 1，點名存活的那一種', () => {
  const dir = project([
    { file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' },
    { file: 'calc.js', from: '(a, b) =>', to: '(a, b, c) =>', note: '多一個參數' }   // 行為不變，測試抓不到
  ]);
  try {
    const r = run(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /存活\s+calc\.js\s+多一個參數/);
    assert.match(r.stdout, /突變 2 種：抓到 1、存活 1/);
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('原文找不到或不只一處：結束碼 2，一個檔案都不改', () => {
  for (const [from, label] of [['a * b', '找不到'], ['a', '不只一處']]) {
    const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '正常的一筆' }, { file: 'calc.js', from, to: 'x', note: label }]);
    try {
      const r = run(dir);
      assert.equal(r.status, 2, `${label}：${r.stdout}${r.stderr}`);
      assert.match(r.stderr, new RegExp(label));
      assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('測試在突變之前就失敗：結束碼 2，不做任何突變（否則每一種都會被誤判成抓到）', () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a * b', note: '加法改乘法' }]);
  try {
    writeFileSync(join(dir, 'check.js'), 'process.exit(1);\n');
    const r = run(dir);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /突變之前/);
    assert.doesNotMatch(r.stdout, /抓到/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('跑測試時被中斷（SIGTERM）：檔案仍然還原，測試子行程也結束', { skip: process.platform === 'win32' && 'Windows 上 SIGTERM 不會觸發訊號處理器，中斷時的還原只保證 Linux／macOS' }, async () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }]);
  try {
    // 讀到突變後的 calc.js 就記下自己的 pid、睡 10 秒，留時間送出中斷
    writeFileSync(join(dir, 'check.js'),
      "const fs = require('fs');\nconst src = fs.readFileSync(__dirname + '/calc.js', 'utf8');\n" +
      "if (src.includes('a - b')) { fs.writeFileSync(__dirname + '/check.pid', String(process.pid)); setTimeout(() => process.exit(1), 10000); }\n");
    const child = spawn(process.execPath, [MUTATE, 'mutations.json', '--test', 'node check.js'], { cwd: dir, stdio: 'ignore' });
    const pidFile = join(dir, 'check.pid');
    for (let i = 0; i < 100 && !existsSync(pidFile); i++) await new Promise(r => setTimeout(r, 50));
    assert.ok(existsSync(pidFile), '突變後的測試沒有開始');
    const pid = Number(readFileSync(pidFile, 'utf8'));
    const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal })));
    child.kill('SIGTERM');
    const { code } = await exited;
    assert.notEqual(code, 0);
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
    // 測試子行程（shell 底下的 node check.js）也要結束，不能留著跑完 10 秒；SIGKILL 送達與回收需要一點時間
    const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
    for (let i = 0; i < 40 && alive(); i++) await new Promise(r => setTimeout(r, 50));
    assert.ok(!alive(), `測試子行程 ${pid} 在中斷後還在執行`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// 逾時用：calc.js 裡有 hang 時，測試留下一個 setInterval 永遠不結束；否則照常檢查 calc.js
const HANGING_CHECK = "const fs = require('fs');\n" +
  "if (fs.readFileSync(__dirname + '/calc.js', 'utf8').includes('hang')) setInterval(() => {}, 1000);\n" +
  "else process.exit(require('./calc.js')(1, 2) === 3 ? 0 : 1);\n";
const HANG = { file: 'calc.js', from: '(a, b) =>', to: '(a, b, hang) =>', note: '留下計時器' };
const CAUGHT = { file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' };
// 實作壞掉時測試會卡住：每次執行都設 30 秒的保險，讓它以失敗結束
const SAFETY = 30000;

test('--timeout：測試超過時間就記成逾時、檔案還原，接著跑下一筆；有逾時就以結束碼 1 結束', () => {
  const dir = project([HANG, CAUGHT]);
  try {
    writeFileSync(join(dir, 'check.js'), HANGING_CHECK);
    const r = spawnSync(process.execPath, [MUTATE, 'mutations.json', '--test', 'node check.js', '--timeout', '1'], { cwd: dir, encoding: 'utf8', timeout: SAFETY });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /逾時\s+calc\.js\s+留下計時器$/m);
    assert.match(r.stdout, /抓到\s+calc\.js\s+加法改減法$/m);
    assert.match(r.stdout, /突變 2 種：抓到 1、存活 0、逾時 1/);
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--timeout 的逾時在 --json 是 timedOut: true、caught: false，頂層有逾時的總數；--markdown 的結果欄寫「逾時」、紅的測試空白', () => {
  const dir = project([HANG, CAUGHT]);
  try {
    writeFileSync(join(dir, 'check.js'), HANGING_CHECK);
    const runWith = format => spawnSync(process.execPath, [MUTATE, 'mutations.json', '--test', 'node check.js', '--timeout', '1', format], { cwd: dir, encoding: 'utf8', timeout: SAFETY });
    const json = runWith('--json');
    assert.equal(json.status, 1, json.stdout + json.stderr);
    const parsed = JSON.parse(json.stdout);
    assert.deepEqual({ ...parsed, results: undefined }, { total: 2, caught: 1, survived: 0, timedOut: 1, results: undefined });
    assert.deepEqual(parsed.results[0], { ...HANG, caught: false, timedOut: true, failed: [] });
    assert.equal(parsed.results[1].timedOut, false);
    const markdown = runWith('--markdown');
    assert.equal(markdown.status, 1, markdown.stdout + markdown.stderr);
    assert.equal(markdown.stdout, '突變 2 種：抓到 1、存活 0、逾時 1\n\n| 突變 | 結果 | 紅的測試 |\n|---|---|---|\n' +
      '| 留下計時器 | 逾時 |  |\n| 加法改減法 | 抓到 | （沒有 node:test 的名稱） |\n');
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--timeout：測試在突變之前就逾時，以結束碼 2 結束、說明逾時的秒數與測試指令，一個檔案都不改', () => {
  const dir = project([CAUGHT]);
  try {
    writeFileSync(join(dir, 'check.js'), 'setInterval(() => {}, 1000);\n');
    const r = spawnSync(process.execPath, [MUTATE, 'mutations.json', '--test', 'node check.js', '--timeout', '1.5'], { cwd: dir, encoding: 'utf8', timeout: SAFETY });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /突變之前.*逾時.*1\.5 秒.*node check\.js/);
    assert.doesNotMatch(r.stdout, /抓到/);
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--timeout 逾時之後，測試子行程已經結束，不會殘留（Linux／macOS 結束行程群組，Windows 用 taskkill 結束行程樹）', async () => {
  const dir = project([HANG]);
  try {
    // 讀到突變後的 calc.js 就記下自己的 pid，再留下計時器不結束
    writeFileSync(join(dir, 'check.js'),
      "const fs = require('fs');\n" +
      "if (fs.readFileSync(__dirname + '/calc.js', 'utf8').includes('hang')) { fs.writeFileSync(__dirname + '/check.pid', String(process.pid)); setInterval(() => {}, 1000); }\n");
    const r = spawnSync(process.execPath, [MUTATE, 'mutations.json', '--test', 'node check.js', '--timeout', '1'], { cwd: dir, encoding: 'utf8', timeout: SAFETY });
    assert.match(r.stdout, /逾時\s+calc\.js\s+留下計時器$/m, r.stdout + r.stderr);
    const pid = Number(readFileSync(join(dir, 'check.pid'), 'utf8'));
    const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
    for (let i = 0; i < 40 && alive(); i++) await new Promise(res => setTimeout(res, 50));
    assert.ok(!alive(), `測試子行程 ${pid} 在逾時之後還在執行`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--json：輸出可解析的紀錄（給 PR 說明用），結束碼照舊', () => {
  const dir = project([
    { file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' },
    { file: 'calc.js', from: '(a, b) =>', to: '(a, b, c) =>', note: '多一個參數' }
  ]);
  try {
    const r = run(dir, '--json');
    assert.equal(r.status, 1);
    assert.deepEqual(JSON.parse(r.stdout), {
      total: 2, caught: 1, survived: 1, timedOut: 0,
      results: [
        { file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法', caught: true, timedOut: false, failed: [] },
        { file: 'calc.js', from: '(a, b) =>', to: '(a, b, c) =>', note: '多一個參數', caught: false, timedOut: false, failed: [] }
      ]
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--markdown：總計一行、空一行，再接「突變｜結果｜紅的測試」表格；旗標寫在清單前後都認得，結束碼照舊', () => {
  const dir = project([
    { file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' },
    { file: 'calc.js', from: '(a, b) =>', to: '(a, b, c) =>', note: '多一個參數' }
  ], { nodeTest: true });
  try {
    const before = spawnSync(process.execPath, [MUTATE, '--markdown', 'mutations.json'], { cwd: dir, encoding: 'utf8' });
    assert.equal(before.status, 1, before.stdout + before.stderr);
    assert.equal(before.stdout, '突變 2 種：抓到 1、存活 1、逾時 0\n\n| 突變 | 結果 | 紅的測試 |\n|---|---|---|\n' +
      '| 加法改減法 | 抓到 | 1 + 2 = 3［scripts/calc.test.mjs］ |\n| 多一個參數 | 存活 | — |\n');
    const after = run(dir, '--markdown');   // node check.js：不是 node:test，讀不到名稱
    assert.equal(after.status, 1, after.stdout + after.stderr);
    assert.equal(after.stdout, '突變 2 種：抓到 1、存活 1、逾時 0\n\n| 突變 | 結果 | 紅的測試 |\n|---|---|---|\n' +
      '| 加法改減法 | 抓到 | （沒有 node:test 的名稱） |\n| 多一個參數 | 存活 | — |\n');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--json 與 --markdown 一起給：結束碼 2，一個測試都不跑、一個檔案都不改', () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }]);
  try {
    const r = spawnSync(process.execPath, [MUTATE, 'mutations.json', '--test', 'touch ran.txt', '--json', '--markdown'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /\[--json \| --markdown\]/);
    assert.equal(existsSync(join(dir, 'ran.txt')), false, '測試指令被執行了');
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--timeout 的值不是 0 或正數（負數、不是數字、空字串、沒給值）：結束碼 2 並印出用法，一個測試都不跑、一個檔案都不改', () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }]);
  try {
    for (const value of [['-1'], ['abc'], [''], []]) {
      const r = spawnSync(process.execPath, [MUTATE, 'mutations.json', '--test', 'touch ran.txt', '--timeout', ...value], { cwd: dir, encoding: 'utf8', timeout: SAFETY });
      const label = value.length ? JSON.stringify(value[0]) : '沒給值';
      assert.equal(r.status, 2, `${label}：${r.stdout}${r.stderr}`);
      assert.match(r.stderr, /\[--timeout <秒>\]/, label);
      assert.equal(existsSync(join(dir, 'ran.txt')), false, `${label}：測試指令被執行了`);
      assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('參數或讀檔錯誤（沒給清單、清單不是 JSON、清單裡的檔案不存在）：結束碼 2，不和「有存活」的 1 混在一起', () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }]);
  try {
    const noList = spawnSync(process.execPath, [MUTATE, '--test', 'node check.js'], { cwd: dir, encoding: 'utf8' });
    assert.equal(noList.status, 2, noList.stderr);
    assert.match(noList.stderr, /用法/);
    writeFileSync(join(dir, 'mutations.json'), '[{ not json');
    assert.equal(run(dir).status, 2);
    writeFileSync(join(dir, 'mutations.json'), JSON.stringify([{ file: 'missing.js', from: 'x', to: 'y', note: '檔案不存在' }]));
    const missing = run(dir);
    assert.equal(missing.status, 2, missing.stderr);
    assert.match(missing.stderr, /missing\.js/);
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// 同一組失敗的兩種輸出（節錄自實際執行，cwd 是 /repo）：Node 24 非 TTY 預設 spec、Node 22 預設 TAP。
// scripts/a.test.mjs：通過的、失敗的 A、describe 一組 > 組內失敗、名稱有特殊字元的失敗、todo 失敗、
// before 失敗的 describe 有 before 的組 > 被取消（spec 不印耗時）；scripts/b.test.mjs 載入失敗
const SPEC = `✔ 通過的 (0.47ms)
✖ 失敗的 A (0.66ms)
▶ 一組
  ✖ 組內失敗 (6.28ms)
✖ 一組 (6.49ms)
✖ 有 # 與 \\ 還有 (括號) - 破折號 (0.39ms)
⚠ todo 失敗 (0.23ms) # TODO
▶ 有 before 的組
  ✖ 被取消
✖ 有 before 的組 (0.17ms)
✖ scripts/b.test.mjs (26.2ms)
ℹ tests 7
ℹ fail 5

✖ failing tests:

test at scripts/a.test.mjs:4:1
✖ 失敗的 A (0.66ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:

test at scripts/a.test.mjs:5:24
✖ 組內失敗 (6.28ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

test at scripts/a.test.mjs:6:1
✖ 有 # 與 \\ 還有 (括號) - 破折號 (0.39ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

test at scripts/a.test.mjs:7:1
⚠ todo 失敗 (0.23ms) # TODO
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

test at scripts/a.test.mjs:8:74
✖ 被取消
  'test did not finish before its parent and was cancelled'

test at scripts/a.test.mjs:8:1
✖ 有 before 的組 (0.17ms)
  Error: x

test at scripts/b.test.mjs:1:1
✖ scripts/b.test.mjs (26.2ms)
  'test failed'
`;
const TAP = `TAP version 13
# Subtest: 通過的
ok 1 - 通過的
# Subtest: 失敗的 A
not ok 2 - 失敗的 A
  ---
  location: '/repo/scripts/a.test.mjs:4:1'
  failureType: 'testCodeFailure'
  ...
# Subtest: 一組
    # Subtest: 組內失敗
    not ok 1 - 組內失敗
      ---
      location: '/repo/scripts/a.test.mjs:5:24'
      failureType: 'testCodeFailure'
      ...
not ok 3 - 一組
  ---
  location: '/repo/scripts/a.test.mjs:5:1'
  failureType: 'subtestsFailed'
  ...
# Subtest: 有 \\# 與 \\\\ 還有 (括號) - 破折號
not ok 4 - 有 \\# 與 \\\\ 還有 (括號) - 破折號
  ---
  location: '/repo/scripts/a.test.mjs:6:1'
  failureType: 'testCodeFailure'
  ...
# Subtest: todo 失敗
not ok 5 - todo 失敗 # TODO
  ---
  location: '/repo/scripts/a.test.mjs:7:1'
  failureType: 'testCodeFailure'
  ...
# Subtest: 有 before 的組
    # Subtest: 被取消
    not ok 1 - 被取消
      ---
      location: '/repo/scripts/a.test.mjs:8:74'
      failureType: 'cancelledByParent'
      ...
not ok 6 - 有 before 的組
  ---
  location: '/repo/scripts/a.test.mjs:8:1'
  failureType: 'hookFailed'
  ...
# Subtest: scripts/b.test.mjs
not ok 2 - scripts/b.test.mjs
  ---
  location: '/repo/scripts/b.test.mjs:1:1'
  failureType: 'testCodeFailure'
  ...
# fail 5
`;
const FAILED = [
  { name: '失敗的 A', file: 'scripts/a.test.mjs' },
  { name: '組內失敗', file: 'scripts/a.test.mjs' },
  { name: '有 # 與 \\ 還有 (括號) - 破折號', file: 'scripts/a.test.mjs' },
  { name: '被取消', file: 'scripts/a.test.mjs' },
  { name: '有 before 的組', file: 'scripts/a.test.mjs' },
  { name: 'scripts/b.test.mjs', file: 'scripts/b.test.mjs' }
];

test('failingTests 讀 spec：只認 failing tests 那一段（父測試、describe、todo 不算，被取消的沒有耗時也算），附檔名不附行號', () => {
  assert.deepEqual(failingTests(SPEC, '/repo'), FAILED);
});

test('failingTests 讀 TAP：not ok 裡排除父測試（subtestsFailed）與 todo，名稱還原跳脫，位置換成相對 cwd 的檔名', () => {
  assert.deepEqual(failingTests(TAP, '/repo'), FAILED);
});

test('failingTests 的檔名一律用 /：Windows 的 node --test 印出的是 scripts\\a.test.mjs', () => {
  const windowsSpec = '✖ failing tests:\n\ntest at scripts\\a.test.mjs:1:65\n✖ 失敗的 A (0.66ms)\n';
  assert.deepEqual(failingTests(windowsSpec, 'D:\\repo'), [{ name: '失敗的 A', file: 'scripts/a.test.mjs' }]);
});

test('failingTests 讀不到 node:test 的失敗：回傳 []', () => {
  for (const output of ['', 'check.js 結束碼 1\n', '✖ 失敗的 A (0.66ms)\n', 'TAP version 13\nok 1 - 通過的\n']) {
    assert.deepEqual(failingTests(output, '/repo'), [], JSON.stringify(output));
  }
});

test('markdownTable：| 跳脫、換行（\\r\\n、\\n、單獨的 \\r）換成空白；沒有 note 用 from；讀不到名稱與存活各有寫法；多個紅的測試以「、」分隔', () => {
  const results = [
    { file: 'x.mjs', from: 'x', to: 'y', note: '把 (not ok|ok) 換成\r\n只認 not ok', caught: true,
      failed: [{ name: '讀 TAP | 子測試', file: 'scripts/a.test.mjs' }, { name: '端對端', file: 'scripts/b.test.mjs' }] },
    { file: 'x.mjs', from: 'a + b', to: 'a - b', caught: true, failed: [] },
    { file: 'x.mjs', from: '(a, b) =>', to: '(a, b, c) =>', note: '多一個參數', caught: false, failed: [] },
    { file: 'x.mjs', from: 'a', to: 'b', note: '只有\r的換行\n也換', caught: false, failed: [] }
  ];
  assert.equal(markdownTable(results), [
    '| 突變 | 結果 | 紅的測試 |',
    '|---|---|---|',
    '| 把 (not ok\\|ok) 換成 只認 not ok | 抓到 | 讀 TAP \\| 子測試［scripts/a.test.mjs］、端對端［scripts/b.test.mjs］ |',
    '| a + b | 抓到 | （沒有 node:test 的名稱） |',
    '| 多一個參數 | 存活 | — |',
    '| 只有 的換行 也換 | 存活 | — |'
  ].join('\n'));
});
