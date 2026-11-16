// issue-start.mjs — 開工：確認議題還沒做、工作樹乾淨，檢查都通過才用 --no-track 從 origin/main 開 <n>-<slug> 分支
// 用法：node scripts/issue-start.mjs --issue <n> --slug <slug> [--dry-run]
//
// 照 docs/agents/workflow.md 的「Commit 與 PR」的開工：依序檢查工作樹乾淨、git fetch origin、議題是 OPEN、
// 議題沒有連到 OPEN 或 MERGED 的 PR（GraphQL 的 closedByPullRequestsReferences，含已關閉的 PR）、origin/main 上沒有提到 #<n> 的 commit、
// <n>-<slug> 分支在本機與 origin 都還不存在；每一項都印出結果。都通過才執行 git switch -c <n>-<slug> --no-track origin/main，
// 上游留空，第一次 push 用 git push -u origin <n>-<slug>。--dry-run 照樣檢查（含 git fetch），只印出會執行的那一行。
// 這支程式不 push、不開 PR。
// 結束碼：0 開好分支（或 --dry-run 時全部通過）；3 有檢查不通過，一個分支都不開；1 gh 或 git 失敗；2 參數有誤。
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePrNumber } from './pr-number.mjs';

// ---------- 判斷：不碰 gh、git 與網路 ----------

// log：git log 的 { sha, message }（message 是完整的 commit 訊息）。回傳提到 #<n> 的那些 { sha, subject }：
// #<n> 後面不能接數字，#32 才不會命中 #321、#320
export function issueCommits(n, log) {
  const mention = new RegExp(`#${n}(?![0-9])`);
  return log.filter(c => mention.test(c.message)).map(c => ({ sha: c.sha, subject: c.message.split('\n')[0] }));
}

// 分支名稱與 PR 清單的寫法：startPlan 與 CLI 共用
const branchName = (issue, slug) => `${issue}-${slug}`;
const prList = (prs) => prs.map(p => `#${p.number}（${p.state}）`).join('、');

// ctx：各項查詢的結果。回傳 { problems, notes, command, push }：problems 是不通過的原因，空的時候 command 是開分支的指令
export function startPlan({ issue, slug, dirty, state, linkedPrs, mainCommits, branchExists }) {
  const branch = branchName(issue, slug);
  const problems = [], notes = [];
  if (dirty) problems.push('工作樹有未提交的修改（git status --porcelain 有輸出）：先提交或還原');
  if (state !== 'OPEN') problems.push(`議題 #${issue} 的 state 是 ${state}，不是 OPEN`);
  // 沒合併就關閉的 PR（例如 #164 的 #305）不代表做過，只列出來
  const active = linkedPrs.filter(p => p.state !== 'CLOSED'), closed = linkedPrs.filter(p => p.state === 'CLOSED');
  if (active.length) problems.push(`已經有 PR 連到議題 #${issue}：${prList(active)}`);
  if (mainCommits.length) problems.push(`origin/main 上已經有提到 #${issue} 的 commit：${mainCommits.map(c => `${c.sha} ${c.subject}`).join('；')}`);
  const where = [branchExists.local && '本機', branchExists.remote && 'origin'].filter(Boolean);
  if (where.length) problems.push(`分支 ${branch} 已經存在：${where.join('、')}`);
  if (closed.length) notes.push(`連到議題 #${issue}、已關閉沒合併的 PR：${prList(closed)}`);
  if (problems.length) return { problems, notes, command: null, push: null };
  return { problems, notes, command: ['git', 'switch', '-c', branch, '--no-track', 'origin/main'], push: `git push -u origin ${branch}` };
}

