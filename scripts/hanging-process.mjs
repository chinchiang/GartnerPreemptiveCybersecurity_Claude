/**
 * hanging-process.mjs — 測試用的卡住的行程：以專屬的本機控制通道辨識身分與結束，不依 pid 送訊號（#165）
 * 只給測試用。逾時與中斷的測試要一個「永遠不結束」的行程，再驗證被測程式結束了它。
 * 以前記下 pid、用 kill(pid, 0) 判斷存活、在 finally 對 pid 送 SIGKILL；Windows 的 pid 會很快被重新使用，
 * 可能誤判別的行程還活著，或打到別的行程。改成每個卡住的行程在一個每次都不同的位址監聽：
 * 連得上它的通道就是它還活著；請它結束也走通道，由它自己結束。
 * Unix 的位址是暫存目錄裡的 socket 檔（跟著目錄一起刪；macOS 的路徑上限約 104 字元），Windows 是 \\.\pipe\<隨機名稱>。
 */
import net from 'node:net';

// 一段 CommonJS 原始碼，放進卡住的行程裡執行：在新的位址監聽，監聽完成後把位址附加到 recordFileExpr 那個檔案（一行一個），
// 再呼叫 onListening（原始碼片段，可省略）。收到含 exit 的資料就以結束碼 0 結束；監聽中的伺服器本身讓行程不結束。
// dirExpr、recordFileExpr、onListening 都是原始碼運算式，在卡住的行程裡求值
export function hangingServerSource({ dirExpr, recordFileExpr, onListening = '' }) {
  return `(() => {
  const addr = process.platform === 'win32'
    ? '\\\\\\\\.\\\\pipe\\\\pea-test-' + require('crypto').randomUUID()
    : require('path').join(${dirExpr}, require('crypto').randomUUID().slice(0, 8) + '.sock');
  require('net').createServer(c => c.on('data', d => { if (String(d).includes('exit')) process.exit(0); }))
    .listen(addr, () => { require('fs').appendFileSync(${recordFileExpr}, addr + '\\n'); ${onListening} });
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
