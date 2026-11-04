/**
 * browser-checks.mjs — 瀏覽器檢查的骨架：本機伺服器、每個情境全新的 context、錯誤彙總
 * 瀏覽器檢查的骨架（#100）：verify.mjs 的各個情境透過 open／ok／shot 掛上來。
 * 骨架負責本機伺服器（含 ?stamped）、瀏覽器、每次 open 的新 context、context 層的錯誤監聽、截圖目錄；
 * 若傳入 session，伺服器、瀏覽器與產物目錄由 verification-run.mjs 持有，骨架只管理情境及各自的 context。
 * 情境 { name, run } 依陣列順序執行，彼此獨立：每個情境結束（或丟出例外）時，骨架關掉它開過的所有 context。
 * 單元測試在 browser-checks.test.mjs（launch 換成假瀏覽器）；情境本身由完整驗證（node scripts/verify.mjs）負責。
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { createWebsiteServer } from './verification-run.mjs';

// 本機伺服器：把 root 底下的檔案原樣送出，回傳 base（http://127.0.0.1:<port>/）與 close（等伺服器真的關好才 resolve）
async function serve(root) {
  const server = createWebsiteServer(root).listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { base: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => server.close(resolve)) };
}

// 預設的 launch：載入 playwright（找不到時改用 /opt/node22 的全域安裝），啟動 chromium。
// 兩處都載入不到時記一列「Playwright 可用」FAIL 並回傳 null，骨架就不跑任何情境
export async function launchChromium(record) {
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { try { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); } catch (e) { record('Playwright 可用', false, e.message); return null; } }
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
}

// scenarios：[{ name, run({ open, ok, shot }) }]；only：只跑這些名稱的情境；record(name, pass, detail)：收結果（verify.mjs 傳入自己的 ok）。
// launch(record)：回傳瀏覽器（要有 newContext、close）；回傳 null 表示瀏覽器無法使用（它自己已記好原因），這時不跑任何情境、
// 也不記「無 JS 執行錯誤」。丟出例外則視為骨架本身的錯誤，直接中止（伺服器照樣關掉）
export async function runBrowserChecks(scenarios, { root, only, launch = launchChromium, record, session }) {
  if (session) return runScenarios(scenarios, { ...session, only, record });
  const server = await serve(root);
  try {
    const browser = await launch(record);
    if (!browser) return;
    try {
      await runScenarios(scenarios, { browser, base: server.base, shots: join(root, 'verify-screenshots'), only, record });
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
}

// 接受外部持有的資源時只管理情境與 context；伺服器及瀏覽器由驗證生命週期關閉。
async function runScenarios(scenarios, { browser, base, shots, only, record, isActive = () => true }) {
  const selected = only ? scenarios.filter(s => only.includes(s.name)) : scenarios;
  const errors = [];
  mkdirSync(shots, { recursive: true });
  const shot = (page, name, { fullPage } = {}) => page.screenshot({ path: join(shots, `${name}.png`), ...(fullPage && { fullPage }) });
  for (const s of selected) {
    if (!isActive()) break;
    const contexts = [];
    const open = opener(browser, base, contexts, errors);
    // 情境之間互相獨立：一個情境丟出例外，記一列中斷就換下一個，不讓它遮住其他情境的結果
    try { await s.run({ open, ok: record, shot }); }
    catch (e) { record(`情境「${s.name}」中斷`, false, String(e?.message ?? e).split('\n')[0]); }
    finally { for (const ctx of contexts) await ctx.close(); }
  }
  record('無 JS 執行錯誤', errors.length === 0, errors.slice(0, 3).join(' | ') + (errors.length > 3 ? `（共 ${errors.length} 則）` : ''));
}

// 一個情境用的 open：每次都開新的 context（記進 contexts，情境結束時由骨架關掉），goto 到 base + 路徑後等 h1 出現。
// context 設了 baseURL，情境在同一頁換路由時可以寫相對路徑（page.goto('#/process')、page.goto('?stamped#/')）。
// 一律 reducedMotion: 'reduce'，讓 assets/styles.css 的 prefers-reduced-motion 樣式生效（關掉 smooth scroll、transition、animation），
// 截圖才不會拍到動畫的不同進度（漢堡選單、topbar 的 .pulse）；要檢查動畫本身的情境得自己另開 context
function opener(browser, base, contexts, errors) {
  return async (path, { width, height = 900, clipboard, downloads } = {}) => {
    const options = { baseURL: base, viewport: { width, height }, reducedMotion: 'reduce' };
    if (clipboard) options.permissions = ['clipboard-read', 'clipboard-write'];
    if (downloads) options.acceptDownloads = true;
    const ctx = await browser.newContext(options);
    contexts.push(ctx);
    // 在 context 層收未捕捉的例外與 console error，涵蓋其中每一個頁面（#86）；每則記成「<寬度>px <去掉 base 的網址>：<訊息>」，抓不到頁面時網址寫 ?
    const where = pg => `${width}px ${pg ? pg.url().replace(base, '') : '?'}`;
    ctx.on('weberror', e => errors.push(`${where(e.page())}：${e.error().message}`));
    ctx.on('console', m => { if (m.type() === 'error') errors.push(`${where(m.page())}：${m.text()}`); });
    const page = await ctx.newPage();
    await page.goto(base + path);
    await page.waitForSelector('h1');
    return page;
  };
}
