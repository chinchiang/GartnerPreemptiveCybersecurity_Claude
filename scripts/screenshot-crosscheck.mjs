// screenshot-crosscheck.mjs — 截圖交叉比對：下載 PR 兩次 CI 執行的截圖，跟 PR head（或 --sha 指定的 commit）已提交的版本比對，印出 Merge Danger 用的 markdown
// 用法：node scripts/screenshot-crosscheck.mjs --pr <n> [--sha <commit>] [--out <目錄>]
//
// 照 docs/agents/workflow.md 的「截圖交叉比對」：找出 PR head（或 --sha 指定的 commit）的 push 與 pull_request 兩次 ci.yml 執行，下載
// verify-report-and-screenshots artifact 到 --out（預設 scratch/screenshot-crosscheck/pr-<n>-<sha7>/，每次執行一個子目錄、
// 已經下載過就沿用），跟那個 commit 已提交的截圖（git show，不看工作樹）比對，依結論分組，畫面有變的列出 PR 到那個 commit 為止
// 改到的來源（SCREENSHOT_SOURCES）。執行要是那個 PR 分支上、已經跑完而且通過的；只有一次可用時退回單次比對。只報告：不改 verify-screenshots/、不 commit；換不換截圖由人或代理決定。
// markdown 印到 stdout（貼進 PR 說明的 Merge Danger），進度與錯誤印到 stderr。
// 結束碼：比對完是 0（不論結果）；參數有誤是 2；gh 或 git 失敗、找不到 PR、執行或 artifact 是 1。
import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareScreenshots, readCommitted, readProduced } from './screenshot-diff.mjs';

const DIR = 'verify-screenshots';
const ARTIFACT = 'verify-report-and-screenshots';
const EVENTS = ['push', 'pull_request'];

// 每張截圖（檔名不含 .png）的頁面讀哪些資料檔：assets/app.js 各個 view 用到的 D.*，對應到定義那個 window.* 的 data/*.js。
// 截圖由 scripts/verify.mjs 拍：ROUTES 去掉 #/ 各一張，另有 home、home-last-updated（#/）、mobile-platforms（#/platforms）、
// case-interactive（#/case）。新增路由、截圖，或 view 改讀別的資料時，這裡要一起改（測試會比對 ROUTES 與已提交的截圖）。
// assets/ 與 index.html 影響每一頁，不列在這裡（affectsEveryPage）。
export const SCREENSHOT_SOURCES = {
  home: ['data/io.js', 'data/manifest.js', 'data/research.js', 'data/skills.js', 'data/sources.js'],
  'home-last-updated': ['data/io.js', 'data/manifest.js', 'data/research.js', 'data/skills.js', 'data/sources.js'],
  methodology: ['data/research.js'],
  process: ['data/process.js', 'data/io.js'],
  io: ['data/io.js', 'data/process.js'],
  platforms: ['data/platforms.js'],
  'mobile-platforms': ['data/platforms.js'],
  skills: ['data/skills.js', 'data/manifest.js'],
  guides: ['data/guides.js'],
  case: ['data/case.js', 'data/extra.js'],
  'case-interactive': ['data/case.js', 'data/extra.js'],
  sources: ['data/sources.js', 'data/extra.js'],
  deploy: ['data/guides.js', 'data/extra.js'],
};

// 版面與程式：改了就影響每一頁
const affectsEveryPage = (f) => f.startsWith('assets/') || f === 'index.html';

// PR 改過的檔案裡，會影響這張截圖的那些
function touchedSources(name, changedFiles) {
  const sources = SCREENSHOT_SOURCES[name.replace(/\.png$/, '')] || [];
  return changedFiles.filter(f => affectsEveryPage(f) || sources.includes(f));
}

