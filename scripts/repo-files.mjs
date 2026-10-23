/**
 * repo-files.mjs — 讀 repo 檔案的共用工具：走訪目錄、POSIX 路徑、換行正規化成 LF
 * 建置（build-data.mjs）讀來源、技能包組裝器組建置輸入（skill-packages.mjs 的 sourceFilesFrom）都用這一份，走訪時略過哪些目錄與檔案的規則只有一份。
 * 這些工具讓建置在 Windows 與 Linux 上產生位元組相同的結果（可重現建置）。純 Node 內建模組，無第三方相依。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIRS = new Set(['__pycache__', 'node_modules', '.git', 'dist', 'output']);
const SKIP_FILES = /\.(pyc|pyo|DS_Store)$|^\.DS_Store$/;

// root：repo 根目錄的絕對路徑；回傳的路徑都是絕對路徑，relPosix 轉成相對於 root 的 POSIX 路徑
export function repoFiles(root) {
  // relPosix：路徑一律用 /，避免 Windows 的 \ 漏進 data/*.js 與 ZIP 檔名
  const relPosix = (f) => relative(root, f).split('\\').join('/');
  // readText：換行一律正規化為 LF，避免 CRLF 簽出時內容與 ZIP 位元組改變
  const readText = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  // cmpPosix：以正規化後的路徑排序，讓兩個平臺的檔案順序一致
  const cmpPosix = (a, b) => { const x = relPosix(a), y = relPosix(b); return x < y ? -1 : x > y ? 1 : 0; };
  function walk(dir) {
    const res = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) res.push(...walk(p)); }
      else if (!SKIP_FILES.test(name)) res.push(p);
    }
    return res.sort(cmpPosix);
  }
  return { relPosix, readText, walk };
}
