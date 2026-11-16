// pr-cleanup.test.mjs — PR 合併後的收尾（scripts/pr-cleanup.mjs）的單元測試
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanupPlan } from './pr-cleanup.mjs';

const ctx = (over = {}) => ({ state: 'MERGED', dirty: false, branch: '312-playwright-upgrade', current: '312-playwright-upgrade', remoteExists: true, localExists: true, ...over });

test('cleanupPlan：PR 不是 MERGED 時拒絕，一步都不做（還開著的 PR 刪掉 head 分支會自動關閉，修改不會進 main）', () => {
  assert.deepEqual(cleanupPlan(ctx({ state: 'OPEN' })), { refuse: 'PR 的 state 是 OPEN，不是 MERGED：合併之後再收尾', steps: [] });
  assert.deepEqual(cleanupPlan(ctx({ state: 'CLOSED' })), { refuse: 'PR 的 state 是 CLOSED，不是 MERGED：合併之後再收尾', steps: [] });
});

test('cleanupPlan：工作樹不乾淨時拒絕（切換分支會帶著或擋下未提交的修改）', () => {
  assert.deepEqual(cleanupPlan(ctx({ dirty: true })), { refuse: '工作樹有未提交的修改（git status --porcelain 有輸出）：先提交或收起來', steps: [] });
});

test('cleanupPlan：MERGED 而且工作樹乾淨時，依序刪遠端分支、切回 main、pull --ff-only、git branch -d（不用 -D）', () => {
  assert.deepEqual(cleanupPlan(ctx()), { refuse: null, steps: [
    { args: ['git', 'push', 'origin', '--delete', '312-playwright-upgrade'], skip: null },
    { args: ['git', 'checkout', 'main'], skip: null },
    { args: ['git', 'pull', '--ff-only'], skip: null },
    { args: ['git', 'branch', '-d', '312-playwright-upgrade'], skip: null },
  ] });
});

test('cleanupPlan：已經是目標狀態的步驟標成略過，其他照做（遠端與本機分支都已刪掉、已經在 main 上時，只剩 pull）', () => {
  assert.deepEqual(cleanupPlan(ctx({ remoteExists: false, localExists: false, current: 'main' })), { refuse: null, steps: [
    { args: ['git', 'push', 'origin', '--delete', '312-playwright-upgrade'], skip: '遠端已經沒有這個分支' },
    { args: ['git', 'checkout', 'main'], skip: '已經在 main 上' },
    { args: ['git', 'pull', '--ff-only'], skip: null },
    { args: ['git', 'branch', '-d', '312-playwright-upgrade'], skip: '本機已經沒有這個分支' },
  ] });
});

// 參數有誤時以 2 結束，不呼叫 gh 或 git（PATH 清空：真的去呼叫就會以 1 結束，跟 2 分得開）
const CLI = fileURLToPath(new URL('./pr-cleanup.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { PATH: '' } });
test('pr-cleanup CLI：缺 --pr、--pr 不是正整數、不認得的參數時以 2 結束並印出用法；--help 以 0 結束', () => {
  for (const args of [[], ['--pr'], ['--pr', '0'], ['--pr', 'abc'], ['--pr', '314', '--bogus'], ['--dry-run']]) {
    const r = cli(...args);
    assert.equal(r.status, 2, `${JSON.stringify(args)}：${r.stderr}`);
    assert.match(r.stderr, /用法：node scripts\/pr-cleanup\.mjs --pr <n>/);
  }
  const help = cli('--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /用法：node scripts\/pr-cleanup\.mjs --pr <n>/);
});
