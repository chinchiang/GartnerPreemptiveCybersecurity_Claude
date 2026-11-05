/**
 * browser-checks.mjs — 瀏覽器檢查的骨架：每個情境全新的 context、錯誤彙總、截圖
 * 瀏覽器檢查的骨架（#100）：verify.mjs 的各個情境透過 open／ok／shot 掛上來。
 * 伺服器、瀏覽器與產物目錄由 verification-run.mjs 的 runVerification 持有，以 session 傳入（必填，#180）；
 * 骨架只管理情境、每次 open 的新 context、context 層的錯誤監聽與截圖目錄。
 * 情境 { name, run } 依陣列順序執行，彼此獨立：每個情境結束（或丟出例外）時，骨架關掉它開過的所有 context。
 * anchorInViewport：目錄錨點是否已捲入可視範圍，由 Playwright 在頁面中執行（放在這裡，測試才能 import：verify.mjs 載入時就會執行驗證）。
 * 單元測試在 browser-checks.test.mjs（session 的瀏覽器換成假瀏覽器）；情境本身由完整驗證（node scripts/verify.mjs）負責。
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// scenarios：[{ name, run({ open, ok, shot }) }]；only：只跑這些名稱的情境；record(name, pass, detail)：收結果（verify.mjs 傳入自己的 ok）。
// session：{ browser, base, shots, isActive }，由 verification-run.mjs 的 runVerification 提供；伺服器、瀏覽器與產物目錄只由它持有與關閉（#180）
export async function runBrowserChecks(scenarios, { only, record, session }) {
  if (!session) throw new Error('runBrowserChecks 需要 session（{ browser, base, shots }），由 verification-run.mjs 的 runVerification 提供');
  return runScenarios(scenarios, { ...session, only, record });
}

// 只管理情境與 context；伺服器及瀏覽器由驗證生命週期（runVerification）關閉。
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

// 由 Playwright 在頁面中執行；以實際目標位置判定，不依賴動畫耗時。
export function anchorInViewport({ id, documentId }) {
  const target = document.getElementById(id);
  if (!target || !location.hash.includes(`doc=${documentId}`) || window.scrollY <= 0) return false;
  const rect = target.getBoundingClientRect();
  const headerBottom = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
  return rect.height > 0 && rect.top >= headerBottom && rect.bottom <= window.innerHeight;
}
