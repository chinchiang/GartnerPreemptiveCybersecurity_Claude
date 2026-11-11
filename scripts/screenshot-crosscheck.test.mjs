// screenshot-crosscheck.test.mjs — 截圖交叉比對（scripts/screenshot-crosscheck.mjs）的測試
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { crosscheck, renderMarkdown, SCREENSHOT_SOURCES } from './screenshot-crosscheck.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = fileURLToPath(new URL('./screenshot-crosscheck.mjs', import.meta.url));

// 截圖的內容只用來比對位元組，這裡用短字串代替 PNG
const shots = (entries) => new Map(Object.entries(entries).map(([name, s]) => [name, Buffer.from(s)]));
const verdicts = (rows) => Object.fromEntries(rows.map(r => [r.name, r.verdict]));

test('crosscheck：兩次執行相同、也跟已提交的相同，結論是不用動', () => {
  const rows = crosscheck({ push: shots({ 'io.png': 'A' }), pr: shots({ 'io.png': 'A' }), committed: shots({ 'io.png': 'A' }), changedFiles: [] });
  assert.deepEqual(verdicts(rows), { 'io.png': 'unchanged' });
});

test('crosscheck：兩次執行相同、跟已提交的不同，PR 改了那一頁的來源：畫面有變，列出改到的來源', () => {
  const rows = crosscheck({ push: shots({ 'platforms.png': 'B' }), pr: shots({ 'platforms.png': 'B' }), committed: shots({ 'platforms.png': 'A' }),
    changedFiles: ['data/platforms.js', 'docs/guides/grok.md'] });
  assert.equal(rows[0].verdict, 'changed');
  assert.deepEqual(rows[0].touched, ['data/platforms.js']);
});

test('crosscheck：兩次執行相同、跟已提交的不同，但 PR 沒改到那一頁的來源：要比對以前的 run，不判成雜訊', () => {
  const rows = crosscheck({ push: shots({ 'io.png': 'B' }), pr: shots({ 'io.png': 'B' }), committed: shots({ 'io.png': 'A' }),
    changedFiles: ['data/platforms.js'] });
  assert.equal(rows[0].verdict, 'changed-untouched');
  assert.deepEqual(rows[0].touched, []);
});

test('crosscheck：PR 改了 assets/ 或 index.html，每張截圖都算改到來源', () => {
  for (const file of ['assets/styles.css', 'index.html']) {
    const rows = crosscheck({ push: shots({ 'io.png': 'B' }), pr: shots({ 'io.png': 'B' }), committed: shots({ 'io.png': 'A' }), changedFiles: [file] });
    assert.equal(rows[0].verdict, 'changed', file);
    assert.deepEqual(rows[0].touched, [file]);
  }
});

test('crosscheck：兩次執行不同、其中一次跟已提交的相同，是雜訊；兩次都跟已提交的不同，無法自動判斷', () => {
  const rows = crosscheck({
    push: shots({ 'a.png': 'A', 'b.png': 'B', 'c.png': 'B' }),
    pr: shots({ 'a.png': 'B', 'b.png': 'A', 'c.png': 'C' }),
    committed: shots({ 'a.png': 'A', 'b.png': 'A', 'c.png': 'A' }),
    changedFiles: [] });
  assert.deepEqual(verdicts(rows), { 'a.png': 'noise', 'b.png': 'noise', 'c.png': 'undecided' });
});

test('crosscheck：只有一次執行產生的截圖、已提交但兩次都沒產生的截圖，各自列出；依檔名排序', () => {
  const rows = crosscheck({
    push: shots({ 'b.png': 'A', 'c.png': 'A' }),
    pr: shots({ 'a.png': 'A', 'c.png': 'A' }),
    committed: shots({ 'c.png': 'A', 'd.png': 'A' }),
    changedFiles: [] });
  assert.deepEqual(rows.map(r => [r.name, r.verdict]), [
    ['a.png', 'one-run-only'], ['b.png', 'one-run-only'], ['c.png', 'unchanged'], ['d.png', 'not-produced']]);
});

