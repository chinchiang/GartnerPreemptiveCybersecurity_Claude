// child-process.test.mjs — 子行程共用工具的測試
// parseTimeout 直接呼叫；runWithTimeout 用真的子行程跑 process.execPath 執行的小程式，close 之後的 kill() 另以 process.kill 的替身檢查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTimeout, runWithTimeout } from './child-process.mjs';
import { hangingServerSource, waitUnreachable, stopHanging } from './hanging-process.mjs';

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

// 子行程與它開的孫行程：兩個都在專屬的控制通道監聽、不結束（做法見 hanging-process.mjs）；各自在監聽之後把位址附加到
// argv[1] 指定的檔案，測試失敗時也找得到、請得動它們結束
const TREE_SERVER = hangingServerSource({ dirExpr: "require('path').dirname(process.argv[1])", recordFileExpr: 'process.argv[1]' });
const HANGING_TREE = `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(TREE_SERVER)}, process.argv[1]], { stdio: 'ignore' });\n` + TREE_SERVER;
// 逾時那支的 timeoutSeconds：兩個行程都要在時限內開始監聽、寫出位址。Windows 啟動 Node 比較慢（#143），用較寬的值
const TREE_TIMEOUT_SECONDS = process.platform === 'win32' ? 3 : 1;
// 實作壞掉時 result 可能永遠不會給出：最多等 30 秒就當成失敗，不讓整個 node --test 卡住。
// 不是在測速度：Windows 在行程建立的負載下，逾時之後光 taskkill 就要 5～8 秒，10 秒會偶發失敗（#185）
const within30s = promise => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('30 秒內沒有結果')), 30000).unref())]);
// 跑 HANGING_TREE，把位址檔的路徑與讀位址的函式交給 body；結束時（不論通過與否）透過通道請兩個行程結束、刪掉暫存目錄。
// 不對任何 pid 送訊號（#165）：正常時 runWithTimeout 早已結束它們，連不上的略過
async function withHangingTree(body) {
  const dir = mkdtempSync(join(tmpdir(), 'child-process-test-'));
  const addrFile = join(dir, 'addrs');
  const addrs = () => existsSync(addrFile) ? readFileSync(addrFile, 'utf8').split('\n').filter(Boolean) : [];
  try { await body(addrFile, addrs); }
  finally {
    for (const addr of addrs()) await stopHanging(addr);
    rmSync(dir, { recursive: true, force: true });
  }
}

test('runWithTimeout：超過 timeoutSeconds 就結束整組行程（子行程與它開的孫行程），timedOut 為真', async () => {
  await withHangingTree(async (addrFile, addrs) => {
    const { result } = runWithTimeout({ command: process.execPath, args: ['-e', HANGING_TREE, addrFile], timeoutSeconds: TREE_TIMEOUT_SECONDS });
    const r = await within30s(result);
    assert.equal(r.timedOut, true);
    assert.equal(addrs().length, 2, '子行程與孫行程沒有都寫出通道');
    // 結束與回收需要一點時間：每個最多等 2 秒
    for (const addr of addrs()) assert.ok(await waitUnreachable(addr, 2000), `行程（通道 ${addr}）在逾時之後還在執行`);
  });
});

test('runWithTimeout：timeoutSeconds 超過 setTimeout 的上限（2^31−1 毫秒）時不會立刻逾時，子行程照常跑完', async () => {
  const { result } = runWithTimeout({ command: process.execPath, args: ['-e', 'setTimeout(() => process.exit(0), 200)'], timeoutSeconds: 3e6 });
  const r = await within30s(result);
  assert.equal(r.timedOut, false);
  assert.equal(r.code, 0);
});

test('runWithTimeout：呼叫 kill() 就結束整組行程（子行程與它開的孫行程），給中斷時的訊號處理器用', async () => {
  await withHangingTree(async (addrFile, addrs) => {
    const { result, kill } = runWithTimeout({ command: process.execPath, args: ['-e', HANGING_TREE, addrFile] });
    for (let i = 0; i < 100 && addrs().length < 2; i++) await new Promise(r => setTimeout(r, 50));
    assert.equal(addrs().length, 2, '子行程與孫行程沒有都寫出通道');
    kill();
    await within30s(result);
    for (const addr of addrs()) assert.ok(await waitUnreachable(addr, 2000), `行程（通道 ${addr}）在 kill() 之後還在執行`);
  });
});

test('runWithTimeout：子行程結束（close）之後呼叫 kill() 不送任何訊號（pid 可能已被別的行程重新使用）', async () => {
  const { result, kill } = runWithTimeout({ command: process.execPath, args: ['-e', ''] });
  await within30s(result);
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
  const r = await within30s(result);
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
    assert.equal((await within30s(result)).stdout, 'none kept');
  } finally {
    for (const [name, value] of [['NODE_TEST_CONTEXT', saved.context], ['CHILD_PROCESS_TEST_MARK', saved.mark]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
