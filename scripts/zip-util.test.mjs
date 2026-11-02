// zip-util.test.mjs — buildZip 的單元測試：store 模式的位元組格式、CRC-32、固定時間戳
// 預期值來自 ZIP 格式規格（PKWARE APPNOTE 4.3.7 本機檔頭、4.3.12 中央目錄、4.3.16 結尾記錄）與 CRC-32 的標準檢查值，都是手寫的字面值。
// 執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildZip } from './zip-util.mjs';

// 單一項目：檔名 a.txt（5 位元組）、內容 123456789（9 位元組）。
// 版面：本機檔頭 30＋檔名 5＋內容 9＝44；中央目錄從第 44 個位元組開始，46＋檔名 5＝51；結尾記錄從第 95 個開始，22 個位元組，共 117
const zip = buildZip([{ name: 'a.txt', data: Buffer.from('123456789') }]);
const DOS_DATE_2026_01_01 = 0x5c21; // ((2026 − 1980) << 9) | (1 月 << 5) | 1 日
const CRC_123456789 = 0xcbf43926;   // CRC-32 的標準檢查值

test('單一項目的 ZIP 共 117 個位元組：本機檔頭＋檔名＋內容、中央目錄、結尾記錄依序排列', () => {
  assert.equal(zip.length, 117);
});

test('本機檔頭：store 模式（不壓縮）、檔名以 UTF-8 記錄、時間戳固定在 2026-01-01 00:00:00、CRC 與大小，後面接檔名與原樣的內容', () => {
  assert.equal(zip.readUInt32LE(0), 0x04034b50, '本機檔頭的簽章');
  assert.equal(zip.readUInt16LE(6), 0x0800, '旗標：bit 11（檔名是 UTF-8）');
  assert.equal(zip.readUInt16LE(8), 0, '壓縮方式 0＝store');
  assert.equal(zip.readUInt16LE(10), 0, '時間 00:00:00');
  assert.equal(zip.readUInt16LE(12), DOS_DATE_2026_01_01, '日期 2026-01-01');
  assert.equal(zip.readUInt32LE(14), CRC_123456789, 'CRC-32');
  assert.equal(zip.readUInt32LE(18), 9, '壓縮後大小');
  assert.equal(zip.readUInt32LE(22), 9, '原始大小');
  assert.equal(zip.readUInt16LE(26), 5, '檔名長度');
  assert.equal(zip.toString('utf8', 30, 35), 'a.txt');
  assert.equal(zip.toString('utf8', 35, 44), '123456789');
});

test('中央目錄：同樣的旗標、時間戳、CRC 與大小，並指回第 0 個位元組的本機檔頭', () => {
  assert.equal(zip.readUInt32LE(44), 0x02014b50, '中央目錄的簽章');
  assert.equal(zip.readUInt16LE(44 + 8), 0x0800, '旗標');
  assert.equal(zip.readUInt16LE(44 + 10), 0, '壓縮方式');
  assert.equal(zip.readUInt16LE(44 + 12), 0, '時間');
  assert.equal(zip.readUInt16LE(44 + 14), DOS_DATE_2026_01_01, '日期');
  assert.equal(zip.readUInt32LE(44 + 16), CRC_123456789, 'CRC-32');
  assert.equal(zip.readUInt32LE(44 + 20), 9, '壓縮後大小');
  assert.equal(zip.readUInt32LE(44 + 24), 9, '原始大小');
  assert.equal(zip.readUInt16LE(44 + 28), 5, '檔名長度');
  assert.equal(zip.readUInt32LE(44 + 42), 0, '本機檔頭的位置');
  assert.equal(zip.toString('utf8', 44 + 46, 44 + 51), 'a.txt');
});

test('結尾記錄：1 個項目，中央目錄 51 個位元組、從第 44 個位元組開始', () => {
  assert.equal(zip.readUInt32LE(95), 0x06054b50, '結尾記錄的簽章');
  assert.equal(zip.readUInt16LE(95 + 8), 1, '這個磁碟上的項目數');
  assert.equal(zip.readUInt16LE(95 + 10), 1, '項目總數');
  assert.equal(zip.readUInt32LE(95 + 12), 51, '中央目錄的大小');
  assert.equal(zip.readUInt32LE(95 + 16), 44, '中央目錄的位置');
});

test('同樣的內容每次都產生位元組相同的 ZIP（可重現建置）', () => {
  assert.ok(buildZip([{ name: 'a.txt', data: Buffer.from('123456789') }]).equals(zip));
});
