// pr-status.test.mjs — PR 收尾的狀態工具（scripts/pr-status.mjs）的單元測試
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mergeReadiness, keepWaiting } from './pr-status.mjs';

// gh pr view --json number,title,state,mergeStateStatus,headRefOid 與 gh pr checks --json name,bucket 的手寫輸入
const SHA = '52205a52ca7e83e20b70f5049443854f1cf2e02a';
const view = (over = {}) => ({ number: 314, title: 'Playwright 升級到 1.65.0（#312）', state: 'OPEN', mergeStateStatus: 'CLEAN', headRefOid: SHA, ...over });
const check = (name, bucket = 'pass') => ({ name, bucket });
const allPass = () => [check('unit (ubuntu-latest, 22)'), check('verify'), check('browser'), check('unit (ubuntu-latest, 22)'), check('verify'), check('browser')];

test('mergeReadiness：OPEN、檢查全過、browser 兩次都過、CLEAN 時，印出 workflow.md 格式的合併指令（完整 SHA）', () => {
  assert.deepEqual(mergeReadiness({ view: view(), checks: allPass() }), {
    reasons: [],
    command: 'gh pr merge 314 --merge --subject "Merge pull request #314: Playwright 升級到 1.65.0（#312）" --body "Playwright 升級到 1.65.0（#312）" --match-head-commit 52205a52ca7e83e20b70f5049443854f1cf2e02a'
  });
});

test('mergeReadiness：browser 只出現 1 次（pull_request 那次還沒排進來）時不印合併指令', () => {
  const checks = [check('unit (ubuntu-latest, 22)'), check('verify'), check('browser')];
  assert.deepEqual(mergeReadiness({ view: view(), checks }), { reasons: ['browser 只出現 1 次，要 2 次（push 與 pull_request）'], command: null });
});

test('mergeReadiness：browser 還沒出現時不印合併指令', () => {
  assert.deepEqual(mergeReadiness({ view: view(), checks: [check('unit (ubuntu-latest, 22)'), check('verify')] }),
    { reasons: ['browser 還沒出現'], command: null });
});

test('mergeReadiness：有檢查還在跑、有檢查失敗時，各自列出檢查名稱', () => {
  const checks = [check('unit (ubuntu-latest, 22)', 'fail'), check('verify', 'pending'), check('browser'), check('browser', 'cancel')];
  assert.deepEqual(mergeReadiness({ view: view(), checks }), {
    reasons: ['還有檢查在跑：verify', '有檢查沒通過：unit (ubuntu-latest, 22)（fail）、browser（cancel）'], command: null });
});

test('mergeReadiness：browser 出現 2 次但有 skipping 時不印合併指令（每次都要 pass）；其他檢查 skipping 不擋', () => {
  const checks = [check('unit (ubuntu-latest, 22)', 'skipping'), check('verify'), check('browser', 'skipping'), check('browser')];
  assert.deepEqual(mergeReadiness({ view: view(), checks }), { reasons: ['browser 有 1 次是 skipping，每次都要 pass'], command: null });
  const both = [check('verify'), check('browser', 'skipping'), check('browser', 'skipping')];
  assert.deepEqual(mergeReadiness({ view: view(), checks: both }), { reasons: ['browser 有 2 次是 skipping，每次都要 pass'], command: null });
  const otherSkipped = [check('unit (ubuntu-latest, 22)', 'skipping'), check('verify'), check('browser'), check('browser')];
  assert.equal(mergeReadiness({ view: view(), checks: otherSkipped }).reasons.length, 0);
});

test('mergeReadiness：mergeStateStatus 是 BEHIND 時，寫出要先跟上 main', () => {
  assert.deepEqual(mergeReadiness({ view: view({ mergeStateStatus: 'BEHIND' }), checks: allPass() }),
    { reasons: ['mergeStateStatus 是 BEHIND：先 git merge main 再 push，等 CI 重跑'], command: null });
});

test('mergeReadiness：mergeStateStatus 是其他不是 CLEAN 的值時，寫出那個值', () => {
  assert.deepEqual(mergeReadiness({ view: view({ mergeStateStatus: 'BLOCKED' }), checks: allPass() }),
    { reasons: ['mergeStateStatus 是 BLOCKED，要是 CLEAN'], command: null });
});

test('mergeReadiness：已經合併或已經關閉的 PR 不印合併指令，也不再檢查 mergeStateStatus（合併後是 UNKNOWN）', () => {
  assert.deepEqual(mergeReadiness({ view: view({ state: 'MERGED', mergeStateStatus: 'UNKNOWN' }), checks: allPass() }),
    { reasons: ['已經合併'], command: null });
  assert.deepEqual(mergeReadiness({ view: view({ state: 'CLOSED', mergeStateStatus: 'UNKNOWN' }), checks: allPass() }),
    { reasons: ['已經關閉，沒有合併'], command: null });
});

test('keepWaiting：還有檢查在跑，或 browser 不到 2 次時要再等；都跑完而且 browser 2 次時不等（不論通過與否）', () => {
  assert.equal(keepWaiting(allPass()), false);
  assert.equal(keepWaiting([check('unit (ubuntu-latest, 22)'), check('verify'), check('browser', 'pending'), check('browser')]), true);
  // unit 與 verify 都跑完了，browser 還沒排進來：gh pr checks 這時沒有 pending，--watch 會提早結束（workflow.md）
  assert.equal(keepWaiting([check('unit (ubuntu-latest, 22)'), check('verify'), check('browser')]), true);
  assert.equal(keepWaiting([check('unit (ubuntu-latest, 22)', 'fail'), check('verify'), check('browser', 'fail'), check('browser')]), false);
});

// 參數有誤時以 2 結束，不呼叫 gh 或 git（PATH 清空：真的去呼叫就會以 1 結束，跟 2 分得開）
const CLI = fileURLToPath(new URL('./pr-status.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { PATH: '' } });
test('pr-status CLI：缺 --pr、--pr 不是正整數、不認得的參數時以 2 結束並印出用法；--help 以 0 結束', () => {
  for (const args of [[], ['--pr'], ['--pr', '0'], ['--pr', 'abc'], ['--pr', '314', '--bogus'], ['--wait']]) {
    const r = cli(...args);
    assert.equal(r.status, 2, `${JSON.stringify(args)}：${r.stderr}`);
    assert.match(r.stderr, /用法：node scripts\/pr-status\.mjs --pr <n>/);
  }
  const help = cli('--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /用法：node scripts\/pr-status\.mjs --pr <n>/);
});

test('mergeReadiness：標題有反引號、雙引號、$ 或單引號時，合併指令用單引號包住，貼進 shell 不會被展開或斷掉', () => {
  const { command } = mergeReadiness({ view: view({ title: '`gh` 的 "--json" 與 $HOME、it\'s（#1）' }), checks: allPass() });
  assert.equal(command, `gh pr merge 314 --merge --subject 'Merge pull request #314: \`gh\` 的 "--json" 與 $HOME、it'\\''s（#1）' --body '\`gh\` 的 "--json" 與 $HOME、it'\\''s（#1）' --match-head-commit 52205a52ca7e83e20b70f5049443854f1cf2e02a`);
});
