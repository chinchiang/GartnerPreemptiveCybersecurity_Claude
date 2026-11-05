/**
 * hanging-process.mjs — 測試用的卡住的行程：以專屬的本機控制通道辨識身分與結束，不依 pid 送訊號（#165）
 * 只給測試用。逾時與中斷的測試要一個「永遠不結束」的行程，再驗證被測程式結束了它。
 * 以前記下 pid、用 kill(pid, 0) 判斷存活、在 finally 對 pid 送 SIGKILL；Windows 的 pid 會很快被重新使用，
 * 可能誤判別的行程還活著，或打到別的行程。改成每個卡住的行程在一個每次都不同的位址監聽：
 * 連得上它的通道就是它還活著；請它結束也走通道，由它自己結束。
 * Unix 的位址是暫存目錄裡的 socket 檔（跟著目錄一起刪；macOS 的路徑上限約 104 字元），Windows 是 \\.\pipe\<隨機名稱>。
 * 看守通道（#197）：測試行程以 startWatchdog 開一個，卡住的行程啟動時連上去，連線斷了就自己結束。外層工具逾時或中斷時
 * SIGKILL 測試行程，測試的 finally 不會執行；作業系統仍會關掉測試行程持有的連線，卡住的行程（可能在另一個行程群組）就不會留下。
 * 看守的是測試行程，不是直接的父行程：測試行程還在時，卡住的行程照舊只由被測程式或 stopHanging 結束，
 * 「結束整組行程（含孫行程）」的測試才測得出只結束子行程的退化。
 * 單元測試在 hanging-process.test.mjs。
 */
import net from 'node:net';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

// 看守通道：在 dir（Unix 放 socket 檔）或 Windows 的 named pipe 監聽，回傳 { addr, close }。
// 伺服器與連線都 unref，不讓測試行程因為它而不結束；close() 斷開所有連線（連著的卡住行程跟著結束）並關掉伺服器
export async function startWatchdog(dir) {
  const addr = process.platform === 'win32'
    ? '\\\\.\\pipe\\pea-watchdog-' + randomUUID()
    : join(dir, 'w-' + randomUUID().slice(0, 8) + '.sock');
  const sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.unref();
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(addr, resolve); });
  server.unref();
  return { addr, close: () => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(() => resolve()); }) };
}

// 一段 CommonJS 原始碼，放進卡住的行程裡執行：先連上看守通道（watchdogAddr：startWatchdog 回傳的 addr），連上之後才在新的位址監聽，
// 監聽完成後把位址附加到 recordFileExpr 那個檔案（一行一個），再呼叫 onListening（原始碼片段，可省略）。
// 收到含 exit 的資料就以結束碼 0 結束；監聽中的伺服器本身讓行程不結束。
// 看守通道連上之後斷了（測試行程消失或 close()）就以結束碼 0 結束；一開始就連不上是設定錯誤，寫到 stderr 並以結束碼 70 結束、不監聽，
// 不讓它看起來像測試通過。dirExpr、recordFileExpr、onListening 是原始碼運算式，在卡住的行程裡求值；watchdogAddr 是值
export function hangingServerSource({ dirExpr, recordFileExpr, watchdogAddr, onListening = '' }) {
  if (typeof watchdogAddr !== 'string' || !watchdogAddr) throw new Error('hangingServerSource 需要 watchdogAddr（startWatchdog 回傳的 addr）：測試行程消失時卡住行程才會自己結束（#197）');
  return `(() => {
  let watched = false;
  require('net').connect(${JSON.stringify(watchdogAddr)})
    .on('connect', () => {
      watched = true;
      const addr = process.platform === 'win32'
        ? '\\\\\\\\.\\\\pipe\\\\pea-test-' + require('crypto').randomUUID()
        : require('path').join(${dirExpr}, require('crypto').randomUUID().slice(0, 8) + '.sock');
      require('net').createServer(c => c.on('data', d => { if (String(d).includes('exit')) process.exit(0); }))
        .listen(addr, () => { require('fs').appendFileSync(${recordFileExpr}, addr + '\\n'); ${onListening} });
    })
    .on('error', e => { if (!watched) { process.stderr.write('連不上看守通道：' + e.message + '\\n'); process.exit(70); } })
    .on('close', () => process.exit(0));
})();
`;
}

// 連得上嗎：連上就關掉連線（不送資料，不會讓它結束）。行程結束後，Unix 的 socket 檔還在但連不上（ECONNREFUSED），Windows 的 pipe 會消失
export function reachable(addr) {
  return new Promise(resolve => {
    const c = net.connect(addr);
    c.once('connect', () => { c.end(); resolve(true); });
    c.once('error', () => resolve(false));
  });
}

// 等到連不上為止，最多等 ms 毫秒；回傳最後是否已經連不上
export async function waitUnreachable(addr, ms = 2000) {
  const deadline = Date.now() + ms;
  while (await reachable(addr)) {
    if (Date.now() >= deadline) return false;
    await new Promise(r => setTimeout(r, 50));
  }
  return true;
}

// 請它結束並等到連不上：連得上就送出 exit；連不上（已經結束）就略過。給 finally 清理用，不對任何 pid 送訊號
export async function stopHanging(addr, ms = 5000) {
  const sent = await new Promise(resolve => {
    const c = net.connect(addr);
    c.once('connect', () => c.end('exit\n', () => resolve(true)));
    c.once('error', () => resolve(false));
  });
  if (sent) await waitUnreachable(addr, ms);
}
