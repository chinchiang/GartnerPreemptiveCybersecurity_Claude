/**
 * website-server.mjs — 只供本機驗證的網站伺服器與路徑守門
 * createWebsiteServer：把網站根目錄底下的檔案原樣送出（?stamped 的 index.html 以 STAMPED_AT 填好最後更新時間）；
 *   Host、`:`、以 . 開頭的路徑段、頂層 backend/ 與 scratch/、realpath 解析後的越界與無權限目錄都回 403；路徑的 % 編碼壞掉回 400 並通知 onMalformedUrl（#195）。
 *   啟動與釋放由 verification-run.mjs 的 runVerification 持有（#180 從 verification-run.mjs 原樣搬出）。
 * STAMPED_AT：?stamped 用的固定時間。
 * 單元測試在 website-server.test.mjs；路徑守門的回歸測試經過一次驗證的生命週期，在 verification-run.test.mjs。
 */
import { readFileSync, existsSync, realpathSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { createServer } from 'node:http';
import { stampLastUpdated } from './stamp-last-updated.mjs';

// ?stamped 回傳以這個固定時間填好 last-updated 的 index.html，等同部署後的網站（repo 裡提交的是空的）。
// 改這個時間時，verify.mjs 的 LAST_UPDATED_TEXT（臺北時間的顯示文字），以及 website-server.test.mjs、verification-run.test.mjs 的字面值也要一起改
export const STAMPED_AT = '2026-10-17T16:30:00+00:00';

function withinRoot(root, file) {
  const path = relative(root, file);
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}

// 根目錄內也不提供的路徑：以 . 開頭的路徑段（.git、.env 等），以及頂層的 backend/ 與 scratch/。
// Windows 不分大小寫，且會忽略路徑段尾端的點與空白，所以比對前先正規化。
const PRIVATE_DIRS = new Set(['backend', 'scratch']);
function hiddenFromWebsite(root, file) {
  const segments = relative(root, file).split(sep).map(segment => segment.toLowerCase().replace(/[. ]+$/, ''));
  return segments.some(segment => segment.startsWith('.')) || PRIVATE_DIRS.has(segments[0]);
}

// 這裡只建立伺服器，啟動與釋放由呼叫端（verification-run.mjs 的 runVerification）持有。
// onError：要中斷驗證的伺服器例外（網站檔案讀不到等）；onMalformedUrl(原始網址)：路徑的 % 編碼壞掉、已回 400 的請求
export function createWebsiteServer(root, onError = () => {}, onMalformedUrl = () => {}) {
  // 用作業系統的 realpath：Windows 會展開 8.3 短檔名（GIT~1 → .git）並還原實際大小寫，根目錄與檔案須用同一種寫法比對。
  const realRoot = realpathSync.native(root);
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.zip': 'application/zip', '.md': 'text/markdown', '.csv': 'text/csv' };
  return createServer((req, res) => {
    try {
      // 只回應本機名稱；外部網域即使經 DNS rebinding 解析到 127.0.0.1，也讀不到 repo 檔案。
      const port = req.socket.localPort;
      const host = String(req.headers.host || '').toLowerCase();
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) { res.writeHead(403); res.end(); return; }
      // 路徑的 % 編碼壞掉是請求本身的錯：回 400、不碰檔案系統，交給 onMalformedUrl（呼叫端記一列失敗），不中斷驗證（#195）。
      let p;
      try { p = decodeURIComponent(req.url.split('?')[0]); } catch { onMalformedUrl(req.url); res.writeHead(400); res.end(); return; }
      p = p.replace(/\\/g, '/'); if (p === '/') p = '/index.html';
      // 冒號會讓 NTFS 開啟串流（backend::$INDEX_ALLOCATION 就是 backend 目錄本身），網站檔名也用不到，一律拒絕。
      if (!p.startsWith('/') || p.includes(':')) { res.writeHead(403); res.end(); return; }
      const file = resolve(realRoot, '.' + p);
      if (!withinRoot(realRoot, file) || hiddenFromWebsite(realRoot, file)) { res.writeHead(403); res.end(); return; }
      if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
      let realFile;
      // 作業系統的 realpath 須開啟路徑。沒有讀取權限的目錄本來就不提供，視同拒絕存取；
      // 網站檔案讀不到則是真正的失敗，照常交給 onError 中斷驗證。
      try { realFile = realpathSync.native(file); } catch (error) {
        if ((error.code === 'EPERM' || error.code === 'EACCES') && statSync(file).isDirectory()) { res.writeHead(403); res.end(); return; }
        throw error;
      }
      if (!withinRoot(realRoot, realFile) || hiddenFromWebsite(realRoot, realFile)) { res.writeHead(403); res.end(); return; }
      if (!statSync(realFile).isFile()) { res.writeHead(404); res.end(); return; }
      const body = p === '/index.html' && req.url.includes('?stamped')
        ? stampLastUpdated(readFileSync(realFile, 'utf8'), STAMPED_AT) : readFileSync(realFile);
      res.writeHead(200, { 'content-type': mime[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream' }); res.end(body);
    } catch (error) { onError(new Error(`提供網站檔案：${error.message}`)); res.writeHead(500); res.end(); }
  });
}