export function crosscheck({ push, pr, committed, changedFiles }) {
  const rows = [];
  const byShot = (a, b) => (a.replace(/\.png$/, '') < b.replace(/\.png$/, '') ? -1 : 1); // 照截圖名稱排，home 在 home-last-updated 前面
  for (const name of [...new Set([...push.keys(), ...(pr?.keys() || []), ...committed.keys()])].sort(byShot)) {
    const p = push.get(name), c = committed.get(name);
    if (!pr) { // 單次比對：分不出雜訊
      rows.push({ name, verdict: !p ? 'not-produced' : c && p.equals(c) ? 'unchanged' : 'single-run-diff' });
      continue;
    }
    const q = pr.get(name);
    if (!p && !q) rows.push({ name, verdict: 'not-produced' });
    else if (!p || !q) rows.push({ name, verdict: 'one-run-only' });
    else if (p.equals(q)) {
      if (c && p.equals(c)) rows.push({ name, verdict: 'unchanged' });
      else {
        const touched = touchedSources(name, changedFiles);
        rows.push({ name, verdict: touched.length ? 'changed' : 'changed-untouched', touched });
      }
    } else if (c && (p.equals(c) || q.equals(c))) rows.push({ name, verdict: 'noise' });
    else rows.push({ name, verdict: 'undecided' });
  }
  for (const row of rows) row.pixel = pixelAgainstCommitted(row, push.get(row.name), pr?.get(row.name), committed.get(row.name));
  return rows;
}

// 跟已提交版本的像素差異（screenshot-diff.mjs 那三欄）：用兩次執行裡跟已提交不同的那一次；都相同或都沒有產生時沒有差異可列
function pixelAgainstCommitted({ name }, p, q, c) {
  const img = [p, q].find(x => x && !(c && x.equals(c)));
  if (!img) return undefined;
  if (!c) return { count: '新增', maxDelta: '—', bbox: '—' };
  const [, , , count, maxDelta, bbox] = compareScreenshots(new Map([[name, c]]), new Map([[name, img]]))[0];
  return { count, maxDelta, bbox };
}

// 每種結論在清單（Merge Danger）與差異表裡的寫法，依這個順序分組；處理方式見 docs/agents/workflow.md 的截圖交叉比對
const VERDICTS = {
  changed: ['畫面有變，換成 artifact 的版本', '畫面有變'],
  'changed-untouched': ['畫面有變，但 PR 沒改到那一頁的來源，要比對以前的 run', '畫面有變，PR 沒改到來源'],
  noise: ['雜訊，保留已提交的版本', '雜訊'],
  undecided: ['無法自動判斷，要看圖', '無法自動判斷'],
  'one-run-only': ['只有一次執行產生，要用 `ls` 確認', '只有一次執行產生'],
  'not-produced': ['已提交但這次沒有產生，網站拿掉了就刪除', '已提交但這次沒有產生'],
  'single-run-diff': ['跟已提交的不同，要看圖確認不是零星的像素差異', '跟已提交的不同'],
};

const shotName = (file) => `\`${file.replace(/\.png$/, '')}\``;

