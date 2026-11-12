// gh-read.test.mjs — 手寫的檔案不用 gh issue/pr view 的留言選項讀議題或 PR，議題追蹤文件的「讀取 issue」用 --json 讀
// 輸出不是 TTY 時，留言選項只印留言，沒有留言就什麼都不印，結束碼照樣是 0，代理分不出有沒有讀到（#298）。
// 掃描範圍比照詞彙表測試：git ls-files 列出的檔案，略過 .ignore 排除的建置產物（ignoreMatcher 在 scripts/glossary.mjs）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ignoreMatcher } from './glossary.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(root + path, 'utf8');
const TEXT_FILE = /\.(md|mjs|js|py|yml|json|html)$/;

// 測試名稱與訊息刻意不寫出完整的指令：這支檔案自己也在掃描範圍內
test('手寫的檔案不用留言選項讀議題或 PR：同一行有 gh 的 issue／pr view 又有 --comments 就列出檔名與行號（#298）', () => {
  const ignored = ignoreMatcher(read('.ignore'));
  const ls = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  assert.equal(ls.status, 0, `git ls-files 失敗，掃不到檔案：${ls.stderr}`);
  const tracked = ls.stdout.split('\n');
  const hits = [];
  for (const path of tracked.filter(p => TEXT_FILE.test(p) && !ignored(p))) {
    read(path).split('\n').forEach((line, i) => {
      if (/\bgh\s+(issue|pr)\s+view\b/.test(line) && /--comments\b/.test(line)) hits.push(`${path}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, [], '改用 docs/agents/issue-tracker.md「讀取 issue」的 --json 寫法');
});

test('議題追蹤文件的「讀取 issue」用 --json 讀，欄位包含 body、labels、comments（#298）', () => {
  const line = read('docs/agents/issue-tracker.md').split('\n').find(l => l.startsWith('- **讀取 issue**：'));
  assert.ok(line, 'docs/agents/issue-tracker.md 找不到「- **讀取 issue**：」那一條');
  const fields = line.match(/--json ([a-z,]+)/)?.[1].split(',') || [];
  for (const field of ['body', 'labels', 'comments']) assert.ok(fields.includes(field), `「讀取 issue」的 --json 欄位沒有 ${field}：${fields.join(',') || '（沒有 --json）'}`);
});
