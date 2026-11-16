// issue-start.test.mjs — 開工的檢查與開分支（scripts/issue-start.mjs）的單元測試
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startPlan, issueCommits } from './issue-start.mjs';

// 各項查詢結果的手寫輸入：議題 327、slug issue-start，預設全部通過
const ctx = (over = {}) => ({ issue: 327, slug: 'issue-start', dirty: false, state: 'OPEN', linkedPrs: [], mainCommits: [],
  branchExists: { local: false, remote: false }, ...over });

test('startPlan：每一項都通過時，從 origin/main 用 --no-track 開 <n>-<slug>，並給出第一次 push 的指令', () => {
  assert.deepEqual(startPlan(ctx()), {
    problems: [],
    notes: [],
    command: ['git', 'switch', '-c', '327-issue-start', '--no-track', 'origin/main'],
    push: 'git push -u origin 327-issue-start',
  });
});

test('startPlan：議題不是 OPEN 時不開分支，寫出狀態（已關閉的議題常保留 ready-for-agent，看狀態不看標籤）', () => {
  assert.deepEqual(startPlan(ctx({ state: 'CLOSED' })), {
    problems: ['議題 #327 的 state 是 CLOSED，不是 OPEN'], notes: [], command: null, push: null });
});

test('startPlan：連到的 PR 有 OPEN 或 MERGED 的，不開分支，各自列出；只有 CLOSED（沒合併）的 PR 照樣通過，列在 notes', () => {
  assert.deepEqual(startPlan(ctx({ linkedPrs: [{ number: 400, state: 'OPEN' }, { number: 191, state: 'MERGED' }, { number: 305, state: 'CLOSED' }] })), {
    problems: ['已經有 PR 連到議題 #327：#400（OPEN）、#191（MERGED）'],
    notes: ['連到議題 #327、已關閉沒合併的 PR：#305（CLOSED）'],
    command: null, push: null });
  const closedOnly = startPlan(ctx({ linkedPrs: [{ number: 305, state: 'CLOSED' }] }));
  assert.deepEqual(closedOnly.problems, []);
  assert.deepEqual(closedOnly.notes, ['連到議題 #327、已關閉沒合併的 PR：#305（CLOSED）']);
  assert.deepEqual(closedOnly.command, ['git', 'switch', '-c', '327-issue-start', '--no-track', 'origin/main']);
});

// git log 的手寫片段：{ sha, message }，message 是完整的 commit 訊息（--grep 搜的是整段，含內文的 Closes #<n>）
const commit = (sha, message) => ({ sha, message });
test('issueCommits：錨定比對 #<n>，#32 不命中 #321、#320，但命中標題的（#32）、內文的 Closes #32 與行尾的 #32；回傳短 SHA 與標題', () => {
  const log = [
    commit('3807a66', 'Merge pull request #321: noise.json（#318）\n\nnoise.json（#318）'),
    commit('047c907', 'Merge pull request #320: PR 收尾工具（#317）'),
    commit('d5deefa', 'Merge pull request #32: 四支 api-workflow.py 的 scope 守門對齊'),
    commit('a1b2c3d', '某個修正\n\n- 說明\n\nCloses #32'),
    commit('e4f5a6b', '修正（#32）'),
    commit('0123456', '#32a：後面接的不是數字，照樣命中'),
  ];
  assert.deepEqual(issueCommits(32, log), [
    { sha: 'd5deefa', subject: 'Merge pull request #32: 四支 api-workflow.py 的 scope 守門對齊' },
    { sha: 'a1b2c3d', subject: '某個修正' },
    { sha: 'e4f5a6b', subject: '修正（#32）' },
    { sha: '0123456', subject: '#32a：後面接的不是數字，照樣命中' },
  ]);
  assert.deepEqual(issueCommits(318, log), [{ sha: '3807a66', subject: 'Merge pull request #321: noise.json（#318）' }]);
  assert.deepEqual(issueCommits(3, log), []);
});