// ---------- CLI：gh 與 git 的呼叫都在這裡 ----------
const USAGE = `用法：node scripts/issue-start.mjs --issue <n> --slug <slug> [--dry-run]
  --issue <n>     議題編號（正整數）
  --slug <slug>   分支名稱 <n>-<slug> 的後半：小寫英數字與 -，開頭與結尾不能是 -
  --dry-run       照樣檢查（含 git fetch），只印出會執行的那一行，不開分支
檢查：工作樹乾淨 → git fetch origin → 議題是 OPEN → 沒有連到 OPEN 或 MERGED 的 PR → origin/main 上沒有提到 #<n> 的 commit → 分支還不存在`;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const opts = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--dry-run') opts.dryRun = true;
    else if (['--issue', '--slug'].includes(flag) && value !== undefined && !value.startsWith('--')) { opts[flag.slice(2)] = value; i++; }
    else return { error: `不認得的參數或缺少值：${flag}` };
  }
  if (opts.issue === undefined) return { error: '缺少 --issue' };
  const issue = parsePrNumber(opts.issue);
  if (issue === null) return { error: `--issue 要是正整數：${opts.issue}` };
  if (opts.slug === undefined) return { error: '缺少 --slug' };
  if (!SLUG.test(opts.slug)) return { error: `--slug 只收小寫英數字與 -，開頭與結尾不能是 -：${opts.slug}` };
  return { issue, slug: opts.slug, dryRun: opts.dryRun };
}

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

function cli(argv) {
  const args = parseArgs(argv);
  if (args.help) { console.log(USAGE); return 0; }
  if (args.error) { console.error(`${args.error}\n${USAGE}`); return 2; }
  const { issue, slug } = args, branch = branchName(issue, slug);

  const dirty = run('git', ['status', '--porcelain']).trim() !== '';
  run('git', ['fetch', 'origin']);
  const repo = JSON.parse(run('gh', ['repo', 'view', '--json', 'owner,name']));
  const data = JSON.parse(run('gh', ['api', 'graphql', '-f', `query={repository(owner:"${repo.owner.login}",name:"${repo.name}"){issue(number:${issue}){state closedByPullRequestsReferences(first:20,includeClosedPrs:true){nodes{number state}}}}}`])).data.repository.issue;
  if (!data) throw new Error(`找不到議題 #${issue}`);
  // --grep 先用子字串取候選（便宜），再由 issueCommits 錨定過濾；%x1e 分隔每個 commit，%x00 分隔短 SHA 與完整訊息
  const log = run('git', ['log', 'origin/main', `--grep=#${issue}`, '--format=%h%x00%B%x1e']).split('\x1e').map(x => x.trim()).filter(Boolean)
    .map(x => { const [sha, message] = x.split('\0'); return { sha, message }; });
  const ctx = {
    issue, slug, dirty, state: data.state, linkedPrs: data.closedByPullRequestsReferences.nodes, mainCommits: issueCommits(issue, log),
    branchExists: {
      local: spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0,
      remote: run('git', ['ls-remote', '--heads', 'origin', branch]).trim() !== '',
    },
  };
  const plan = startPlan(ctx);
  const prs = prList(ctx.linkedPrs) || '沒有';
  console.log([
    `議題 #${issue}：${ctx.state}`,
    `- 工作樹：${dirty ? '有未提交的修改' : '乾淨'}`,
    '- git fetch origin：完成',
    `- 連到的 PR：${prs}`,
    `- origin/main 上提到 #${issue} 的 commit：${ctx.mainCommits.length ? ctx.mainCommits.map(c => c.sha).join('、') : '沒有'}`,
    `- 分支 ${branch}：${ctx.branchExists.local || ctx.branchExists.remote ? '已經存在' : '還不存在'}`,
    ...plan.notes.map(n => `- 注意：${n}`),
  ].join('\n'));
  if (plan.problems.length) { console.log(`不通過，不開分支：\n${plan.problems.map(p => `  - ${p}`).join('\n')}`); return 3; }
  const shown = plan.command.join(' ');
  if (args.dryRun) { console.log(`會執行：${shown}\n（--dry-run：沒有開分支）`); return 0; }
  console.log(`執行：${shown}`);
  const r = spawnSync(plan.command[0], plan.command.slice(1), { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`issue-start：${shown} 失敗（結束碼 ${r.status}）`); return 1; }
  console.log(`第一次 push：${plan.push}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exitCode = cli(process.argv.slice(2)); }
  catch (e) { console.error(`issue-start：${e.stderr?.toString().trim() || e.message}`); process.exitCode = 1; }
}