test('crosscheck：兩次執行都產生、還沒提交過的截圖，算畫面有變', () => {
  const rows = crosscheck({ push: shots({ 'sources.png': 'A' }), pr: shots({ 'sources.png': 'A' }), committed: shots({}),
    changedFiles: ['data/sources.js'] });
  assert.equal(rows[0].verdict, 'changed');
});

test('對照表：verify.mjs 的 ROUTES 與已提交的每張截圖都有對應，對照表也沒有多出來的', () => {
  const routes = JSON.parse(readFileSync(new URL('./verify.mjs', import.meta.url), 'utf8').match(/const ROUTES = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  const committed = execFileSync('git', ['ls-files', 'verify-screenshots/'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(f => f.endsWith('.png')).map(f => f.slice('verify-screenshots/'.length, -'.png'.length));
  const names = Object.keys(SCREENSHOT_SOURCES).sort();
  assert.ok(routes.length >= 9 && committed.length >= 13, `讀到 ${routes.length} 條路由、${committed.length} 張截圖`);
  for (const r of routes) assert.ok(names.includes(r.replace('#/', '')), `ROUTES 的 ${r} 不在對照表`);
  assert.deepEqual(names, [...committed].sort());
});

test('對照表：每個資料檔都存在於 repo', () => {
  for (const [name, files] of Object.entries(SCREENSHOT_SOURCES)) {
    assert.ok(files.length > 0, `${name} 沒有列資料檔`);
    for (const f of files) assert.doesNotThrow(() => readFileSync(new URL(`../${f}`, import.meta.url)), `${name} 的 ${f}`);
  }
});

test('crosscheck：只有一次執行（pr 是 null）時退回單次比對：跟已提交的不同就要看圖，不判定是畫面有變還是雜訊', () => {
  const rows = crosscheck({ push: shots({ 'a.png': 'A', 'b.png': 'B', 'c.png': 'A' }), pr: null, committed: shots({ 'a.png': 'A', 'b.png': 'A', 'd.png': 'A' }),
    changedFiles: ['data/io.js'] });
  assert.deepEqual(rows.map(r => [r.name, r.verdict]), [
    ['a.png', 'unchanged'], ['b.png', 'single-run-diff'], ['c.png', 'single-run-diff'], ['d.png', 'not-produced']]);
});

// 測試用的最小 PNG：8-bit RGB、不交錯、每一列都用 filter 0（CRC 不檢查，解碼器也不看）
function png(width, height, rgb) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = [];
  for (let y = 0; y < height; y++) { raw.push(0); for (let x = 0; x < width; x++) raw.push(...rgb(x, y)); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(raw))), chunk('IEND', Buffer.alloc(0))]);
}

test('crosscheck：不是「不用動」的截圖附上跟已提交版本的像素差異；雜訊用跟已提交不同的那一次', () => {
  const white = png(3, 2, () => [255, 255, 255]);
  const dot = png(3, 2, (x, y) => (x === 2 && y === 1 ? [255, 250, 255] : [255, 255, 255]));
  const rows = crosscheck({
    push: new Map([['changed.png', dot], ['noise.png', white], ['same.png', white]]),
    pr: new Map([['changed.png', dot], ['noise.png', dot], ['same.png', white]]),
    committed: new Map([['changed.png', white], ['noise.png', white], ['same.png', white]]),
    changedFiles: [] });
  const pixel = Object.fromEntries(rows.map(r => [r.name, r.pixel]));
  assert.deepEqual(pixel, {
    'changed.png': { count: '1', maxDelta: '5', bbox: '(2, 1)–(2, 1)' },
    'noise.png': { count: '1', maxDelta: '5', bbox: '(2, 1)–(2, 1)' },
    'same.png': undefined });
});

test('crosscheck：只有一次執行產生、而且跟已提交的相同時，沒有像素差異可列，不會出錯', () => {
  const white = png(1, 1, () => [255, 255, 255]);
  for (const [push, pr] of [[new Map([['a.png', white]]), new Map()], [new Map(), new Map([['a.png', white]])]]) {
    const [row] = crosscheck({ push, pr, committed: new Map([['a.png', white]]), changedFiles: [] });
    assert.equal(row.verdict, 'one-run-only');
    assert.equal(row.pixel, undefined);
  }
});

