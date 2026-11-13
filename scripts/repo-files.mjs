/**
 * repo-files.mjs — 讀 repo 檔案的共用工具：走訪目錄、POSIX 路徑、換行正規化成 LF，以及列出手寫的文字檔
 * 建置讀來源（build-outputs.mjs 的 inputFilesFrom）、技能包組裝器組建置輸入（skill-packages.mjs 的 sourceFilesFrom）、讀 scripts/ 的 .mjs
 * （deployment-guide.mjs 的 scriptFilesFrom，只用 readText）都用這一份，走訪時略過哪些目錄與檔案的規則（SKIP_DIRS、SKIP_FILES，不含 .ignore）只有一份。
 * 這些工具讓建置在 Windows 與 Linux 上產生位元組相同的結果（可重現建置）。
 * 對整個 repo 的檢查（詞彙表測試 glossary.test.mjs、gh-read.test.mjs）用 handwrittenTextFiles 決定掃描範圍：git ls-files 列出的文字檔，
 * 略過 .ignore 排除的建置產物（.ignore 的解析是 ignoreMatcher），掃描範圍只有一份。純 Node 內建模組，無第三方相依。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const SKIP_DIRS = new Set(['__pycache__', 'node_modules', '.git', 'dist', 'output']);
const SKIP_FILES = /\.(pyc|pyo|DS_Store)$|^\.DS_Store$/;

// root：repo 根目錄的絕對路徑；回傳的路徑都是絕對路徑，relPosix 轉成相對於 root 的 POSIX 路徑
export function repoReader(root) {
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

// .ignore 的小子集（本 repo 用到的寫法）：結尾斜線＝目錄底下全部；* 對應一段路徑裡的任意字元（不跨 /）；其餘是完整路徑。
// 回傳 (path) => 是否略過；path 是相對於 repo 根目錄、以 / 分隔的路徑
export function ignoreMatcher(ignoreText) {
  const escape = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const patterns = ignoreText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(p => new RegExp('^' + escape(p).replace(/\*/g, '[^/]*') + (p.endsWith('/') ? '' : '$')));
  return (path) => patterns.some(re => re.test(path));
}

const TEXT_FILE = /\.(md|mjs|js|py|yml|json|html)$/;

// 手寫的文字檔：git ls-files 列出、副檔名是文字檔、沒被 root 的 .ignore 排除的檔案；路徑相對於 root、用 /
export function handwrittenTextFiles(root) {
  const ls = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  // 不在 git repo 裡時 stdout 是空的；若不檢查結束碼，呼叫端會拿到空清單、檢查空洞通過（#307）。先於讀 .ignore 檢查，錯誤才指出真正的原因。
  // .ignore 讀不到就丟錯，不當成沒有排除：否則建置產物會被默默掃進來
  if (ls.status !== 0) throw new Error(`git ls-files 失敗，掃不到檔案：${ls.stderr}`);
  const ignored = ignoreMatcher(readFileSync(join(root, '.ignore'), 'utf8'));
  return ls.stdout.split('\n').filter(p => TEXT_FILE.test(p) && !ignored(p));
}
