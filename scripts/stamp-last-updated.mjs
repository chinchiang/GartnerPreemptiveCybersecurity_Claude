#!/usr/bin/env node
/**
 * stamp-last-updated.mjs — 部署時把最後更新時間寫進 _site/index.html
 * 部署時把最後更新時間寫進網站：填上 index.html 預留的 <meta name="last-updated" content="">。
 *
 *   node scripts/stamp-last-updated.mjs <index.html> "$(git log -1 --format=%cI)"
 *
 * 只給 pages.yml 對 _site/ 的複製品用；repo 裡提交的 index.html 永遠是空的，建置產物才不會帶時間（見部署指南第 5 節 contentHash 那一段）。
 * 找不到或不只一個 <meta>、時間不是 %cI 的格式時以結束碼 1 結束、檔案不動，讓部署失敗，而不是上線一個沒有時間的網站。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// 合法時間的判定與網站顯示共用一份（assets/last-updated.js）
const { isCommitTime } = createRequire(import.meta.url)('../assets/last-updated.js');
const META = '<meta name="last-updated" content="">';

export function stampLastUpdated(html, iso) {
  if (!isCommitTime(iso)) throw new Error(`時間不是 git log --format=%cI 的格式：${JSON.stringify(iso)}`);
  const count = html.split(META).length - 1;
  if (count === 0) throw new Error(`找不到 ${META}`);
  if (count > 1) throw new Error(`${META} 不只一個（${count} 個）`);
  return html.replace(META, () => `<meta name="last-updated" content="${iso}">`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, iso] = process.argv.slice(2);
  try {
    if (!file || iso === undefined) throw new Error('用法：node scripts/stamp-last-updated.mjs <index.html> "<git log -1 --format=%cI>"');
    writeFileSync(file, stampLastUpdated(readFileSync(file, 'utf8'), iso));
  } catch (e) { console.error(e.message); process.exit(1); }
}
