// hanging-process.test.mjs — 測試用卡住行程的看守通道：開它的測試行程消失時，卡住行程要自己結束（#197）
// 外層工具（full-check.mjs、mutate.mjs）逾時或中斷時會 SIGKILL 測試行程，測試的 finally 不會執行；卡住行程若在另一個行程群組
// （runWithTimeout 在 Linux 用 detached），就沒有人結束它。替身測試行程開看守通道與卡住行程，再只把替身 SIGKILL 掉。
// 執行：node --test scripts/hanging-process.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hangingServerSource, startWatchdog, reachable, waitUnreachable, stopHanging } from './hanging-process.mjs';

const MODULE_URL = new URL('./hanging-process.mjs', import.meta.url).href;
// 替身測試行程：開自己的看守通道，再開一個由它看守的卡住行程（不 detached；只有替身會被結束），然後一直不結束。
// 替身本身也連著這個測試行程的看守通道：這個測試行程中途被 SIGKILL 時，替身跟著結束，卡住行程再跟著結束，不會留下（#197）。
// argv[1]：卡住行程放 socket 的目錄；argv[2]：卡住行程監聽之後寫位址的檔案；argv[3]：這個測試行程的看守通道
const STAND_IN = `
import net from 'node:net';
import { spawn } from 'node:child_process';
import { startWatchdog, hangingServerSource } from ${JSON.stringify(MODULE_URL)};
const [dir, addrFile, parentWatchdog] = process.argv.slice(1);
net.connect(parentWatchdog).on('error', () => {}).on('close', () => process.exit(0));
const watchdog = await startWatchdog(dir);
const source = hangingServerSource({ dirExpr: JSON.stringify(dir), recordFileExpr: JSON.stringify(addrFile), watchdogAddr: watchdog.addr });
spawn(process.execPath, ['-e', source], { stdio: 'ignore' });
setInterval(() => {}, 1000);
`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
// 建暫存目錄、開這個測試行程的看守通道，執行 body(dir, addrFile, addrs, watchdog)；結束時（不論通過與否）透過通道請記下的
// 卡住行程結束、關掉看守通道、刪目錄（#165：不對 pid 送訊號）。看守通道開在 try 裡，開不起來時目錄照樣刪掉
async function withDir(body) {
  const dir = mkdtempSync(join(tmpdir(), 'hanging-process-test-'));
  const addrFile = join(dir, 'addrs');
  const addrs = () => existsSync(addrFile) ? readFileSync(addrFile, 'utf8').split('\n').filter(Boolean) : [];
  let watchdog;
  try {
    watchdog = await startWatchdog(dir);
    await body(dir, addrFile, addrs, watchdog);
  } finally {
    for (const addr of addrs()) await stopHanging(addr);
    await watchdog?.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
// 等到記下 n 個位址，最多 10 秒（Windows 啟動 Node 比較慢）
async function waitAddrs(addrs, n) {
  for (let i = 0; i < 200 && addrs().length < n; i++) await sleep(50);
  assert.equal(addrs().length, n, `10 秒內沒有記下 ${n} 個位址`);
}

test('看守的測試行程被 SIGKILL（只結束它自己，卡住行程不在同一組）：卡住行程在 5 秒內自己結束（#197）', () => withDir(async (dir, addrFile, addrs, watchdog) => {
  const standIn = spawn(process.execPath, ['--input-type=module', '-e', STAND_IN, dir, addrFile, watchdog.addr], { stdio: 'ignore' });
  try {
    await waitAddrs(addrs, 1);
    const [addr] = addrs();
    assert.equal(await reachable(addr), true);
    // 送給的是自己持有、還沒結束的子行程（ChildProcess），不是記下來的 pid，沒有 pid 被重新使用的問題（#165）
    standIn.kill('SIGKILL');
    await once(standIn, 'exit');
    assert.ok(await waitUnreachable(addr, 5000), `看守的測試行程結束後，卡住行程（通道 ${addr}）還在執行`);
  } finally {
    if (standIn.exitCode === null && standIn.signalCode === null) standIn.kill('SIGKILL');
  }
}));

test('看守通道還在：卡住行程不會自己結束（1.5 秒後仍連得上），只有 stopHanging 或被測程式能結束它（#197）', () => withDir(async (dir, addrFile, addrs, watchdog) => {
  const source = hangingServerSource({ dirExpr: JSON.stringify(dir), recordFileExpr: JSON.stringify(addrFile), watchdogAddr: watchdog.addr });
  spawn(process.execPath, ['-e', source], { stdio: 'ignore' });
  await waitAddrs(addrs, 1);
  await sleep(1500);
  assert.equal(await reachable(addrs()[0]), true);
}));

test('一開始就連不上看守通道：卡住行程寫 stderr、以結束碼 70 結束（不是 0，不會看起來像測試通過），不監聽（#197）', () => withDir(async (dir, addrFile, addrs) => {
  const missing = process.platform === 'win32' ? '\\\\.\\pipe\\pea-watchdog-missing-' + randomUUID() : join(dir, 'missing.sock');
  const source = hangingServerSource({ dirExpr: JSON.stringify(dir), recordFileExpr: JSON.stringify(addrFile), watchdogAddr: missing });
  const r = spawnSync(process.execPath, ['-e', source], { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 70);
  assert.match(r.stderr, /^連不上看守通道：/);
  assert.deepEqual(addrs(), []);
}));

test('hangingServerSource 沒給 watchdogAddr（或不是非空字串）就丟錯：卡住行程一定要有人看守（#197）', () => {
  for (const watchdogAddr of [undefined, '', 0]) {
    assert.throws(() => hangingServerSource({ dirExpr: "'/tmp'", recordFileExpr: "'/tmp/addrs'", watchdogAddr }),
      { message: 'hangingServerSource 需要 watchdogAddr（startWatchdog 回傳的 addr）：測試行程消失時卡住行程才會自己結束（#197）' }, String(watchdogAddr));
  }
});
