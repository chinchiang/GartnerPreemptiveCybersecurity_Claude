// 瀏覽器檢查骨架（browser-checks.mjs）的單元測試（#100）：unit job 沒有 playwright，launch 換成記憶體裡的假瀏覽器，
// 只做骨架會用到的那一小部分（newContext、on、newPage、goto、waitForSelector、screenshot、url、close），並記下呼叫順序。
// 伺服器照樣用 Node 內建的 http 真的啟動。情境本身怎麼檢查網站，由完整驗證（node scripts/verify.mjs）負責。
// 執行：node --test scripts/browser-checks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { runBrowserChecks } from './browser-checks.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// 假瀏覽器：log 依序記下 newContext／goto／waitForSelector／screenshot／close；contexts 留著每個 context，測試可以對它觸發事件
function fakeBrowser() {
  const log = [], contexts = [];
  const browser = {
    async newContext(options) {
      const id = contexts.length, handlers = {};
      const ctx = {
        id, options, closed: false,
        on(event, handler) { (handlers[event] ||= []).push(handler); },
        emit(event, payload) { for (const h of handlers[event] || []) h(payload); },
        async newPage() {
          let url = 'about:blank';
          return {
            url: () => url,
            async goto(u) { url = u; log.push(['goto', id, u]); },
            async waitForSelector(s) { log.push(['waitForSelector', id, s]); },
            async screenshot(o) { log.push(['screenshot', id, o]); },
          };
        },
        async close() { ctx.closed = true; log.push(['close', id]); },
      };
      contexts.push(ctx);
      log.push(['newContext', id]);
      return ctx;
    },
    async close() { log.push(['close-browser']); },
  };
  return { launch: async () => browser, log, contexts };
}

// 跑骨架，回傳 record 收到的每一列 [name, pass, detail]
async function run(scenarios, { only, fake = fakeBrowser() } = {}) {
  const rows = [];
  await runBrowserChecks(scenarios, { root: ROOT, only, launch: fake.launch, record: (name, pass, detail = '') => rows.push([name, pass, detail]) });
  return rows;
}

test('情境依陣列順序執行，情境裡的 ok 依序轉給 record，最後一列是「無 JS 執行錯誤」', async () => {
  const rows = await run([
    { name: 'A', run: async ({ ok }) => { ok('A1', true); ok('A2', false, '說明'); } },
    { name: 'B', run: async ({ ok }) => { ok('B1', true, 'x'); } },
  ]);
  assert.deepEqual(rows, [['A1', true, ''], ['A2', false, '說明'], ['B1', true, 'x'], ['無 JS 執行錯誤', true, '']]);
});

test('only 只跑指定名稱的情境，其他情境的 run 一次都不呼叫', async () => {
  const called = [];
  const rows = await run([
    { name: 'A', run: async ({ ok }) => { called.push('A'); ok('A1', true); } },
    { name: 'B', run: async ({ ok }) => { called.push('B'); ok('B1', true); } },
  ], { only: ['B'] });
  assert.deepEqual(called, ['B']);
  assert.deepEqual(rows, [['B1', true, ''], ['無 JS 執行錯誤', true, '']]);
});

test('每次 open 都開一個新的 context：baseURL 是本機伺服器，寬高對應 viewport（高預設 900），clipboard 對應剪貼簿權限，downloads 對應 acceptDownloads', async () => {
  const fake = fakeBrowser();
  await run([{ name: 'A', run: async ({ open }) => {
    await open('#/', { width: 390, height: 844 });
    await open('#/skills', { width: 1280, clipboard: true, downloads: true });
  } }], { fake });
  const base = fake.log.find(([op]) => op === 'goto')[2].replace('#/', '');
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.deepEqual(fake.contexts.map(c => c.options), [
    { baseURL: base, viewport: { width: 390, height: 844 } },
    { baseURL: base, viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true },
  ]);
});

