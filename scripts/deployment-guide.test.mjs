// deployment-guide.test.mjs — 部署指南第 1 節的 scripts/ 清單列出每支 .mjs
// 部署指南（docs/guides/deployment.md）第 1 節的檔案結構清單：scripts/ 底下每支 .mjs（含測試檔）都要列在 scripts/ 那一行
// （CODING_STANDARDS.md §1）。用 readdir 而不是 git ls-files，新檔案還沒提交時就檢查得到。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// 第 1 節（到第 2 節的標題為止）裡以 scripts/ 開頭的那一行；沒有就回空字串
function scriptsLine(md) {
  const section = md.replace(/\r\n/g, '\n').split(/^## 2\. /m)[0];
  return section.split('\n').find(l => l.startsWith('scripts/')) || '';
}

test('只認第 1 節的 scripts/ 那一行：只在第 4 節或第 1 節其他行出現的檔名不算列了', () => {
  const md = '## 1. 網站架構\n\n```\nassets/   a.js（測試在 b.test.mjs）\nscripts/  build.mjs、c.test.mjs\n```\n\n## 2. 本機預覽\n\n## 4. 驗證\n\nnpm test  # d.test.mjs\nscripts/  e.mjs\n';
  const line = scriptsLine(md);
  assert.equal(line, 'scripts/  build.mjs、c.test.mjs');
  assert.deepEqual(['build.mjs', 'b.test.mjs', 'c.test.mjs', 'd.test.mjs', 'e.mjs'].filter(f => !line.includes(f)), ['b.test.mjs', 'd.test.mjs', 'e.mjs']);
});

test('scripts/ 底下每支 .mjs 都列在部署指南第 1 節的 scripts/ 那一行', () => {
  const line = scriptsLine(readFileSync(ROOT + 'docs/guides/deployment.md', 'utf8'));
  const unlisted = readdirSync(ROOT + 'scripts').filter(f => f.endsWith('.mjs') && !line.includes(f)).sort();
  assert.deepEqual(unlisted, []);
});
