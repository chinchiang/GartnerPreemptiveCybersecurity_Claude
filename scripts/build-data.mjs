#!/usr/bin/env node
/**
 * build-data.mjs — 建置：把 docs/、skills/、examples/ 轉成網站載入的 data/*.js，並產生下載用的 ZIP
 * 這支只是 CLI：讀進來源（scripts/build-outputs.mjs 的 inputFilesFrom）、產生全部建置產物（buildOutputs），
 * 再逐一寫回 repo。哪個來源進哪個產物、原地改寫的順序，都在 build-outputs.mjs。純 Node 內建模組，無第三方相依。
 *
 * 用法：node scripts/build-data.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOutputs, inputFilesFrom } from './build-outputs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = inputFilesFrom(ROOT);
const outputs = buildOutputs(files);
// 新平臺第一次建置時 references/、scripts/ 還不存在，先建目錄再寫
for (const o of outputs) {
  mkdirSync(dirname(join(ROOT, o.path)), { recursive: true });
  writeFileSync(join(ROOT, o.path), o.content);
}

const count = (dir) => outputs.filter(o => o.path.startsWith(dir)).length;
const platforms = [...new Set(files.filter(f => f.path.startsWith('skills/')).map(f => f.path.split('/')[1]))].sort();
console.log(`wrote ${outputs.length} files (data: ${count('data/')}, downloads: ${count('downloads/')}, ` +
  `rewritten in place: ${outputs.length - count('data/') - count('downloads/')}), platforms: ${platforms.join(', ')}`);