test('open 先 goto 骨架啟動的本機伺服器加上路徑，等 h1 出現後才把頁面交給情境', async () => {
  const fake = fakeBrowser();
  let seenWhenOpened;
  await run([{ name: 'A', run: async ({ open }) => { await open('#/io', { width: 1280 }); seenWhenOpened = fake.log.filter(([op]) => op === 'goto' || op === 'waitForSelector'); } }], { fake });
  assert.equal(seenWhenOpened.length, 2);
  assert.match(seenWhenOpened[0][2], /^http:\/\/127\.0\.0\.1:\d+\/#\/io$/);
  assert.deepEqual(seenWhenOpened.map(([op, , arg]) => op === 'goto' ? op : [op, arg]), ['goto', ['waitForSelector', 'h1']]);
});

test('情境正常結束後關掉它開過的所有 context，下一個情境開始前就已關好；全部跑完後關掉瀏覽器', async () => {
  const fake = fakeBrowser();
  let closedWhenBStarts;
  await run([
    { name: 'A', run: async ({ open }) => { await open('#/', { width: 1280 }); await open('#/', { width: 390 }); } },
    { name: 'B', run: async ({ open }) => { closedWhenBStarts = fake.contexts.map(c => c.closed); await open('#/', { width: 1280 }); } },
  ], { fake });
  assert.deepEqual(closedWhenBStarts, [true, true]);
  assert.deepEqual(fake.contexts.map(c => c.closed), [true, true, true]);
  assert.deepEqual(fake.log.at(-1), ['close-browser']);
});

test('情境丟出例外：保留已記的列，接著記「情境「A」中斷」（說明是訊息第一行），關掉它開過的 context，繼續跑下一個情境', async () => {
  const fake = fakeBrowser();
  const rows = await run([
    { name: 'A', run: async ({ open, ok }) => { await open('#/', { width: 1280 }); ok('A1', true); throw new Error('找不到 .tabs button\n    at 第二行'); } },
    { name: 'B', run: async ({ ok }) => { ok('B1', true); } },
  ], { fake });
  assert.deepEqual(rows, [['A1', true, ''], ['情境「A」中斷', false, '找不到 .tabs button'], ['B1', true, ''], ['無 JS 執行錯誤', true, '']]);
  assert.deepEqual(fake.contexts.map(c => c.closed), [true]);
});

test('context 層收到的未捕捉例外與 console error 彙總成最後一列：「<寬度>px <網址>：<訊息>」，最多列 3 則，超過時註明總數', async () => {
  // 每個情境開一頁後觸發 errors 裡的事件；page 為 null 時代表抓不到頁面
  const scenarioEmitting = (fake, events) => ({ name: 'A', run: async ({ open }) => {
    const desk = await open('#/x', { width: 1280 }), phone = await open('#/', { width: 390 });
    const pageOf = { desk, phone, none: null };
    for (const [ctxIndex, kind, where, text] of events) {
      const page = () => pageOf[where];
      fake.contexts[ctxIndex].emit(kind === 'weberror' ? 'weberror' : 'console',
        kind === 'weberror' ? { page, error: () => ({ message: text }) } : { page, type: () => kind, text: () => text });
    }
  } });
  const fake = fakeBrowser();
  const rows = await run([scenarioEmitting(fake, [[0, 'weberror', 'desk', 'boom'], [1, 'error', 'phone', '載入失敗'], [1, 'warning', 'phone', '只是警告'], [0, 'weberror', 'none', '沒有頁面']])], { fake });
  assert.deepEqual(rows.at(-1), ['無 JS 執行錯誤', false, '1280px #/x：boom | 390px #/：載入失敗 | 1280px ?：沒有頁面']);

  const fake4 = fakeBrowser();
  const rows4 = await run([scenarioEmitting(fake4, [[0, 'weberror', 'desk', 'e1'], [0, 'weberror', 'desk', 'e2'], [0, 'weberror', 'desk', 'e3'], [0, 'weberror', 'desk', 'e4']])], { fake: fake4 });
  assert.deepEqual(rows4.at(-1), ['無 JS 執行錯誤', false, '1280px #/x：e1 | 1280px #/x：e2 | 1280px #/x：e3（共 4 則）']);
});

test('shot 把截圖寫到 <root>/verify-screenshots/<名稱>.png，fullPage 原樣傳下去', async () => {
  const fake = fakeBrowser();
  await run([{ name: 'A', run: async ({ open, shot }) => {
    const page = await open('#/', { width: 1280 });
    await shot(page, 'home');
    await shot(page, 'case-interactive', { fullPage: true });
  } }], { fake });
  assert.deepEqual(fake.log.filter(([op]) => op === 'screenshot').map(([, , o]) => o), [
    { path: join(ROOT, 'verify-screenshots', 'home.png') },
    { path: join(ROOT, 'verify-screenshots', 'case-interactive.png'), fullPage: true },
  ]);
});

test('本機伺服器：/ 是 repo 的 index.html，?stamped 以固定時間填好最後更新時間，找不到的檔案回 404，content-type 依副檔名', async () => {
  let got;
  await run([{ name: 'A', run: async ({ open }) => {
    const base = (await open('#/', { width: 1280 })).url().replace('#/', '');
    const plain = await fetch(base), stamped = await fetch(`${base}?stamped`), missing = await fetch(`${base}no-such-file.txt`), css = await fetch(`${base}assets/styles.css`);
    got = { plain: await plain.text(), stamped: await stamped.text(), missing: missing.status, css: css.headers.get('content-type') };
  } }]);
  assert.match(got.plain, /<meta name="last-updated" content="">/);
  assert.match(got.stamped, /<meta name="last-updated" content="2026-10-17T16:30:00\+00:00">/);
  assert.equal(got.missing, 404);
  assert.equal(got.css, 'text/css');
});

test('骨架本身的錯誤直接中止：launch 丟出例外時 runBrowserChecks 也丟出，本機伺服器照樣關掉', async () => {
  // 關掉的伺服器要過一會兒才從 getActiveResourcesInfo 消失（Windows 比 Linux 慢），所以輪詢到沒有 TCP 伺服器為止，最多等 1 秒；
  // 前一支測試的伺服器也先等它消失，計數才不會互相抵銷
  const servers = () => process.getActiveResourcesInfo().filter(r => r === 'TCPServerWrap').length;
  const noServerWithin = async (ms) => { for (const end = Date.now() + ms; servers() > 0 && Date.now() < end;) await new Promise(r => setTimeout(r, 10)); return servers() === 0; };
  assert.ok(await noServerWithin(1000), '測試開始前還有沒關的伺服器');
  const launch = async () => { throw new Error('瀏覽器啟動失敗'); };
  await assert.rejects(runBrowserChecks([{ name: 'A', run: async () => {} }], { root: ROOT, launch, record: () => {} }), /瀏覽器啟動失敗/);
  assert.ok(await noServerWithin(1000), '本機伺服器沒有關掉');
});
