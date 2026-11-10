// screenshot-diff.test.mjs — CI 截圖跟已提交版本的比對（scripts/screenshot-diff.mjs）的測試
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { pixelDiff } from './screenshot-diff.mjs';

const CLI = fileURLToPath(new URL('./screenshot-diff.mjs', import.meta.url));

// 2×2 的 RGBA 小圖：像素依列優先排列，(x, y) 在 data 的位置是 (y * width + x) * 4
const image = (width, height, pixels) => ({ width, height, data: Uint8ClampedArray.from(pixels.flat()) });
const WHITE = [255, 255, 255, 255];

test('pixelDiff：完全相同的兩張圖沒有不同的像素', () => {
  const a = image(2, 2, [WHITE, WHITE, WHITE, WHITE]);
  const b = image(2, 2, [WHITE, WHITE, WHITE, WHITE]);
  assert.deepEqual(pixelDiff(a, b), { count: 0, maxDelta: 0, bbox: null });
});

test('pixelDiff：只差一個像素時，範圍就是那個像素', () => {
  const a = image(2, 2, [WHITE, WHITE, WHITE, WHITE]);
  const b = image(2, 2, [WHITE, [255, 250, 255, 255], WHITE, WHITE]);
  assert.deepEqual(pixelDiff(a, b), { count: 1, maxDelta: 5, bbox: [1, 0, 1, 0] });
});

test('pixelDiff：全部不同時，最大的通道差可能來自任一個通道', () => {
  const a = image(2, 2, [WHITE, WHITE, WHITE, WHITE]);
  // 每個像素差在不同的通道；最大的 40 在 B
  const b = image(2, 2, [[245, 255, 255, 255], [255, 235, 255, 255], [255, 255, 215, 255], [254, 253, 252, 255]]);
  assert.deepEqual(pixelDiff(a, b), { count: 4, maxDelta: 40, bbox: [0, 0, 1, 1] });
});

test('pixelDiff：多個不同點時，範圍的四個邊各自取最外側的點', () => {
  // 4×4，不同點在 (2,1)、(3,2)、(1,3)：上邊來自 (2,1)、右邊來自 (3,2)、左邊與下邊來自 (1,3)
  const base = Array.from({ length: 16 }, () => WHITE);
  const changed = base.slice();
  changed[1 * 4 + 2] = [248, 255, 255, 255];
  changed[2 * 4 + 3] = [255, 246, 255, 255];
  changed[3 * 4 + 1] = [255, 255, 252, 255];
  assert.deepEqual(pixelDiff(image(4, 4, base), image(4, 4, changed)), { count: 3, maxDelta: 9, bbox: [1, 1, 3, 3] });
});

test('pixelDiff：只差 alpha 不算不同（截圖都是不透明的）', () => {
  const a = image(2, 2, [WHITE, WHITE, WHITE, WHITE]);
  const b = image(2, 2, [WHITE, [255, 255, 255, 0], WHITE, WHITE]);
  assert.deepEqual(pixelDiff(a, b), { count: 0, maxDelta: 0, bbox: null });
});

// ---- CLI：比對執行目錄的 verify-screenshots/ 與 HEAD 已提交的 verify-screenshots/ ----

