import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, mkdtempSync, cpSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, sep } from 'node:path';
import { createServer } from 'node:http';
import { stampLastUpdated } from './stamp-last-updated.mjs';

function withinRoot(root, file) {
  const path = relative(root, file);
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
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
  let acceptingChecks = true;
  const record = (name, pass, detail = '') => {
    results.push({ name, pass: !!pass, detail: String(detail) });
    log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };
  const ok = (...result) => { if (acceptingChecks) record(...result); };
  const staticOnly = args.includes('--static');
  let phase = '初始化', incomplete = false, browser, server, runDir, shots;
  const fail = (name, error) => {
    incomplete = true;
    record(name, false, error?.message || String(error));
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
    await staticChecks(ok);
    if (!staticOnly) {
      phase = '啟動伺服器';
      const stampedAt = '2026-10-17T16:30:00+00:00';
      let rejectServing;
      const servingFailure = new Promise((_, reject) => { rejectServing = reject; });
      servingFailure.catch(() => {}); // 啟動瀏覽器期間也可能失敗，避免未處理的拒絕。
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.zip': 'application/zip', '.md': 'text/markdown', '.csv': 'text/csv' };
      const realRoot = realpathSync(root);
      server = createServer((req, res) => {
        try {
          let p = decodeURIComponent(req.url.split('?')[0]).replace(/\\/g, '/'); if (p === '/') p = '/index.html';
          if (!p.startsWith('/')) { res.writeHead(403); res.end(); return; }
          const file = resolve(realRoot, '.' + p);
          if (!withinRoot(realRoot, file)) { res.writeHead(403); res.end(); return; }
          if (!existsSync(file)) { res.writeHead(404); res.end(); return; }
          const realFile = realpathSync(file);
          if (!withinRoot(realRoot, realFile)) { res.writeHead(403); res.end(); return; }
          if (!statSync(realFile).isFile()) { res.writeHead(404); res.end(); return; }
          const body = p === '/index.html' && req.url.includes('?stamped')
            ? stampLastUpdated(readFileSync(realFile, 'utf8'), stampedAt) : readFileSync(realFile);
          res.writeHead(200, { 'content-type': mime[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream' }); res.end(body);
        } catch (error) { rejectServing(new Error(`提供網站檔案：${error.message}`)); res.writeHead(500); res.end(); }
      });
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
      await Promise.race([browserChecks({ browser, base: `http://127.0.0.1:${server.address().port}/`, shots, stampedAt, ok }), servingFailure]);
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
  // 只有全部通過才更新維護用截圖；失敗執行保留自己的部分截圖。
  if (!staticOnly && !incomplete && results.every(r => r.pass)) {
    try { cpSync(shots, join(root, 'verify-screenshots'), { recursive: true }); }
    catch (error) { fail('更新截圖', error); }
  }
  const passed = results.filter(r => r.pass).length;
  const cell = text => String(text).replace(/\r\n?|\n/g, ' ').replace(/\|/g, '/');
  const status = incomplete ? '狀態：未完成（未執行的檢查不列為通過）\n' : '';
  const report = `# 驗證報告\n\n執行時間：${new Date().toISOString()}\n模式：${args.join(' ') || 'full'}\n${status}結果：${passed}/${results.length} 通過\n\n| 檢查 | 結果 | 說明 |\n|---|---|---|\n${results.map(r => `| ${cell(r.name)} | ${r.pass ? '✅' : '❌'} | ${cell(r.detail)} |`).join('\n')}\n`;
  let exitCode = incomplete || passed !== results.length ? 1 : 0;
  if (staticOnly) log(`\n${passed}/${results.length} 通過（--static 不寫入 verify-report.md）`);
  else {
    // 先寫本次產物，再更新維護用報告；任一寫入失敗也回傳失敗。
    for (const file of [runDir && join(runDir, 'verify-report.md'), join(root, 'verify-report.md')].filter(Boolean)) {
      try { writeFileSync(file, report); }
      catch (error) { exitCode = 1; log(`FAIL  寫入報告 ${file} — ${error.message}`); }
    }
    log(`\n${passed}/${results.length} 通過 → verify-report.md`);
    if (runDir) log(`本次產物：${runDir}`);
  }
  return { exitCode, results, incomplete, runDir };
}