test('startPlan：main 上已經有提到這個議題的 commit（issueCommits 的結果）時不開分支，列出短 SHA 與標題，交給人決定（例如分好幾次做的 #8）', () => {
  const mainCommits = [{ sha: '102cda9', subject: '連結檢查更新為 2026-10-01 的 CI 結果（#8）' }, { sha: '38c7b00', subject: '季度查證 2026 Q4（#289）' }];
  assert.deepEqual(startPlan(ctx({ issue: 8, slug: 'x', mainCommits })), {
    problems: ['origin/main 上已經有提到 #8 的 commit：102cda9 連結檢查更新為 2026-10-01 的 CI 結果（#8）；38c7b00 季度查證 2026 Q4（#289）'],
    notes: [], command: null, push: null });
});

test('startPlan：工作樹不乾淨時不開分支（git switch -c 會把未提交的修改帶到新分支）', () => {
  assert.deepEqual(startPlan(ctx({ dirty: true })), {
    problems: ['工作樹有未提交的修改（git status --porcelain 有輸出）：先提交或還原'], notes: [], command: null, push: null });
});

test('startPlan：<n>-<slug> 已經在本機或遠端存在時不開分支，寫出在哪一邊', () => {
  assert.deepEqual(startPlan(ctx({ branchExists: { local: true, remote: false } })).problems, ['分支 327-issue-start 已經存在：本機']);
  assert.deepEqual(startPlan(ctx({ branchExists: { local: false, remote: true } })).problems, ['分支 327-issue-start 已經存在：origin']);
  assert.deepEqual(startPlan(ctx({ branchExists: { local: true, remote: true } })).problems, ['分支 327-issue-start 已經存在：本機、origin']);
});

test('startPlan：多項不通過時全部列出，順序跟檢查的順序相同（工作樹、議題、PR、main 上的 commit、分支）', () => {
  assert.deepEqual(startPlan(ctx({ dirty: true, state: 'CLOSED', linkedPrs: [{ number: 191, state: 'MERGED' }],
    mainCommits: [{ sha: '9e96106', subject: '送往模型前的資料篩選補齊' }], branchExists: { local: true, remote: false } })).problems, [
    '工作樹有未提交的修改（git status --porcelain 有輸出）：先提交或還原',
    '議題 #327 的 state 是 CLOSED，不是 OPEN',
    '已經有 PR 連到議題 #327：#191（MERGED）',
    'origin/main 上已經有提到 #327 的 commit：9e96106 送往模型前的資料篩選補齊',
    '分支 327-issue-start 已經存在：本機',
  ]);
});

// 參數有誤時以 2 結束，不呼叫 gh 或 git（PATH 清空：真的去呼叫就會以 1 結束，跟 2 分得開）
const CLI = fileURLToPath(new URL('./issue-start.mjs', import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { PATH: '' } });
test('issue-start CLI：缺 --issue 或 --slug、--issue 不是正整數、--slug 不是小寫英數字與 -、不認得的參數時以 2 結束並印出用法；--help 以 0 結束', () => {
  for (const args of [[], ['--issue'], ['--issue', '0', '--slug', 'x'], ['--issue', 'abc', '--slug', 'x'], ['--issue', '327'],
    ['--issue', '327', '--slug', 'Issue-Start'], ['--issue', '327', '--slug', '-x'], ['--issue', '327', '--slug', 'x-'],
    ['--issue', '327', '--slug', 'a_b'], ['--issue', '327', '--slug', ''], ['--issue', '327', '--slug', 'x', '--bogus']]) {
    const r = cli(...args);
    assert.equal(r.status, 2, `${JSON.stringify(args)}：${r.stderr}`);
    assert.match(r.stderr, /用法：node scripts\/issue-start\.mjs --issue <n> --slug <slug>/);
  }
  const help = cli('--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /用法：node scripts\/issue-start\.mjs --issue <n> --slug <slug>/);
});

test('issue-start CLI：參數正確時才去呼叫 git（PATH 裡沒有 git，所以以 1 結束）', () => {
  const r = cli('--issue', '327', '--slug', 'issue-start', '--dry-run');
  assert.equal(r.status, 1, r.stderr);
});