// 測試用的 PNG 編碼器：8-bit、不交錯，channels 3 是 RGB（Playwright 截圖用的格式）、4 是 RGBA。
// 預設每一列輪流用 5 種 filter（None、Sub、Up、Average、Paeth），讓 CLI 的解碼器每一種都會走到；
// filter 指定每一列用哪一種，rows 是實際寫進 IDAT 的列數（少於 height 時就是資料不足的 PNG）。
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function encodePng(width, height, px, { channels = 3, filter: filterOf = (y) => y % 5, rows = height } = {}) {
  const stride = width * channels, raw = [];
  const at = (row, i) => (row < 0 || i < 0 ? 0 : px[row * stride + i]);
  for (let y = 0; y < rows; y++) {
    const filter = filterOf(y);
    raw.push(filter);
    for (let i = 0; i < stride; i++) {
      const x = at(y, i), a = at(y, i - channels), b = at(y - 1, i), c = at(y - 1, i - channels);
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      raw.push((x - predictor) & 0xff);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from(raw))), chunk('IEND', Buffer.alloc(0))]);
}
// 每個位元組都不同的內容（filter 才有東西可預測），預設 RGB
const pattern = (width, height, channels = 3) => Array.from({ length: width * height * channels }, (_, i) => (i * 37 + 11) % 256);
const md5 = (buf) => createHash('md5').update(buf).digest('hex');

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};
// 暫存的 git repo：committed 的截圖提交到 HEAD 的 verify-screenshots/，produced 的截圖放在執行目錄的 verify-screenshots/
function fixture(committed, produced) {
  const repo = mkdtempSync(join(tmpdir(), 'screenshot-diff-'));
  mkdirSync(join(repo, 'verify-screenshots'));
  for (const [name, png] of Object.entries(committed)) writeFileSync(join(repo, 'verify-screenshots', name), png);
  git(repo, 'init', '-q');
  git(repo, 'add', '.');
  git(repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'screenshots');
  const runDir = join(repo, 'run');
  mkdirSync(join(runDir, 'verify-screenshots'), { recursive: true });
  for (const [name, png] of Object.entries(produced)) writeFileSync(join(runDir, 'verify-screenshots', name), png);
  return { repo, runDir };
}
function runCli({ repo, runDir }) {
  const summaryFile = join(repo, 'summary.md');
  const r = spawnSync(process.execPath, [CLI, runDir], {
    cwd: repo, encoding: 'utf8',
    env: { ...process.env, GITHUB_STEP_SUMMARY: summaryFile, GITHUB_RUN_ID: '4242', GITHUB_SERVER_URL: 'https://github.com', GITHUB_REPOSITORY: 'owner/repo' },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, summary: readFileSync(summaryFile, 'utf8') };
}
// summary 表格的資料列（去掉表頭與分隔線）
const tableRows = (summary) => summary.split('\n').filter(l => l.startsWith('| ')).slice(1);

test('CLI：相同、像素不同、尺寸不同、新增、刪除，不同的 4 張列在表裡，warning 寫 4 張', (t) => {
  const base = pattern(3, 5);
  const changed = base.slice(); changed[(1 * 3 + 2) * 3] = 84; // (2, 1) 的 R：原本是 (15 × 37 + 11) % 256 = 54，改成 84，差 30
  const png = {
    same: encodePng(3, 5, base),
    changedOld: encodePng(3, 5, base), changedNew: encodePng(3, 5, changed),
    resizedOld: encodePng(3, 5, base), resizedNew: encodePng(4, 5, pattern(4, 5)),
    added: encodePng(3, 5, base), deleted: encodePng(3, 5, base),
  };
  const dirs = fixture(
    { 'same.png': png.same, 'changed.png': png.changedOld, 'resized.png': png.resizedOld, 'deleted.png': png.deleted },
    { 'same.png': png.same, 'changed.png': png.changedNew, 'resized.png': png.resizedNew, 'added.png': png.added });
  t.after(() => rmSync(dirs.repo, { recursive: true, force: true }));

  const r = runCli(dirs);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '::warning::4 張截圖跟已提交的版本不同，見 job summary');
  assert.deepEqual(tableRows(r.summary), [
    `| added.png | — | ${md5(png.added)} | 新增 | — | — |`,
    `| changed.png | ${md5(png.changedOld)} | ${md5(png.changedNew)} | 1 | 30 | (2, 1)–(2, 1) |`,
    `| deleted.png | ${md5(png.deleted)} | — | 已提交但這次沒有產生 | — | — |`,
    `| resized.png | ${md5(png.resizedOld)} | ${md5(png.resizedNew)} | 尺寸不同：3×5 → 4×5 | — | — |`,
  ]);
});

test('CLI：全部相同時不印 warning，summary 只有一行「截圖都跟已提交的版本相同」', (t) => {
  const png = encodePng(3, 5, pattern(3, 5));
  const dirs = fixture({ 'a.png': png, 'b.png': png }, { 'a.png': png, 'b.png': png });
  t.after(() => rmSync(dirs.repo, { recursive: true, force: true }));

  const r = runCli(dirs);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.equal(r.summary, '截圖都跟已提交的版本相同\n');
});

test('CLI：非 ASCII 的檔名照樣跟已提交的版本配對（git 預設會把檔名加引號、轉成八進位）', (t) => {
  const png = encodePng(3, 5, pattern(3, 5));
  const dirs = fixture({ '案例.png': png }, { '案例.png': png });
  t.after(() => rmSync(dirs.repo, { recursive: true, force: true }));

  const r = runCli(dirs);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.equal(r.summary, '截圖都跟已提交的版本相同\n');
});

