// pr-cleanup.mjs — PR 合併後的收尾：確認 PR 已經合併，再刪遠端與本機的 head 分支、切回 main 並 pull
// 用法：node scripts/pr-cleanup.mjs --pr <n> [--dry-run]
//
// 照 docs/agents/workflow.md 的「Commit 與 PR」：PR 的 state 要是 MERGED、工作樹要乾淨，否則一步都不做。依序刪遠端的 head 分支、
// git checkout main、git pull --ff-only、git branch -d（不用 -D：沒合併進 main 的分支 git 會拒絕刪除）；已經是目標狀態的步驟印「略過」。
// --dry-run 只檢查先決條件、印出會做的每一步。這支程式不合併；刪遠端分支是對外動作，使用者明說之後才執行。
// 結束碼：0 完成（或 --dry-run 印完）；3 先決條件不成立；1 gh 或 git 失敗、找不到 PR；2 參數有誤。
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ---------- 判斷：不碰 gh、git 與網路 ----------

// ctx：{ state, dirty, branch, current, remoteExists, localExists }。回傳 { refuse, steps }：refuse 是拒絕的原因（steps 是空的）
export function cleanupPlan({ state, dirty, branch, current, remoteExists, localExists }) {
  if (state !== 'MERGED') return { refuse: `PR 的 state 是 ${state}，不是 MERGED：合併之後再收尾`, steps: [] };
  if (dirty) return { refuse: '工作樹有未提交的修改（git status --porcelain 有輸出）：先提交或收起來', steps: [] };
  return { refuse: null, steps: [
    { args: ['git', 'push', 'origin', '--delete', branch], skip: remoteExists ? null : '遠端已經沒有這個分支' },
    { args: ['git', 'checkout', 'main'], skip: current === 'main' ? '已經在 main 上' : null },
    { args: ['git', 'pull', '--ff-only'], skip: null },
    // -d：沒合併進 main 的分支，git 會拒絕刪除；-D 會強制刪掉
    { args: ['git', 'branch', '-d', branch], skip: localExists ? null : '本機已經沒有這個分支' },
  ] };
}

// ---------- CLI：gh 與 git 的呼叫都在這裡 ----------
const USAGE = `用法：node scripts/pr-cleanup.mjs --pr <n> [--dry-run]
  --pr <n>     PR 編號（正整數）；state 要是 MERGED
  --dry-run    只檢查先決條件、印出會做的每一步，不執行
步驟：刪遠端的 head 分支 → git checkout main → git pull --ff-only → git branch -d <head 分支>`;

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const opts = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--dry-run') opts.dryRun = true;
    else if (flag === '--pr' && value !== undefined && !value.startsWith('--')) { opts.pr = value; i++; }
    else return { error: `不認得的參數或缺少值：${flag}` };
  }
  if (!opts.pr) return { error: '缺少 --pr' };
  if (!/^[1-9]\d*$/.test(opts.pr)) return { error: `--pr 要是正整數：${opts.pr}` };
  return { pr: Number(opts.pr), dryRun: opts.dryRun };
}

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function cli(argv) {
  const args = parseArgs(argv);
  if (args.help) { console.log(USAGE); return 0; }
  if (args.error) { console.error(`${args.error}\n${USAGE}`); return 2; }
  const view = JSON.parse(run('gh', ['pr', 'view', String(args.pr), '--json', 'state,headRefName']));
  const branch = view.headRefName;
  const plan = cleanupPlan({
    state: view.state, branch,
    dirty: run('git', ['status', '--porcelain']).trim() !== '',
    current: run('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
    remoteExists: run('git', ['ls-remote', '--heads', 'origin', branch]).trim() !== '',
    localExists: spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0,
  });
  console.log(`PR #${args.pr}：state ${view.state}，head 分支 ${branch}`);
  if (plan.refuse) { console.log(`拒絕：${plan.refuse}`); return 3; }
  for (const { args: [cmd, ...rest], skip } of plan.steps) {
    const shown = [cmd, ...rest].join(' ');
    if (skip) { console.log(`略過：${shown}（${skip}）`); continue; }
    if (args.dryRun) { console.log(`會執行：${shown}`); continue; }
    console.log(`執行：${shown}`);
    const r = spawnSync(cmd, rest, { stdio: 'inherit' });
    if (r.status !== 0) { console.error(`pr-cleanup：${shown} 失敗（結束碼 ${r.status}），後面的步驟沒有執行`); return 1; }
  }
  if (args.dryRun) console.log('（--dry-run：沒有執行任何步驟）');
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exitCode = cli(process.argv.slice(2)); }
  catch (e) { console.error(`pr-cleanup：${e.stderr?.toString().trim() || e.message}`); process.exitCode = 1; }
}
