/**
 * verification-run.mjs — 驗證執行的資源清理、本次產物隔離與網站檔案邊界
 * runVerification：一次驗證的生命週期，verify.mjs 呼叫。持有本機伺服器、瀏覽器與本次產物目錄（scratch/verification-runs/ 底下的 run- 目錄），
 *   檢查敘述只透過 ok 記結果；回傳 { exitCode, results, incomplete, runDir }。有任一項失敗，exitCode 就是 1；
 *   資源初始化、骨架、清理或 log 本身出錯時 incomplete 為真，報告標示「未完成」；完整模式全部通過才更新 verify-screenshots/。
 * createWebsiteServer：只供本機驗證的網站伺服器與路徑守門，browser-checks.mjs 的獨立骨架也重用。
 * anchorInViewport：目錄錨點是否已捲入可視範圍，由 Playwright 在頁面中執行。STAMPED_AT：?stamped 用的固定時間。
 * 單元測試在 verification-run.test.mjs（瀏覽器換成可控的實作，伺服器用真實 HTTP 請求）。
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, mkdtempSync, cpSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { createServer } from 'node:http';
import { stampLastUpdated } from './stamp-last-updated.mjs';
import { renderReport } from './verify-report.mjs';

// ?stamped 回傳以這個固定時間填好 last-updated 的 index.html，等同部署後的網站（repo 裡提交的是空的）。
// 改這個時間時，verify.mjs 的 LAST_UPDATED_TEXT（臺北時間的顯示文字），以及 browser-checks.test.mjs、verification-run.test.mjs 的字面值也要一起改
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

// CLI 生命週期與獨立瀏覽器骨架共用同一份路徑守門；這裡只建立伺服器，啟動與釋放由呼叫端持有。
export function createWebsiteServer(root, onError = () => {}) {
  // 用作業系統的 realpath：Windows 會展開 8.3 短檔名（GIT~1 → .git）並還原實際大小寫，根目錄與檔案須用同一種寫法比對。
  const realRoot = realpathSync.native(root);
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.zip': 'application/zip', '.md': 'text/markdown', '.csv': 'text/csv' };
  return createServer((req, res) => {
    try {
      // 只回應本機名稱；外部網域即使經 DNS rebinding 解析到 127.0.0.1，也讀不到 repo 檔案。
      const port = req.socket.localPort;
      const host = String(req.headers.host || '').toLowerCase();
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) { res.writeHead(403); res.end(); return; }
      let p = decodeURIComponent(req.url.split('?')[0]).replace(/\\/g, '/'); if (p === '/') p = '/index.html';
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

// 拋出的值不一定是 Error：message 取值或轉字串本身也可能拋錯，這時仍要能記下失敗。
function describe(error) {
  try { return String(error?.message || error); } catch { return '（無法取得錯誤訊息）'; }
}

// 由 Playwright 在頁面中執行；以實際目標位置判定，不依賴動畫耗時。
export function anchorInViewport({ id, documentId }) {
  const target = document.getElementById(id);
  if (!target || !location.hash.includes(`doc=${documentId}`) || window.scrollY <= 0) return false;
  const rect = target.getBoundingClientRect();
  const headerBottom = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
  return rect.height > 0 && rect.top >= headerBottom && rect.bottom <= window.innerHeight;
}

// 一次驗證持有自己的資源與結果；檢查敘述只取得 browser、base、shots、ok。
// browserType 是 Playwright 的 Chromium adapter；測試可提供同一介面的可控實作。
export async function runVerification({ root, args = [], staticChecks, browserChecks, linkChecks,
  browserType, log = console.log, githubOutput = process.env.GITHUB_OUTPUT, cleanupTimeout = 5000 }) {
  const results = [];
  let acceptingChecks = true, logFailed = false;
  // log 本身拋錯時改記一筆失敗（只記第一次），結束碼與截圖更新照樣只看 results；報告仍會寫出並標示未完成。
  const say = message => {
    try { log(message); } catch (error) {
      if (logFailed) return;
      logFailed = true; incomplete = true;
      results.push({ name: '輸出紀錄', pass: false, detail: describe(error) });
    }
  };
  const record = (name, pass, detail = '') => {
    results.push({ name, pass: !!pass, detail: String(detail) });
    say(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };
  const ok = (...result) => { if (acceptingChecks) record(...result); };
  const staticOnly = args.includes('--static');
  const browserOnly = args.includes('--only');
  let phase = '初始化', incomplete = false, browser, server, runDir, shots;
  // 一定記一筆失敗：截圖更新與結束碼只看 results 就會擋下；incomplete 只決定報告的「未完成」狀態列與回傳值。
  const fail = (name, error) => {
    incomplete = true;
    record(name, false, describe(error));
  };
  const close = async (name, action) => {
    let timer;
    try {
      await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('資源關閉逾時')), cleanupTimeout);
      })]);
    } catch (error) { fail(`清理：${name}`, error); }
    finally { clearTimeout(timer); }
  };
  try {
    if (!staticOnly) {
      mkdirSync(join(root, 'scratch', 'verification-runs'), { recursive: true });
      runDir = mkdtempSync(join(root, 'scratch', 'verification-runs', 'run-'));
      shots = join(runDir, 'verify-screenshots');
      mkdirSync(shots);
      if (githubOutput) appendFileSync(githubOutput, `run-directory=${runDir}\n`);
    }
    phase = '靜態檢查';
    if (!browserOnly) await staticChecks(ok);
    if (!staticOnly) {
      phase = '啟動伺服器';
      let rejectServing;
      const servingFailure = new Promise((_, reject) => { rejectServing = reject; });
      servingFailure.catch(() => {}); // 啟動瀏覽器期間也可能失敗，避免未處理的拒絕。
      server = createWebsiteServer(root, rejectServing);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      phase = '啟動瀏覽器';
      if (!browserType) {
        try { ({ chromium: browserType } = await import('playwright')); }
        catch { ({ chromium: browserType } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
      }
      browser = await browserType.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
      phase = '瀏覽器檢查';
      await Promise.race([browserChecks({ browser, base: `http://127.0.0.1:${server.address().port}/`, shots, ok, isActive: () => acceptingChecks }), servingFailure]);
    }
    if (args.includes('--links')) { phase = '連結檢查'; await linkChecks(); }
  } catch (error) { fail(`執行中斷：${phase}`, error); }
  finally {
    acceptingChecks = false; // 中斷後的非同步檢查不得更動已完成結果。
    if (browser) await close('瀏覽器', () => browser.close());
    if (server) await close('伺服器', () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }));
  }
  // 摘要行先輸出：log 在這裡拋錯時，say() 記的失敗還來得及擋下截圖更新並寫進報告。
  // 摘要的數字是更新截圖之前的；更新截圖失敗時，接著會印出那一筆 FAIL。
  const summary = `${results.filter(r => r.pass).length}/${results.length} 通過`;
  if (staticOnly) say(`\n${summary}（--static 不寫入 verify-report.md）`);
  else if (browserOnly) say(`\n${summary}（--only 不寫入 verify-report.md）`);
  else {
    say(`\n${summary} → verify-report.md`);
    if (runDir) say(`本次產物：${runDir}`);
  }
  // 只有全部通過才更新維護用截圖；失敗執行保留自己的部分截圖。
  if (!staticOnly && !browserOnly && results.every(r => r.pass)) {
    try { cpSync(shots, join(root, 'verify-screenshots'), { recursive: true }); }
    catch (error) { fail('更新截圖', error); }
  }
  const passed = results.filter(r => r.pass).length;
  const report = renderReport(results, { mode: args.join(' ') || 'full', at: new Date().toISOString(), incomplete });
  let exitCode = passed !== results.length ? 1 : 0;
  if (!staticOnly && !browserOnly) {
    // 先寫本次產物，再更新維護用報告；任一寫入失敗也回傳失敗。
    for (const file of [runDir && join(runDir, 'verify-report.md'), join(root, 'verify-report.md')].filter(Boolean)) {
      try { writeFileSync(file, report); }
      catch (error) { exitCode = 1; say(`FAIL  寫入報告 ${file} — ${error.message}`); }
    }
  }
  return { exitCode, results, incomplete, runDir };
}
