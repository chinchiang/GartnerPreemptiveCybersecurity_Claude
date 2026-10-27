// child-process.test.mjs — 子行程共用工具的測試
// parseTimeout 直接呼叫；runWithTimeout 用真的子行程跑 process.execPath 執行的小程式，close 之後的 kill() 另以 process.kill 的替身檢查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTimeout, runWithTimeout } from './child-process.mjs';

test('parseTimeout：0 或正數（可以有小數）回傳秒數，0 表示不限時', () => {
  assert.equal(parseTimeout('0'), 0);
  assert.equal(parseTimeout('1'), 1);
  assert.equal(parseTimeout('1.5'), 1.5);
  assert.equal(parseTimeout('.5'), 0.5);
  assert.equal(parseTimeout('600'), 600);
});

test('parseTimeout：負數、不是數字、空字串、沒給值、兩個小數點都回傳 null，不會變成 0（不限時）', () => {
  for (const arg of ['-1', 'abc', '', undefined, '1.2.3']) assert.equal(parseTimeout(arg), null, String(arg));
});

test('runWithTimeout：以執行檔＋參數執行，正常結束時回傳結束碼、stdout 與 stderr，沒有逾時', async () => {
  const script = "process.stdout.write('out'); process.stderr.write('err'); process.exit(3);";
  const { result } = runWithTimeout({ command: process.execPath, args: ['-e', script], stderr: true });
  assert.deepEqual(await result, { code: 3, stdout: 'out', stderr: 'err', timedOut: false });
});

// 子行程與它開的孫行程：兩個都留下計時器不結束；子行程把兩個 pid 寫進 argv[1] 指定的檔案，測試失敗時也找得到、清得掉
const HANGING_TREE = "const { spawn } = require('child_process');\n" +
  "const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });\n" +
  "require('fs').writeFileSync(process.argv[1], JSON.stringify([process.pid, g.pid]));\nsetInterval(() => {}, 1000);\n";
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
// SIGKILL 送達與回收需要一點時間：最多等 2 秒
async function waitUntilDead(pids) {
  for (let i = 0; i < 40 && pids.some(alive); i++) await new Promise(r => setTimeout(r, 50));
}
// 實作壞掉時 result 可能永遠不會給出：最多等 10 秒就當成失敗，不讓整個 node --test 卡住
const within10s = promise => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('10 秒內沒有結果')), 10000).unref())]);
// 跑 HANGING_TREE，把 pid 檔的路徑交給 body；結束時（不論通過與否）結束兩個行程、刪掉暫存目錄
async function withHangingTree(body) {
  const dir = mkdtempSync(join(tmpdir(), 'child-process-test-'));
  const pidFile = join(dir, 'pids.json');
  const pids = () => existsSync(pidFile) ? JSON.parse(readFileSync(pidFile, 'utf8')) : [];
  try { await body(pidFile, pids); }
  finally {
    for (const pid of pids()) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    rmSync(dir, { recursive: true, force: true });
  }
}

test('runWithTimeout：超過 timeoutSeconds 就結束整組行程（子行程與它開的孫行程），timedOut 為真', async () => {
  await withHangingTree(async (pidFile, pids) => {
    const { result } = runWithTimeout({ command: process.execPath, args: ['-e', HANGING_TREE, pidFile], timeoutSeconds: 1 });
    const r = await within10s(result);
    assert.equal(r.timedOut, true);
    await waitUntilDead(pids());
    assert.equal(pids().length, 2, '子行程沒有寫出 pid');
    for (const pid of pids()) assert.ok(!alive(pid), `行程 ${pid} 在逾時之後還在執行`);
  });
});

test('runWithTimeout：timeoutSeconds 超過 setTimeout 的上限（2^31−1 毫秒）時不會立刻逾時，子行程照常跑完', async () => {
  const { result } = runWithTimeout({ command: process.execPath, args: ['-e', 'setTimeout(() => process.exit(0), 200)'], timeoutSeconds: 3e6 });
  const r = await within10s(result);
  assert.equal(r.timedOut, false);
  assert.equal(r.code, 0);
});

test('runWithTimeout：呼叫 kill() 就結束整組行程（子行程與它開的孫行程），給中斷時的訊號處理器用', async () => {
  await withHangingTree(async (pidFile, pids) => {
    const { result, kill } = runWithTimeout({ command: process.execPath, args: ['-e', HANGING_TREE, pidFile] });
    for (let i = 0; i < 100 && pids().length < 2; i++) await new Promise(r => setTimeout(r, 50));
    assert.equal(pids().length, 2, '子行程沒有寫出 pid');
    kill();
    await within10s(result);
    await waitUntilDead(pids());
    for (const pid of pids()) assert.ok(!alive(pid), `行程 ${pid} 在 kill() 之後還在執行`);
  });
});

test('runWithTimeout：子行程結束（close）之後呼叫 kill() 不送任何訊號（pid 可能已被別的行程重新使用）', async () => {
  const { result, kill } = runWithTimeout({ command: process.execPath, args: ['-e', ''] });
  await within10s(result);
  // 換成只記錄呼叫的替身：真的送出的話，送給的可能是重新使用這個 pid 的別的行程群組
  const calls = [];
  const realKill = process.kill;
  process.kill = (...args) => { calls.push(args); return true; };
  try { kill(); } finally { process.kill = realKill; }
  assert.deepEqual(calls, []);
});

test('runWithTimeout：shell 為真時 command 是整串指令，交給 shell 解析（突變工具的測試指令用這種）', async () => {
  const node = `"${process.execPath}"`;
  const command = `${node} -e "process.stdout.write('ok')" && ${node} -e "process.stdout.write('2')"`;
  const { result } = runWithTimeout({ command, shell: true });
  const r = await within10s(result);
  assert.equal(r.stdout, 'ok2');
  assert.equal(r.code, 0);
});

test('runWithTimeout：子行程看不到 NODE_TEST_CONTEXT（否則內層的 node --test 改用子行程模式，測試失敗也以 0 結束），其他環境變數照常傳下去', async () => {
  const saved = { context: process.env.NODE_TEST_CONTEXT, mark: process.env.CHILD_PROCESS_TEST_MARK };
  process.env.NODE_TEST_CONTEXT = 'child';
  process.env.CHILD_PROCESS_TEST_MARK = 'kept';
  try {
    const script = "process.stdout.write(`${process.env.NODE_TEST_CONTEXT ?? 'none'} ${process.env.CHILD_PROCESS_TEST_MARK}`)";
    const { result } = runWithTimeout({ command: process.execPath, args: ['-e', script] });
    assert.equal((await within10s(result)).stdout, 'none kept');
  } finally {
    for (const [name, value] of [['NODE_TEST_CONTEXT', saved.context], ['CHILD_PROCESS_TEST_MARK', saved.mark]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
