// 突變工具（scripts/mutate.mjs）：吃一份臨時的突變清單，逐一改壞、跑測試、一定還原。
// 以子行程跑 CLI，對象是 /tmp 底下的小專案：calc.js 加一支會檢查它的 check.js。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MUTATE = fileURLToPath(new URL('./mutate.mjs', import.meta.url));
const CALC = 'module.exports = (a, b) => a + b;\n';
// 給預設測試指令（node --test scripts/*.test.mjs）跑的 node:test 檔
const CALC_TEST = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { createRequire } from 'node:module';\n" +
  "test('1 + 2 = 3', () => assert.equal(createRequire(import.meta.url)('../calc.js')(1, 2), 3));\n";

// 回傳小專案的目錄；mutations 寫成 mutations.json
function project(mutations) {
  const dir = mkdtempSync(join(tmpdir(), 'mutate-test-'));
  writeFileSync(join(dir, 'calc.js'), CALC);
  writeFileSync(join(dir, 'check.js'), "process.exit(require('./calc.js')(1, 2) === 3 ? 0 : 1);\n");
  writeFileSync(join(dir, 'mutations.json'), JSON.stringify(mutations));
  return dir;
}
const run = (dir, ...args) => spawnSync(process.execPath, [MUTATE, 'mutations.json', '--test', 'node check.js', ...args], { cwd: dir, encoding: 'utf8' });

test('突變被測試抓到：結束碼 0，檔案還原', () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }]);
  try {
    const r = run(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /抓到\s+calc\.js\s+加法改減法/);
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
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }]);
  try {
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts', 'calc.test.mjs'), CALC_TEST);
    const r = spawnSync(process.execPath, [MUTATE, 'mutations.json'], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /抓到\s+calc\.js\s+加法改減法/);
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('被 node --test 啟動時（繼承了 NODE_TEST_CONTEXT）：預設測試指令的失敗照樣算抓到', () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }]);
  try {
    mkdirSync(join(dir, 'scripts'));
    writeFileSync(join(dir, 'scripts', 'calc.test.mjs'), CALC_TEST);
    const r = spawnSync(process.execPath, [MUTATE, 'mutations.json'], { cwd: dir, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: 'child-v8' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /抓到\s+calc\.js\s+加法改減法/);
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
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

test('跑測試時被中斷（SIGTERM）：檔案仍然還原', async () => {
  const dir = project([{ file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法' }]);
  try {
    // 讀到突變後的 calc.js 就睡 10 秒，留時間送出中斷
    writeFileSync(join(dir, 'check.js'),
      "const src = require('fs').readFileSync(__dirname + '/calc.js', 'utf8');\nif (src.includes('a - b')) setTimeout(() => process.exit(1), 10000);\n");
    const child = spawn(process.execPath, [MUTATE, 'mutations.json', '--test', 'node check.js'], { cwd: dir, stdio: 'ignore' });
    const mutated = () => readFileSync(join(dir, 'calc.js'), 'utf8').includes('a - b');
    for (let i = 0; i < 100 && !mutated(); i++) await new Promise(r => setTimeout(r, 50));
    assert.ok(mutated(), '突變沒有開始');
    const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal })));
    child.kill('SIGTERM');
    const { code } = await exited;
    assert.notEqual(code, 0);
    assert.equal(readFileSync(join(dir, 'calc.js'), 'utf8'), CALC);
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
      total: 2, caught: 1, survived: 1,
      results: [
        { file: 'calc.js', from: 'a + b', to: 'a - b', note: '加法改減法', caught: true },
        { file: 'calc.js', from: '(a, b) =>', to: '(a, b, c) =>', note: '多一個參數', caught: false }
      ]
    });
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
