// pr-status.mjs — PR 收尾的狀態：印出合併前要確認的 state、checks、browser 的 runner image、會關閉的 issue 與截圖交叉比對，條件都滿足才印出合併指令
// 用法：node scripts/pr-status.mjs --pr <n> [--wait]
//
// 照 docs/agents/workflow.md 的「Commit 與 PR」：印出 state、mergeStateStatus、head 的完整 SHA、closingIssuesReferences、checks 的摘要、
// 每次 browser 的 run 與 runner image（那個 job 的 log 裡的 Image: 那一行），並以子行程執行 screenshot-crosscheck.mjs，原樣附上它的輸出。
// OPEN、沒有 pending 與失敗的檢查、browser 出現 2 次而且每次都 pass、mergeStateStatus 是 CLEAN 都成立，才印出照 workflow.md 格式組好的合併指令；
// 截圖的結論不擋（雜訊由人判斷）。只回報：這支程式不合併。--wait 每 30 秒查一次，最多 30 分鐘；進度印到 stderr。
// 結束碼：0 印出了合併指令；3 還不能合併（含已經合併、已經關閉、--wait 逾時）；1 gh 失敗或找不到 PR；2 參數有誤。
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePrNumber } from './pr-number.mjs';

// ---------- 判斷：不碰 gh、git 與網路 ----------