test('CLI：一張解不開的截圖寫進它那一列，其他截圖照樣比對，結束碼仍是 0', (t) => {
  const base = pattern(3, 5);
  const changed = base.slice(); changed[0] = 0; // (0, 0) 的 R：原本是 11，改成 0，差 11
  const png = { good: encodePng(3, 5, base), changed: encodePng(3, 5, changed) };
  const lfsPointer = Buffer.from('version https://git-lfs.github.com/spec/v1\noid sha256:0\nsize 1\n');
  const dirs = fixture({ 'a.png': png.good, 'b.png': png.good }, { 'a.png': lfsPointer, 'b.png': png.changed });
  t.after(() => rmSync(dirs.repo, { recursive: true, force: true }));

  const r = runCli(dirs);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '::warning::2 張截圖跟已提交的版本不同，見 job summary');
  assert.deepEqual(tableRows(r.summary), [
    `| a.png | ${md5(png.good)} | ${md5(lfsPointer)} | 無法解碼：不是 PNG 檔（開頭的簽章不符） | — | — |`,
    `| b.png | ${md5(png.good)} | ${md5(png.changed)} | 1 | 11 | (0, 0)–(0, 0) |`,
  ]);
});

test('CLI：IDAT 的資料不夠，或沒有 IHDR，都寫成「無法解碼」，不會默默解成別的像素', (t) => {
  const base = pattern(3, 5);
  const good = encodePng(3, 5, base);
  const shortData = encodePng(3, 5, base, { rows: 4 }); // IHDR 寫 5 列，IDAT 只有 4 列：(3 × 3 + 1) × 5 = 50，只有 40
  const noIhdr = Buffer.concat([good.subarray(0, 8), chunk('IEND', Buffer.alloc(0))]);
  const dirs = fixture({ 'short.png': good, 'no-ihdr.png': good }, { 'short.png': shortData, 'no-ihdr.png': noIhdr });
  t.after(() => rmSync(dirs.repo, { recursive: true, force: true }));

  const r = runCli(dirs);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '::warning::2 張截圖跟已提交的版本不同，見 job summary');
  assert.deepEqual(tableRows(r.summary), [
    `| no-ihdr.png | ${md5(good)} | ${md5(noIhdr)} | 無法解碼：PNG 沒有 IHDR | — | — |`,
    `| short.png | ${md5(good)} | ${md5(shortData)} | 無法解碼：PNG 的像素資料不足（需要 50 位元組，只有 40） | — | — |`,
  ]);
});

test('CLI：RGBA 的截圖也照樣比對，只差 alpha 的像素不算不同', (t) => {
  const base = pattern(3, 5, 4);
  const changed = base.slice();
  changed[(2 * 3 + 1) * 4 + 1] += 7; // (1, 2) 的 G：原本是 (29 × 37 + 11) % 256 = 60，改成 67，差 7
  changed[(4 * 3 + 0) * 4 + 3] = 0;  // (0, 4) 只改 alpha
  const png = { old: encodePng(3, 5, base, { channels: 4 }), now: encodePng(3, 5, changed, { channels: 4 }) };
  const dirs = fixture({ 'rgba.png': png.old }, { 'rgba.png': png.now });
  t.after(() => rmSync(dirs.repo, { recursive: true, force: true }));

  const r = runCli(dirs);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(tableRows(r.summary), [`| rgba.png | ${md5(png.old)} | ${md5(png.now)} | 1 | 7 | (1, 2)–(1, 2) |`]);
});

test('CLI：位元組不同但像素相同的截圖也列出（交叉比對要用 md5），寫「像素相同，只有編碼不同」', (t) => {
  const rgb = pattern(3, 5);
  const rgba = rgb.flatMap((v, i) => (i % 3 === 2 ? [v, 255] : [v])); // 同樣的 RGB，加上不透明的 alpha
  const png = {
    filters: encodePng(3, 5, rgb), noFilter: encodePng(3, 5, rgb, { filter: () => 0 }),
    rgb: encodePng(3, 5, rgb), rgba: encodePng(3, 5, rgba, { channels: 4 }),
  };
  const dirs = fixture({ 'filter.png': png.filters, 'alpha.png': png.rgb }, { 'filter.png': png.noFilter, 'alpha.png': png.rgba });
  t.after(() => rmSync(dirs.repo, { recursive: true, force: true }));

  const r = runCli(dirs);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '::warning::2 張截圖跟已提交的版本不同，見 job summary');
  assert.deepEqual(tableRows(r.summary), [
    `| alpha.png | ${md5(png.rgb)} | ${md5(png.rgba)} | 像素相同，只有編碼不同 | — | — |`,
    `| filter.png | ${md5(png.filters)} | ${md5(png.noFilter)} | 像素相同，只有編碼不同 | — | — |`,
  ]);
});
