/**
 * verification-run.mjs — 一次網站驗證的生命週期：本機伺服器、瀏覽器、本次產物目錄與清理
 * runVerification：verify.mjs 呼叫。持有本機伺服器（website-server.mjs 的 createWebsiteServer）、瀏覽器與本次產物目錄（scratch/verification-runs/ 底下的 run- 目錄），
 *   檢查敘述只透過 ok 記結果；回傳 { exitCode, results, incomplete, runDir }。有任一項失敗，exitCode 就是 1；
 *   資源初始化、骨架、清理或 log 本身出錯時 incomplete 為真，報告標示「未完成」；完整模式全部通過才更新 verify-screenshots/。
 *   Playwright 只在這裡載入（找不到 playwright 時改用 /opt/node22 的全域安裝）；兩處都載入不到時記「執行中斷：啟動瀏覽器」，報告標示未完成（#180）。
 * 單元測試在 verification-run.test.mjs（瀏覽器與模組載入換成可控的實作，伺服器用真實 HTTP 請求，含網站路徑守門的回歸測試）。
 */
import { writeFileSync, appendFileSync, mkdirSync, mkdtempSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { createWebsiteServer } from './website-server.mjs';
import { renderReport } from './verify-report.mjs';

// 拋出的值不一定是 Error：message 取值或轉字串本身也可能拋錯，這時仍要能記下失敗。
function describe(error) {
  try { return String(error?.message || error); } catch { return '（無法取得錯誤訊息）'; }
}

// 一次驗證持有自己的資源與結果；檢查敘述只取得 browser、base、shots、ok。
// browserType 是 Playwright 的 Chromium adapter；測試可提供同一介面的可控實作。
// importModule 預設是動態 import，測試可換成一定失敗的實作。
export async function runVerification({ root, args = [], staticChecks, browserChecks, linkChecks,
  browserType, importModule = specifier => import(specifier), log = console.log, githubOutput = process.env.GITHUB_OUTPUT, cleanupTimeout = 5000 }) {
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
      // 網站請求了 % 編碼壞掉的網址（伺服器已回 400）：每個不同的路徑記一列失敗，不中斷驗證（#195）。
      // 以路徑（? 之前）去重，查詢字串不同不另記；說明是第一次看到的原始網址。經過 ok，中斷之後才到的請求不記
      const malformedPaths = new Set();
      const onMalformedUrl = url => {
        const path = url.split('?')[0];
        if (malformedPaths.has(path)) return;
        malformedPaths.add(path);
        ok('網站請求的網址編碼正確', false, url);
      };
      server = createWebsiteServer(root, rejectServing, onMalformedUrl);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      phase = '啟動瀏覽器';
      if (!browserType) {
        // 兩處都載入不到時，兩個錯誤都寫進 detail：已安裝但載入失敗（版本不合、安裝損壞）的原因在第一個
        try { ({ chromium: browserType } = await importModule('playwright')); }
        catch (first) {
          try { ({ chromium: browserType } = await importModule('/opt/node22/lib/node_modules/playwright/index.mjs')); }
          catch (second) { throw new Error(`playwright：${describe(first)}；/opt/node22 的備援：${describe(second)}`); }
        }
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
  // 摘要的數字是更新截圖之前的；更新截圖失敗時，接著印出那一筆 FAIL 與修正後的摘要。
  const summary = `${results.filter(r => r.pass).length}/${results.length} 通過`;
  if (staticOnly) say(`\n${summary}（--static 不寫入 verify-report.md）`);
  else if (browserOnly) say(`\n${summary}（--only 不寫入 verify-report.md）`);
  else {
    say(`\n${summary} → verify-report.md`);
    if (runDir) say(`本次產物：${runDir}`);
  }
  // 先寫本次產物，再更新維護用報告；任一寫入失敗也回傳失敗。
  const at = new Date().toISOString();
  let reportFailed = false;
  const writeReports = ({ pending = false } = {}) => {
    const report = renderReport(results, { mode: args.join(' ') || 'full', at, incomplete: incomplete || pending });
    for (const file of [runDir && join(runDir, 'verify-report.md'), join(root, 'verify-report.md')].filter(Boolean)) {
      try { writeFileSync(file, report); }
      catch (error) { reportFailed = true; say(`FAIL  寫入報告 ${file} — ${error.message}`); }
    }
  };
  if (!staticOnly && !browserOnly) {
    // 全部通過時接著要更新維護用截圖：報告先標示未完成，截圖更新成功才重寫成最終版，
    // 之後任一步失敗，留下的報告都不會寫成全部完成。
    const updatesScreenshots = results.every(r => r.pass);
    writeReports({ pending: updatesScreenshots });
    // 報告都寫成功、而且全部通過，才更新維護用截圖：報告寫不出來時，截圖不能先換成這次的。
    // 失敗執行保留自己的部分截圖。更新截圖失敗時重寫報告，記下那一筆。
    if (!reportFailed && updatesScreenshots) {
      try { cpSync(shots, join(root, 'verify-screenshots'), { recursive: true }); }
      catch (error) {
        fail('更新截圖', error);
        say(`更新截圖失敗，修正後：${results.filter(r => r.pass).length}/${results.length} 通過`);
      }
      writeReports();
    }
  }
  const exitCode = reportFailed || results.some(r => !r.pass) ? 1 : 0;
  return { exitCode, results, incomplete, runDir };
}