// 合併指令裡的標題要貼進 shell：照 workflow.md 用雙引號；標題有 " $ ` \ 時，雙引號裡會被展開或斷掉，改用單引號（' 寫成 '\''）
const shellArg = (s) => /["$`\\]/.test(s) ? `'${s.replace(/'/g, `'\\''`)}'` : `"${s}"`;

// browser 是 needs: [unit, verify]，比其他檢查晚出現；push 與 pull_request 各一次（截圖交叉比對要兩次）
const BROWSER_RUNS = 2;
const browserChecks = (checks) => checks.filter(c => c.name === 'browser');

// view：gh pr view --json number,title,state,mergeStateStatus,headRefOid；checks：gh pr checks --json name,bucket。
// 回傳 { reasons, command }：reasons 是還不能合併的原因，空的時候 command 是照 docs/agents/workflow.md 格式組好的合併指令，否則是 null
export function mergeReadiness({ view, checks }) {
  if (view.state === 'MERGED') return { reasons: ['已經合併'], command: null };
  if (view.state !== 'OPEN') return { reasons: ['已經關閉，沒有合併'], command: null };
  const reasons = [];
  const pending = checks.filter(c => c.bucket === 'pending');
  if (pending.length) reasons.push(`還有檢查在跑：${pending.map(c => c.name).join('、')}`);
  // gh pr checks 的 bucket：pass、fail、pending、skipping、cancel；skipping 不算沒通過
  const failed = checks.filter(c => c.bucket === 'fail' || c.bucket === 'cancel');
  if (failed.length) reasons.push(`有檢查沒通過：${failed.map(c => `${c.name}（${c.bucket}）`).join('、')}`);
  const browser = browserChecks(checks);
  if (!browser.length) reasons.push('browser 還沒出現');
  else if (browser.length < BROWSER_RUNS) reasons.push(`browser 只出現 ${browser.length} 次，要 ${BROWSER_RUNS} 次（push 與 pull_request）`);
  // browser 每次都要 pass：skipping 代表截圖沒有產生，交叉比對無從比起（pending、fail、cancel 上面已經列過）
  const skipped = browser.filter(c => c.bucket === 'skipping');
  if (skipped.length) reasons.push(`browser 有 ${skipped.length} 次是 skipping，每次都要 pass`);
  if (view.mergeStateStatus === 'BEHIND') reasons.push('mergeStateStatus 是 BEHIND：先 git merge main 再 push，等 CI 重跑');
  else if (view.mergeStateStatus !== 'CLEAN') reasons.push(`mergeStateStatus 是 ${view.mergeStateStatus}，要是 CLEAN`);
  const command = `gh pr merge ${view.number} --merge --subject ${shellArg(`Merge pull request #${view.number}: ${view.title}`)} --body ${shellArg(view.title)} --match-head-commit ${view.headRefOid}`;
  return { reasons, command: reasons.length ? null : command };
}

// gh run view --job --log 的每一行是「job 名稱<TAB>步驟<TAB>時間戳 內容」；回傳第一個內容以 Image: 起頭的那一行（時間戳之後的整段，例如 Image: ubuntu-26.04），沒有就回傳 null。
// 只認內容起頭的 Image:，所以 Runner Image、Image Release: 那幾行不會誤抓
export function runnerImage(log) {
  return log.match(/^[^\t\n]*\t[^\t\n]*\t\S+ (Image: [^\r\n]*)/m)?.[1].trimEnd() ?? null;
}

// screenshot-crosscheck.mjs 子行程的結果（spawnSync 的 { status, signal, stdout, stderr }）→ 附在狀態裡的那一段：成功時原樣附上 stdout；
// 失敗時附上結束碼（或訊號）與完整的 stderr，放在縮排的程式碼區塊裡，多行錯誤原樣保留
export function crosscheckSection({ status, signal, stdout, stderr }) {
  if (status === 0) return stdout.trim();
  const ended = status === null ? `訊號 ${signal}` : `結束碼 ${status}`;
  const err = (stderr || '').trimEnd();
  return `- **截圖交叉比對**：沒有完成（${ended}）${err ? `，stderr：\n  \`\`\`\n${err.split('\n').map(l => `  ${l}`).join('\n')}\n  \`\`\`` : '，stderr 沒有輸出'}`;
}

// --wait 要不要再等：還有檢查在跑，或 browser 還不到 2 次（unit 與 verify 跑完、browser 還沒排進來時，gh pr checks 沒有 pending）
export function keepWaiting(checks) {
  return checks.some(c => c.bucket === 'pending') || browserChecks(checks).length < BROWSER_RUNS;
}

// ---------- CLI：gh 的呼叫都在這裡 ----------
const USAGE = `用法：node scripts/pr-status.mjs --pr <n> [--wait]
  --pr <n>   PR 編號（正整數）
  --wait     每 30 秒查一次，等到沒有 pending 而且 browser 出現 2 次（最多 30 分鐘），再印出狀態
只回報、不合併；合併指令照 docs/agents/workflow.md 的格式組好，由人或代理在使用者明說之後執行`;

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const opts = { wait: false };
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--wait') opts.wait = true;
    else if (flag === '--pr' && value !== undefined && !value.startsWith('--')) { opts.pr = value; i++; }
    else return { error: `不認得的參數或缺少值：${flag}` };
  }
  if (!opts.pr) return { error: '缺少 --pr' };
  const pr = parsePrNumber(opts.pr);
  if (pr === null) return { error: `--pr 要是正整數：${opts.pr}` };
  return { pr, wait: opts.wait };
}

const WAIT_INTERVAL_MS = 30_000, WAIT_LIMIT_MS = 30 * 60_000;
const log = (msg) => process.stderr.write(`${msg}\n`);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function cli(argv) {
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  // gh pr checks 有失敗時以 1、有 pending 時以 8 結束，--json 的輸出照樣印；沒有 stdout 才算失敗
  const prChecks = (pr) => {
    const r = spawnSync('gh', ['pr', 'checks', String(pr), '--json', 'name,bucket,link,event'], { encoding: 'utf8' });
    if (r.error) throw r.error;
    if (!r.stdout.trim()) { if (/no checks reported/i.test(r.stderr)) return []; throw new Error(`gh pr checks 失敗：${r.stderr.trim()}`); }
    return JSON.parse(r.stdout);
  };

  const args = parseArgs(argv);
  if (args.help) { console.log(USAGE); return 0; }
  if (args.error) { console.error(`${args.error}\n${USAGE}`); return 2; }

  let checks = prChecks(args.pr);
  if (args.wait) {
    const start = Date.now();
    while (keepWaiting(checks) && Date.now() - start < WAIT_LIMIT_MS) {
      const browser = browserChecks(checks).length, pending = checks.filter(c => c.bucket === 'pending').length;
      log(`等 CI：pending ${pending}、browser ${browser} 次；30 秒後再查`);
      sleep(WAIT_INTERVAL_MS);
      checks = prChecks(args.pr);
    }
    if (keepWaiting(checks)) log('等了 30 分鐘還沒跑完，印出目前的狀態');
  }

  const view = JSON.parse(gh('pr', 'view', String(args.pr), '--json', 'number,title,state,mergeStateStatus,headRefOid'));
  const repo = JSON.parse(gh('repo', 'view', '--json', 'owner,name'));
  const closing = JSON.parse(gh('api', 'graphql', '-f', `query={repository(owner:"${repo.owner.login}",name:"${repo.name}"){pullRequest(number:${args.pr}){closingIssuesReferences(first:20){nodes{number}}}}}`))
    .data.repository.pullRequest.closingIssuesReferences.nodes.map(n => `#${n.number}`);
  // browser 每一次的 run id 與 job id 取自 checks 的連結（…/actions/runs/<run>/job/<job>）；runner image 只讀那個 job 的 log
  const browserRuns = browserChecks(checks).map(c => {
    const [, run, job] = c.link.match(/\/runs\/(\d+)\/job\/(\d+)/) || [];
    let image = '（job 還沒跑完）';
    if (job && c.bucket !== 'pending') {
      // gh api 的 jobs/<id>/logs 會因為 log 裡有終端機跳脫序列而拒絕輸出，改用 gh run view --job（只抓這個 job 的 log）
      try { image = runnerImage(gh('run', 'view', run, '--job', job, '--log')) ?? '（log 裡沒有 Image: 那一行）'; }
      catch (e) { image = `（讀不到 job log：${e.stderr?.toString().trim() || e.message}）`; }
    }
    return { run, event: c.event || '?', bucket: c.bucket, image };
  });
  // 截圖交叉比對的判定只有 screenshot-crosscheck.mjs 一份：原樣附上它的輸出，它失敗時附上完整的 stderr
  const crosscheck = crosscheckSection(spawnSync(process.execPath, [fileURLToPath(new URL('./screenshot-crosscheck.mjs', import.meta.url)), '--pr', String(args.pr)], { encoding: 'utf8' }));

  const { reasons, command } = mergeReadiness({ view, checks });
  const buckets = Object.entries(checks.reduce((m, c) => ({ ...m, [c.bucket]: (m[c.bucket] || 0) + 1 }), {})).map(([b, n]) => `${b} ${n}`).join(', ') || '（還沒有檢查）';
  const lines = [
    `## PR #${view.number}：${view.title}`,
    `- state：${view.state}；mergeStateStatus：${view.mergeStateStatus}；head：${view.headRefOid}`,
    `- 會關閉的 issue（closingIssuesReferences）：${closing.join('、') || '（沒有）'}`,
    `- checks：${buckets}；browser：${browserRuns.length} 次`,
    ...browserRuns.map(b => `  - run ${b.run ?? '?'}（${b.event}）：${b.bucket}，${b.image}`),
    crosscheck,
    reasons.length ? `- **還不能合併**：\n${reasons.map(r => `  - ${r}`).join('\n')}` : `- **可以合併**（截圖的結論要另外確認）：\n\n\`\`\`\n${command}\n\`\`\``,
  ];
  console.log(lines.join('\n'));
  return command ? 0 : 3;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exitCode = cli(process.argv.slice(2)); }
  catch (e) { console.error(`pr-status：${e.stderr?.toString().trim() || e.message}`); process.exitCode = 1; }
}
