// verify.mjs 的報告檔：verify:static（本機與 CI 的靜態驗證）只印結果、不改寫已提交的 verify-report.md；
// 只有完整模式（含瀏覽器檢查，CI 的 browser job 會上傳）才寫入。這樣跑完靜態驗證不必再手動還原檔案，
// CI 的生成檔檢查也才能用 git status 檢查整份工作樹。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPORT = fileURLToPath(new URL('../verify-report.md', import.meta.url));
const VERIFY = fileURLToPath(new URL('./verify.mjs', import.meta.url));

test('verify --static 印出檢查結果，但不改寫 verify-report.md', () => {
  const before = { content: readFileSync(REPORT, 'utf8'), mtime: statSync(REPORT).mtimeMs };
  const run = spawnSync(process.execPath, [VERIFY, '--static'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /\d+\/\d+ 通過/);
  assert.equal(readFileSync(REPORT, 'utf8'), before.content);
  assert.equal(statSync(REPORT).mtimeMs, before.mtime);
});