// crosscheck 的結果 → 貼進 PR 說明 Merge Danger 的 markdown。runs 是兩次執行的 run id，找不到的那一次是 null；
// pinned 是用 --sha 指定了 commit（不是 PR head），指令要帶上 --sha，照著重跑才會比對同一個 commit
export function renderMarkdown({ pr, sha, pinned = false, runs, rows }) {
  const cmd = `\`node scripts/screenshot-crosscheck.mjs --pr ${pr}${pinned ? ` --sha ${sha.slice(0, 7)}` : ''}\``;
  const head = `${pinned ? 'commit' : 'PR head'} \`${sha.slice(0, 7)}\``;
  const missing = Object.keys(runs).find(e => !runs[e]);
  const title = missing
    ? `- **截圖單次比對**（${head}；${Object.keys(runs).filter(e => runs[e]).map(e => `${e} run ${runs[e]}`).join('')}，沒有可用的 ${missing} run（找不到或下載失敗，原因見 stderr），分不出雜訊；${cmd}）：`
    : `- **截圖交叉比對**（${head}；push run ${runs.push}、pull_request run ${runs.pull_request}；${cmd}）：`;
  const listed = rows.filter(r => r.verdict !== 'unchanged');
  const same = rows.length - listed.length;
  if (!listed.length) return `${title}${same} 張都跟已提交的相同，不用換。\n`;
  const lines = [title];
  for (const [verdict, [group]] of Object.entries(VERDICTS)) {
    const these = listed.filter(r => r.verdict === verdict);
    if (!these.length) continue;
    const items = these.map(r => shotName(r.name) + (r.touched?.length ? `（${r.touched.map(f => `\`${f}\``).join('、')}）` : ''));
    lines.push(`  - **${group}**：${items.join('、')}`);
  }
  if (same) lines.push(`  - 其餘 ${same} 張跟已提交的相同。`);
  lines.push('', '| 截圖 | 結論 | 不同像素數 | 最大通道差 | 差異範圍 |', '|---|---|---|---|---|');
  for (const r of listed) {
    const { count = '—', maxDelta = '—', bbox = '—' } = r.pixel || {};
    lines.push(`| ${shotName(r.name)} | ${VERDICTS[r.verdict][1]} | ${count} | ${maxDelta} | ${bbox} |`);
  }
  return lines.join('\n') + '\n';
}

// ---------- CLI：gh 與 git 的呼叫都在這裡 ----------
const USAGE = `用法：node scripts/screenshot-crosscheck.mjs --pr <n> [--sha <commit>] [--out <目錄>]
  --pr <n>       PR 編號（正整數）
  --sha <commit> 比對 PR 裡的哪個 commit（7～40 位十六進位；預設 PR head）
  --out <目錄>   artifact 下載到哪裡（預設 scratch/screenshot-crosscheck/pr-<n>-<sha7>/；每次執行一個子目錄，已經下載過就沿用）
比對方式見 docs/agents/workflow.md 的截圖交叉比對`;

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (['--pr', '--sha', '--out'].includes(flag) && value !== undefined && !value.startsWith('--')) { opts[flag.slice(2)] = value; i++; }
    else return { error: `不認得的參數或缺少值：${flag}` };
  }
  if (!opts.pr) return { error: '缺少 --pr' };
  if (!/^[1-9]\d*$/.test(opts.pr)) return { error: `--pr 要是正整數：${opts.pr}` };
  if (opts.sha !== undefined) opts.sha = opts.sha.toLowerCase(); // git 也接受大寫
  if (opts.sha !== undefined && !/^[0-9a-f]{7,40}$/.test(opts.sha)) return { error: `--sha 要是 7～40 位十六進位的 commit：${opts.sha}` };
  return { pr: Number(opts.pr), sha: opts.sha, out: opts.out };
}

const run = (cmd, args, encoding = 'utf8') => execFileSync(cmd, args, { encoding, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const gh = (...args) => run('gh', args);
const git = (args, encoding) => run('git', args, encoding);
const log = (msg) => process.stderr.write(`${msg}\n`);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// PR 的 head、分支與 base；--sha 給的短 SHA 展開成完整的（gh run list --commit 只認完整 SHA），而且要是這個 PR 的 commit
function resolvePr({ pr, sha }) {
  const view = JSON.parse(gh('pr', 'view', String(pr), '--json', 'headRefOid,headRefName,baseRefName,baseRefOid,commits'));
  let target = view.headRefOid;
  if (sha) {
    const match = view.commits.map(c => c.oid).filter(oid => oid.startsWith(sha));
    if (match.length !== 1) throw new Error(`PR #${pr} 的 commit 裡${match.length ? '有不只一個' : '沒有'}符合 ${sha} 的`);
    target = match[0];
  }
  return { ...view, sha: target };
}

// 本機沒有那個 commit 時，依序 fetch 給的 ref，再確認一次
function ensureCommit(oid, refs) {
  const has = () => { try { git(['cat-file', '-e', `${oid}^{commit}`]); return true; } catch { return false; } };
  if (has()) return;
  for (const ref of refs) {
    log(`本機沒有 ${oid.slice(0, 7)}，fetch origin ${ref}`);
    try { git(['fetch', '-q', 'origin', ref]); } catch (e) { log(`fetch 失敗：${e.stderr?.toString().trim() || e.message}`); }
    if (has()) return;
  }
  throw new Error(`本機找不到 ${oid.slice(0, 7)}：fetch origin ${refs.join('、')} 之後還是沒有（GitHub 的 remote 不叫 origin 時，先自己 fetch 那個 commit）`);
}