const px = (count, maxDelta, bbox) => ({ count, maxDelta, bbox });

test('renderMarkdown：依結論分組列出截圖與改到的來源，附像素差異表；不用動的只寫張數', () => {
  const md = renderMarkdown({ pr: 290, sha: '38c7b007af1555fc7ed21bcef3f501867125de61', runs: { push: 111, pull_request: 222 }, rows: [
    { name: 'guides.png', verdict: 'changed', touched: ['data/guides.js'], pixel: px('34081', '255', '(330, 611)–(932, 899)') },
    { name: 'home.png', verdict: 'changed', touched: ['data/manifest.js', 'data/sources.js'], pixel: px('212', '201', '(1050, 853)–(1069, 878)') },
    { name: 'io.png', verdict: 'noise', pixel: px('2', '2', '(10, 10)–(11, 10)') },
    { name: 'skills.png', verdict: 'changed-untouched', touched: [], pixel: px('3', '1', '(1, 1)–(3, 1)') },
    { name: 'case.png', verdict: 'unchanged' },
    { name: 'deploy.png', verdict: 'unchanged' },
  ] });
  assert.equal(md, [
    '- **截圖交叉比對**（PR head `38c7b00`；push run 111、pull_request run 222；`node scripts/screenshot-crosscheck.mjs --pr 290`）：',
    '  - **畫面有變，換成 artifact 的版本**：`guides`（`data/guides.js`）、`home`（`data/manifest.js`、`data/sources.js`）',
    '  - **畫面有變，但 PR 沒改到那一頁的來源，要比對以前的 run**：`skills`',
    '  - **雜訊，保留已提交的版本**：`io`',
    '  - 其餘 2 張跟已提交的相同。',
    '',
    '| 截圖 | 結論 | 不同像素數 | 最大通道差 | 差異範圍 |',
    '|---|---|---|---|---|',
    '| `guides` | 畫面有變 | 34081 | 255 | (330, 611)–(932, 899) |',
    '| `home` | 畫面有變 | 212 | 201 | (1050, 853)–(1069, 878) |',
    '| `io` | 雜訊 | 2 | 2 | (10, 10)–(11, 10) |',
    '| `skills` | 畫面有變，PR 沒改到來源 | 3 | 1 | (1, 1)–(3, 1) |',
    '',
  ].join('\n'));
});

test('renderMarkdown：無法判斷、只有一次執行產生、已提交但沒有產生，各自一組；全部不用動時只寫一行', () => {
  const md = renderMarkdown({ pr: 7, sha: 'abcdef0123456789', runs: { push: 1, pull_request: 2 }, rows: [
    { name: 'a.png', verdict: 'undecided', pixel: px('9', '30', '(0, 0)–(2, 2)') },
    { name: 'b.png', verdict: 'one-run-only', pixel: px('新增', '—', '—') },
    { name: 'c.png', verdict: 'not-produced' },
  ] });
  assert.deepEqual(md.split('\n').slice(0, 4), [
    '- **截圖交叉比對**（PR head `abcdef0`；push run 1、pull_request run 2；`node scripts/screenshot-crosscheck.mjs --pr 7`）：',
    '  - **無法自動判斷，要看圖**：`a`',
    '  - **只有一次執行產生，要用 `ls` 確認**：`b`',
    '  - **已提交但這次沒有產生，網站拿掉了就刪除**：`c`',
  ]);
  assert.ok(md.includes('| `c` | 已提交但這次沒有產生 | — | — | — |'));
  assert.equal(renderMarkdown({ pr: 7, sha: 'abcdef0123456789', runs: { push: 1, pull_request: 2 }, rows: [{ name: 'a.png', verdict: 'unchanged' }] }),
    '- **截圖交叉比對**（PR head `abcdef0`；push run 1、pull_request run 2；`node scripts/screenshot-crosscheck.mjs --pr 7`）：1 張都跟已提交的相同，不用換。\n');
});

