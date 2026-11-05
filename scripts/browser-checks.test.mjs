// browser-checks.test.mjs — 瀏覽器檢查骨架的單元測試，session 的瀏覽器換成假瀏覽器
// 瀏覽器檢查骨架（browser-checks.mjs）的單元測試（#100）：unit job 沒有 playwright，session 的瀏覽器換成記憶體裡的假瀏覽器，
// 只做骨架會用到的那一小部分（newContext、on、newPage、goto、waitForSelector、screenshot、url、close），並記下呼叫順序。
// 伺服器與瀏覽器的啟動、關閉屬於一次驗證的生命週期，在 verification-run.test.mjs；情境本身怎麼檢查網站，由完整驗證（node scripts/verify.mjs）負責。
// 執行：node --test scripts/browser-checks.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { runBrowserChecks, anchorInViewport } from './browser-checks.mjs';

// session 的 base 與截圖目錄：骨架不連線（假瀏覽器），截圖目錄由骨架建立
const BASE = 'http://127.0.0.1:1/';
const SHOTS = join(mkdtempSync(join(tmpdir(), 'browser-checks-')), 'shots');
after(() => rmSync(join(SHOTS, '..'), { recursive: true, force: true }));

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
  await runBrowserChecks(scenarios, { only, record: (name, pass, detail = '') => rows.push([name, pass, detail]),
    session: { browser: await fake.launch(), base: BASE, shots: SHOTS } });
  return rows;
}

test('沒有 session 時直接丟出錯誤：伺服器、瀏覽器與產物目錄只由驗證生命週期（runVerification）持有', async () => {
  await assert.rejects(runBrowserChecks([{ name: 'A', run: async () => {} }], { record: () => {} }),
    { message: 'runBrowserChecks 需要 session（{ browser, base, shots }），由 verification-run.mjs 的 runVerification 提供' });
});

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

test('每次 open 都開一個新的 context：baseURL 是 session 的 base，寬高對應 viewport（高預設 900），一律 reducedMotion: reduce（截圖才固定），clipboard 對應剪貼簿權限，downloads 對應 acceptDownloads', async () => {
  const fake = fakeBrowser();
  await run([{ name: 'A', run: async ({ open }) => {
    await open('#/', { width: 390, height: 844 });
    await open('#/skills', { width: 1280, clipboard: true, downloads: true });
  } }], { fake });
  assert.deepEqual(fake.contexts.map(c => c.options), [
    { baseURL: 'http://127.0.0.1:1/', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' },
    { baseURL: 'http://127.0.0.1:1/', viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true },
  ]);
});

test('open 先 goto session 的 base 加上路徑，等 h1 出現後才把頁面交給情境', async () => {
  const fake = fakeBrowser();
  let seenWhenOpened;
  await run([{ name: 'A', run: async ({ open }) => { await open('#/io', { width: 1280 }); seenWhenOpened = fake.log.filter(([op]) => op === 'goto' || op === 'waitForSelector'); } }], { fake });
  assert.deepEqual(seenWhenOpened, [['goto', 0, 'http://127.0.0.1:1/#/io'], ['waitForSelector', 0, 'h1']]);
});

test('情境正常結束後關掉它開過的所有 context，下一個情境開始前就已關好；瀏覽器屬於 session，骨架不關', async () => {
  const fake = fakeBrowser();
  let closedWhenBStarts;
  await run([
    { name: 'A', run: async ({ open }) => { await open('#/', { width: 1280 }); await open('#/', { width: 390 }); } },
    { name: 'B', run: async ({ open }) => { closedWhenBStarts = fake.contexts.map(c => c.closed); await open('#/', { width: 1280 }); } },
  ], { fake });
  assert.deepEqual(closedWhenBStarts, [true, true]);
  assert.deepEqual(fake.contexts.map(c => c.closed), [true, true, true]);
  assert.equal(fake.log.some(([op]) => op === 'close-browser'), false);
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

test('shot 把截圖寫到 session 的截圖目錄 <shots>/<名稱>.png（目錄由骨架建立），fullPage 原樣傳下去', async () => {
  const fake = fakeBrowser();
  await run([{ name: 'A', run: async ({ open, shot }) => {
    const page = await open('#/', { width: 1280 });
    await shot(page, 'home');
    await shot(page, 'case-interactive', { fullPage: true });
  } }], { fake });
  assert.deepEqual(fake.log.filter(([op]) => op === 'screenshot').map(([, , o]) => o), [
    { path: join(SHOTS, 'home.png') },
    { path: join(SHOTS, 'case-interactive.png'), fullPage: true },
  ]);
  assert.ok(statSync(SHOTS).isDirectory());
});

test('目錄錨點：捲動須到達可視範圍，不能只因 scrollY 大於零就通過', () => {
  const evaluate = ({ y = 0, top = 200, bottom = 240, height = 40, exists = true, hash = '#/methodology?doc=01-definition#target' } = {}) =>
    vm.runInNewContext(`(${anchorInViewport.toString()})({ id: 'target', documentId: '01-definition' })`, {
      location: { hash }, window: { scrollY: y, innerHeight: 900 },
      document: { getElementById: id => id === 'target' && exists ? { getBoundingClientRect: () => ({ top, bottom, height }) } : null,
        querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 80 }) }) },
    });
  assert.equal(evaluate({ y: 1364 }), true);
  assert.equal(evaluate({ y: 0 }), false);
  assert.equal(evaluate({ y: 8, top: 1555, bottom: 1595 }), false);
  assert.equal(evaluate({ y: 1364, top: 20, bottom: 60 }), false);
  assert.equal(evaluate({ y: 1364, exists: false }), false);
  assert.equal(evaluate({ y: 1364, height: 0 }), false);
  assert.equal(evaluate({ y: 1364, hash: '#/methodology?doc=02-relations#target' }), false);
});