// 這個 PR 分支上、每種 event 最新的一次執行。head_sha 篩選偶爾回空的結果（workflow.md），兩種沒找齊就重試。
// 用 headBranch 篩掉同一個 commit 在別的分支或別的 PR 的執行
function findRuns(sha, branch) {
  let runs = {};
  for (let attempt = 1; attempt <= 3; attempt++) {
    const list = JSON.parse(gh('run', 'list', '--workflow=ci.yml', '--commit', sha, '--limit', '50', '--json', 'databaseId,event,status,conclusion,headBranch,attempt'))
      .filter(r => r.headBranch === branch);
    runs = Object.fromEntries(EVENTS.map(e => [e, list.filter(r => r.event === e).sort((a, b) => b.databaseId - a.databaseId)[0] || null]));
    if (EVENTS.every(e => runs[e])) break;
    if (attempt < 3) { log(`找到的執行：${EVENTS.map(e => `${e} ${runs[e]?.databaseId ?? '無'}`).join('、')}；5 秒後重試`); sleep(5000); }
  }
  return runs;
}

// 下載到 <event>-<run id>-<attempt>/：重跑（新的 attempt）或新的執行不會沿用舊的截圖。
// 先下載到 .partial，完整了才改名，下載到一半失敗不會留下被當成快取的目錄
function download(event, r, out) {
  const dir = join(out, `${event}-${r.databaseId}-${r.attempt}`);
  if (existsSync(join(dir, DIR))) { log(`沿用已下載的 ${dir}`); return dir; }
  const partial = `${dir}.partial`;
  rmSync(partial, { recursive: true, force: true });
  log(`下載 ${event} run ${r.databaseId}（第 ${r.attempt} 次執行）的 artifact 到 ${dir}`);
  gh('run', 'download', String(r.databaseId), '-n', ARTIFACT, '-D', partial);
  if (!existsSync(join(partial, DIR))) throw new Error(`run ${r.databaseId} 的 artifact 裡沒有 ${DIR}/`);
  renameSync(partial, dir);
  return dir;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) { console.log(USAGE); return 0; }
  if (args.error) { console.error(`${args.error}\n${USAGE}`); return 2; }
  const pr = resolvePr(args), { sha } = pr;
  const found = findRuns(sha, pr.headRefName);
  const present = EVENTS.filter(e => found[e]);
  if (!present.length) throw new Error(`找不到 ${pr.headRefName} 分支上 ${sha.slice(0, 7)} 的 ci.yml 執行`);
  const pending = present.filter(e => found[e].status !== 'completed');
  if (pending.length) throw new Error(`${pending.map(e => `${e} run ${found[e].databaseId}`).join('、')} 還沒跑完，等 CI 結束再比對`);
  // 失敗或取消的執行，artifact 仍會上傳（if: always()），但截圖可能不完整，不能當依據
  const failed = present.filter(e => found[e].conclusion !== 'success');
  if (failed.length) throw new Error(`${failed.map(e => `${e} run ${found[e].databaseId} 的結論是 ${found[e].conclusion}`).join('、')}：CI 通過之後再比對`);
  const out = args.out || join('scratch', 'screenshot-crosscheck', `pr-${args.pr}-${sha.slice(0, 7)}`);
  // 一次下載失敗（例如 artifact 過了保留期限）就退回另一次的單次比對；兩次都失敗才結束
  const usable = [];
  for (const e of present) {
    try { usable.push([e, readProduced(download(e, found[e], out))]); }
    catch (err) { log(`${e} run ${found[e].databaseId} 的 artifact 下載失敗，不用這一次：${err.stderr?.toString().trim() || err.message}`); }
  }
  if (!usable.length) throw new Error('兩次執行的 artifact 都下載失敗');
  ensureCommit(sha, [`refs/pull/${args.pr}/head`]);
  ensureCommit(pr.baseRefOid, [pr.baseRefName]);
  const rows = crosscheck({ push: usable[0][1], pr: usable[1]?.[1] || null, committed: readCommitted(process.cwd(), sha),
    // 改過的檔案算到這個 commit 為止（--sha 時不是 PR head 的 diff）；用 git，不必下載整份 PR diff
    changedFiles: git(['diff', '--name-only', '-z', `${pr.baseRefOid}...${sha}`]).split('\0').filter(Boolean) });
  const used = new Set(usable.map(([e]) => e));
  const runs = Object.fromEntries(EVENTS.map(e => [e, used.has(e) ? found[e].databaseId : null]));
  process.stdout.write(renderMarkdown({ pr: args.pr, sha, pinned: !!args.sha, runs, rows }));
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(`screenshot-crosscheck：${(e.stderr?.toString().trim() || e.message)}`); process.exitCode = 1; }
}