test('renderMarkdown：只有一次執行可用時，寫明缺哪一次、退回單次比對', () => {
  const md = renderMarkdown({ pr: 7, sha: 'abcdef0123456789', runs: { push: 1, pull_request: null }, rows: [
    { name: 'a.png', verdict: 'single-run-diff', pixel: px('4', '2', '(0, 0)–(1, 1)') },
    { name: 'b.png', verdict: 'unchanged' },
  ] });
  assert.deepEqual(md.split('\n').slice(0, 3), [
    '- **截圖單次比對**（PR head `abcdef0`；push run 1，沒有可用的 pull_request run（找不到或下載失敗，原因見 stderr），分不出雜訊；`node scripts/screenshot-crosscheck.mjs --pr 7`）：',
    '  - **跟已提交的不同，要看圖確認不是零星的像素差異**：`a`',
    '  - 其餘 1 張跟已提交的相同。',
  ]);
});

// PATH 只剩空目錄：參數有誤時一定要在呼叫 gh、git 之前結束，呼叫了就會以 1（找不到指令）結束而不是 2
const runCli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8',
  env: { ...process.env, PATH: mkdtempSync(join(tmpdir(), 'no-gh-')) } });

test('CLI：--help 印出用法，結束碼 0', () => {
  const r = runCli('--help');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /用法：node scripts\/screenshot-crosscheck\.mjs --pr <n> \[--sha <commit>\] \[--out <目錄>\]/);
});

test('CLI：沒有 --pr、--pr 不是正整數、不認得的參數，結束碼 2，不呼叫 gh', () => {
  for (const args of [[], ['--pr'], ['--pr', 'abc'], ['--pr', '0'], ['--pr', '-3'], ['--pr', '2.5'], ['--pr', '290', '--bogus'], ['--pr', '290', '--out'],
    ['--pr', '290', '--sha', 'main'], ['--pr', '290', '--sha', '38c7b0'], ['--pr', '290', '--sha', 'xyz1234']]) {
    const r = runCli(...args);
    assert.equal(r.status, 2, `${JSON.stringify(args)}：${r.stderr}`);
    assert.match(r.stderr, /用法：/, JSON.stringify(args));
  }
});

test('CLI：參數正確時才去呼叫 gh（PATH 裡沒有 gh，所以以 1 結束、印出錯誤）', () => {
  for (const args of [['--pr', '290'], ['--pr', '290', '--sha', '38c7b00'], ['--pr', '290', '--sha', '38c7b007af1555fc7ed21bcef3f501867125de61', '--out', 'scratch/x']]) {
    const r = runCli(...args);
    assert.equal(r.status, 1, `${JSON.stringify(args)}：${r.stderr}`);
    assert.match(r.stderr, /^screenshot-crosscheck：/, JSON.stringify(args));
  }
});

test('crosscheck：依截圖名稱（不含 .png）排序，home 排在 home-last-updated 前面', () => {
  const rows = crosscheck({ push: shots({ 'home-last-updated.png': 'A', 'home.png': 'A' }), pr: shots({ 'home-last-updated.png': 'A', 'home.png': 'A' }),
    committed: shots({ 'home-last-updated.png': 'A', 'home.png': 'A' }), changedFiles: [] });
  assert.deepEqual(rows.map(r => r.name), ['home.png', 'home-last-updated.png']);
});

test('renderMarkdown：用 --sha 指定 commit 時，標題寫 commit、指令帶上 --sha，照著重跑會比對同一個 commit', () => {
  const md = renderMarkdown({ pr: 290, sha: '38c7b007af1555fc7ed21bcef3f501867125de61', pinned: true, runs: { push: 1, pull_request: 2 },
    rows: [{ name: 'a.png', verdict: 'unchanged' }] });
  assert.equal(md, '- **截圖交叉比對**（commit `38c7b00`；push run 1、pull_request run 2；`node scripts/screenshot-crosscheck.mjs --pr 290 --sha 38c7b00`）：1 張都跟已提交的相同，不用換。\n');
});
