/**
 * child-process.mjs — 子行程的共用工具：--timeout 的判定、逾時或中斷時結束整組子行程
 * 純 Node 內建模組，無第三方相依。突變工具（mutate.mjs）用它跑測試指令。
 */
import { spawn, spawnSync } from 'node:child_process';

// --timeout 只收 0 或正數（可以有小數），0 表示不限時；負數、不是數字、空字串、沒給值都回傳 null，由呼叫端決定怎麼報錯。
// 用正規式檢查，Number('') 的 0 才不會混進來
export function parseTimeout(arg) {
  return /^(\d+\.?\d*|\.\d+)$/.test(arg ?? '') ? Number(arg) : null;
}

// 結束子行程底下的所有行程：Linux／macOS 送 SIGKILL 給整個行程群組；Windows 沒有行程群組，用 taskkill /T 結束整棵行程樹
function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGKILL'); } catch {} }
}

// 開一個子行程，收集輸出：shell 為真時 command 是整串指令（交給 shell 解析），否則 command 是執行檔、args 是參數。回傳 { result, kill }：result 在子行程結束、輸出讀完（close）時給出 { code, stdout, stderr, timedOut }。
// timeoutSeconds 大於 0 時，超過就結束整組行程、timedOut 為真；setTimeout 超過 2^31-1 毫秒會變成立刻觸發，所以上限壓在這裡（約 24.8 天）
export function runWithTimeout({ command, args = [], shell = false, stderr = false, timeoutSeconds = 0 }) {
  // 拿掉 NODE_TEST_CONTEXT：被 node --test 啟動時會繼承它，內層的 node --test 改用子行程模式，測試失敗也以 0 結束
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  // detached 讓子行程自成行程群組，才能整組結束；Windows 沒有行程群組，detached 反而讓 stdout 讀不到
  const child = spawn(command, args, { shell, stdio: ['ignore', 'pipe', stderr ? 'pipe' : 'ignore'], detached: process.platform !== 'win32', env });
  let out = '';
  let err = '';
  let timedOut = false;
  let closed = false;   // close 之後 pid 可能被別的行程重新使用，kill() 就不再送訊號
  child.stdout.on('data', chunk => { out += chunk; });
  if (stderr) child.stderr.on('data', chunk => { err += chunk; });
  const timer = timeoutSeconds > 0 && setTimeout(() => { timedOut = true; killTree(child.pid); }, Math.min(timeoutSeconds * 1000, 2 ** 31 - 1));
  const result = new Promise(resolve => {
    child.on('close', code => { closed = true; clearTimeout(timer); resolve({ code, stdout: out, stderr: err, timedOut }); });
  });
  // kill() 跟逾時用同一個做法結束整組行程
  return { result, kill: () => { if (!closed) killTree(child.pid); } };
}
