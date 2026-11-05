#!/usr/bin/env node
/**
 * full-check.mjs — 全套檢查：在 WSL 上依序跑三個 Node 環境的單元測試、Python 測試、靜態驗證與重建，摘要與每一步的 log 寫到 --out
 *
 *   node scripts/full-check.mjs --out scratch/<n>/full-1 [--browser] [--node22 <路徑>] [--timeout <秒>]
 *
 * 步驟（依序；某一步失敗照跑後面的）：本機 node --test → Node 22 → node.exe（Windows）→ python3 -m unittest
 * → verify.mjs --static →（只有 --browser）node.exe verify.mjs 完整模式 → build-data.mjs 重建。
 * 寫出 <前綴>.txt（摘要，全部跑完才寫）與 <前綴>-<步驟>.log（每一步的 stdout 與 stderr）；前綴用掉了就自動換下一個號碼。
 *
 * 結束碼：0 全部步驟都跑了而且通過；1 至少一步失敗（結束碼非 0、fail 或 cancelled 大於 0、讀不到摘要、逾時、重建改動了工作樹）；
 * 2 參數有誤，一步都沒跑；3 沒有失敗但有略過的環境。同時有失敗與略過時以 1 為準。
 *
 * 只支援 Linux／macOS（主要用在 WSL）；在 Windows 上直接執行以 2 結束。中斷（Ctrl+C、SIGTERM）時結束目前那一步的子行程，
 * 不寫摘要檔（已寫出的 log 留著）；--browser 那一步被中斷時先從備份還原。中斷時的還原只保證 Linux／macOS：
 * 萬一沒還原，從 <前綴>-browser-backup/ 手動 cp 回 verify-report.md 與 verify-screenshots/。
 * 逾時的判定與結束子行程用 child-process.mjs（同 mutate.mjs）。
 */
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename, relative, delimiter, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTimeout, runWithTimeout } from './child-process.mjs';
import { sameReportIgnoringRunTime } from './verify-report.mjs';

// ---------------------------------------------------------------------------
// 純函式核心：不碰磁碟、不開子行程
// ---------------------------------------------------------------------------

const NODE_KEYS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
const lastMatch = (text, re) => { let m = null; for (const x of text.matchAll(re)) m = x; return m; };

/** node --test 的計數摘要：spec（ℹ tests 3）與 TAP（# tests 3）都認得。六個鍵任一個讀不到就是 null（算失敗，不當成通過）。 */
export function nodeSummary(text) {
  const counts = {};
  for (const key of NODE_KEYS) {
    const m = lastMatch(text, new RegExp(`^(?:ℹ|#) ${key} (\\d+)$`, 'gm'));
    if (!m) return null;
    counts[key] = Number(m[1]);
  }
  return counts;
}

/** 略過的測試：spec 是「﹣ 名稱 (時間) # 原因」，TAP 是「ok 2 - 名稱 # SKIP 原因」。回傳「名稱 # 原因」（沒有原因就只有名稱）。 */
export function skippedTests(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const spec = line.match(/^\s*﹣ (.+?) \([\d.]+m?s\)(?: # (.*))?$/);
    const tap = line.match(/^\s*(?:not )?ok \d+ - (.+?) # SKIP(?: (.*))?$/i);
    const m = spec || tap;
    if (m) out.push(m[2] ? `${m[1]} # ${m[2]}` : m[1]);
  }
  return out;
}

/** unittest 的摘要：「Ran 112 tests in 22.975s」加上結尾的「OK」或「FAILED (…)」；任一個讀不到就是 null。 */
export function unittestSummary(text) {
  const ran = lastMatch(text, /^Ran \d+ tests? in [\d.]+s$/gm);
  const result = lastMatch(text, /^(?:OK(?: \(.*\))?|FAILED \(.*\))$/gm);
  return ran && result ? { text: `${ran[0]} ${result[0]}`, ok: result[0].startsWith('OK') } : null;
}

/** verify.mjs 的摘要：最後一行「<n>/<m> 通過…」；讀不到就是 null。 */
export function verifySummary(text) {
  const m = lastMatch(text, /^(\d+)\/(\d+) 通過.*$/gm);
  return m ? { text: m[0], ok: m[1] === m[2] } : null;
}

/** 前綴用掉了沒：<前綴>.txt 或任何 <前綴>-*.log 存在。names 是前綴所在目錄的檔名。 */
const prefixUsed = (base, names) => names.includes(`${base}.txt`) || names.some(n => n.startsWith(`${base}-`) && n.endsWith('.log'));

/** 下一個沒用掉的前綴：結尾是 -<數字> 就加 1，沒有數字就從 -2 開始。names 是前綴所在目錄的檔名。 */
export function nextPrefix(prefix, names) {
  const dir = dirname(prefix);
  let base = basename(prefix);
  while (prefixUsed(base, names)) {
    const m = base.match(/^(.*)-(\d+)$/);
    base = m ? `${m[1]}-${Number(m[2]) + 1}` : `${base}-2`;
  }
  return dir === '.' && !prefix.startsWith('./') ? base : join(dir, base);
}

/** 重建前後的工作樹狀態（{ 路徑: 狀態碼＋內容雜湊 }）不同的路徑，排序後回傳；只比檔名不比內容的話，重建改了內容會抓不到。 */
export function changedPaths(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(k => before[k] !== after[k]).sort();
}

/** scratch/node22/ 底下最新的 node-v22.*（依版本號比較，不是字串）；沒有就是 null。 */
export function latestNode22(names) {
  const versions = names.map(n => ({ n, m: n.match(/^node-v22\.(\d+)\.(\d+)(?:-.+)?$/) })).filter(x => x.m)
    .map(({ n, m }) => ({ n, v: [Number(m[1]), Number(m[2])] }));
  versions.sort((a, b) => b.v[0] - a.v[0] || b.v[1] - a.v[1]);
  return versions.length ? versions[0].n : null;
}

export const USAGE = '用法：node scripts/full-check.mjs --out <前綴> [--browser] [--node22 <路徑>] [--timeout <秒>]';

/** 解析參數：{ out, browser, node22, timeout } 或 { error }（結束碼 2，一步都不跑）。 */
export function parseArgs(argv) {
  const opts = { out: null, browser: false, node22: null, timeout: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--browser') opts.browser = true;
    else if (a === '--out' || a === '--node22' || a === '--timeout') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) return { error: `${a} 後面要接值` };
      if (a === '--out') opts.out = v;
      else if (a === '--node22') opts.node22 = v;
      else {
        const t = parseTimeout(v);
        if (t === null) return { error: `--timeout 要是 0 或正數（秒），收到 ${v}` };
        opts.timeout = t;
      }
    } else return { error: `不認得的參數：${a}` };
  }
  if (!opts.out) return { error: '缺少 --out <前綴>' };
  return opts;
}

/**
 * 一步的結果 → 摘要行。step：{ name, label, skipped?, timedOut?, seconds?, exit?, summary?, failed, notes?, tests? }
 *   skipped：略過的原因；summary：讀到的摘要文字（null＝讀不到）；notes：附在摘要後面的說明；tests：略過的測試（列在下面）。
 */
export function stepLines(step) {
  if (step.skipped) return [`== ${step.label}：略過（${step.skipped}）`];
  if (step.timedOut) return [`== ${step.label}：逾時（${step.seconds} 秒）`];
  const body = step.summary === null ? '讀不到摘要' : step.summary;
  return [`== ${step.label}：exit=${step.exit}；${body}${(step.notes || []).map(n => `；${n}`).join('')}`, ...(step.tests || []).map(t => `﹣ ${t}`)];
}

/** 由各步的結果組出結論與結束碼：全過（n/n）｜有失敗：…｜有略過：…（兩種都有時都列）；失敗優先於略過。 */
export function conclusion(steps) {
  const failed = steps.filter(s => s.failed).map(s => s.name);
  const skipped = steps.filter(s => s.skipped).map(s => s.name);
  const parts = [];
  if (failed.length) parts.push(`有失敗：${failed.join('、')}`);
  if (skipped.length) parts.push(`有略過：${skipped.join('、')}`);
  return { text: parts.length ? parts.join('；') : `全過（${steps.length}/${steps.length}）`, exitCode: failed.length ? 1 : skipped.length ? 3 : 0 };
}

/** 摘要全文。head：{ sha, dirty: [路徑] }；after：跑完後 git status --short 的行。 */
export function renderSummary({ prefix, head, at, steps, after }) {
  const tree = head.dirty.length ? `未提交的變動 ${head.dirty.length} 個：${head.dirty.join('、')}` : '工作樹乾淨';
  const { text, exitCode } = conclusion(steps);
  const lines = [`前綴 ${prefix}；HEAD ${head.sha}（${tree}）${at}`, `結論：${text}`, ...steps.flatMap(stepLines),
    `跑完後 git status：${after.length ? after.join('、') : '乾淨'}`];
  return { text: lines.join('\n') + '\n', exitCode };
}

/** Node 那三步的判定：結束碼非 0、讀不到摘要、fail 或 cancelled 大於 0 都算失敗。 */
export function nodeStep(base, { code, stdout, stderr, timedOut }) {
  if (timedOut) return { ...base, timedOut: true, failed: true };
  const text = `${stdout}\n${stderr}`;
  const counts = nodeSummary(text);
  const summary = counts && NODE_KEYS.map(k => `${k} ${counts[k]}`).join(' ');
  return { ...base, exit: code, summary, tests: skippedTests(text), failed: code !== 0 || !counts || counts.fail > 0 || counts.cancelled > 0 };
}

// ---------------------------------------------------------------------------
// 讀寫層：找執行檔、開子行程、寫檔、備份與還原。exec 由參數注入，整合測試換成假的執行器
// ---------------------------------------------------------------------------

/** 在 PATH 上找執行檔（不開 shell）。 */
export function which(name, env = process.env) {
  for (const dir of (env.PATH || '').split(delimiter)) {
    if (dir && existsSync(join(dir, name))) return join(dir, name);
  }
  return null;
}

const defaultExec = ({ command, args, timeoutSeconds }) => runWithTimeout({ command, args, stderr: true, timeoutSeconds });

// 工作樹狀態：git status --porcelain=v1 -z 的每一筆，加上檔案內容的雜湊（只比狀態碼的話，重建改了已修改檔的內容會抓不到）
async function treeState(root, exec) {
  const { stdout } = await exec({ command: 'git', args: ['status', '--porcelain=v1', '-z', '--untracked-files=all'] }).result;
  const parts = stdout.split('\0').filter(Boolean);
  const state = {};
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].slice(0, 2), path = parts[i].slice(3);
    if (code.includes('R') || code.includes('C')) i++;   // 改名的下一筆是舊路徑
    const file = join(root, path);
    const hash = existsSync(file) && statSync(file).isFile() ? createHash('sha1').update(readFileSync(file)).digest('hex') : 'missing';
    state[path] = `${code}:${hash}`;
  }
  return state;
}

/**
 * 跑全套檢查，回傳結束碼。deps：{ root, exec, env, now, log }（預設是真的）。
 * signals：CLI 用；為真時 Ctrl+C／SIGTERM 結束目前那一步、還原 --browser 的備份，不寫摘要檔。
 */
export async function fullCheck(argv, { root = process.cwd(), exec = defaultExec, env = process.env, now = () => new Date(), log = console.log, signals = false } = {}) {
  const opts = parseArgs(argv);
  if (opts.error) { console.error(`${opts.error}\n${USAGE}`); return 2; }
  const node22Given = opts.node22 && (isAbsolute(opts.node22) ? opts.node22 : join(root, opts.node22));
  if (node22Given && !existsSync(node22Given)) { console.error(`--node22 指的檔案不存在：${opts.node22}\n${USAGE}`); return 2; }

  const outAbs = isAbsolute(opts.out) ? opts.out : join(root, opts.out);
  mkdirSync(dirname(outAbs), { recursive: true });
  const prefixAbs = nextPrefix(outAbs, readdirSync(dirname(outAbs)));
  const prefix = relative(root, prefixAbs).split('\\').join('/');
  log(`前綴 ${prefix}`);

  let current = null;          // 目前那一步的 { kill }
  let restoreBrowser = null;   // --browser 那一步的還原函式
  if (signals) {
    const stop = (signal) => {
      if (current) current.kill();
      if (restoreBrowser) restoreBrowser();
      console.error(`中斷（${signal}）：不寫摘要檔；已寫出的 log 留在 ${prefix}-*.log`);
      process.exit(130);
    };
    process.once('SIGINT', () => stop('SIGINT'));
    process.once('SIGTERM', () => stop('SIGTERM'));
  }
  const run = async (key, command, args) => {
    const handle = exec({ command, args, timeoutSeconds: opts.timeout });
    current = handle;
    const r = await handle.result;
    current = null;
    writeFileSync(`${prefixAbs}-${key}.log`, `$ ${[command, ...args].join(' ')}\n${r.stdout}${r.stderr ? `\n--- stderr ---\n${r.stderr}` : ''}`);
    return r;
  };
  const version = async (command, args = ['--version']) => (await exec({ command, args }).result).stdout.trim().replace(/^Python /, '');

  const head = { sha: (await exec({ command: 'git', args: ['rev-parse', '--short', 'HEAD'] }).result).stdout.trim(), dirty: [] };
  head.dirty = Object.keys(await treeState(root, exec));
  const at = now().toISOString();
  const tests = readdirSync(join(root, 'scripts')).filter(f => f.endsWith('.test.mjs')).sort().map(f => `scripts/${f}`);
  const steps = [];
  const record = (step) => { steps.push(step); for (const line of stepLines(step)) log(line); };
  const timeoutStep = (base) => ({ ...base, timedOut: true, seconds: opts.timeout, failed: true });

  // 1. 本機 node
  const nodeBin = process.execPath;
  {
    const base = { name: 'node', label: `node ${await version(nodeBin)}` };
    const r = await run('node', nodeBin, ['--test', ...tests]);
    record(r.timedOut ? timeoutStep(base) : nodeStep(base, r));
  }
  // 2. Node 22：--node22，沒給就找 scratch/node22/node-v22.*/bin/node 裡最新的
  {
    const dir = join(root, 'scratch', 'node22');
    const found = node22Given || (existsSync(dir) && latestNode22(readdirSync(dir)) && join(dir, latestNode22(readdirSync(dir)), 'bin', 'node'));
    if (!found || !existsSync(found)) {
      record({ name: 'node 22', label: 'node 22', skipped: '找不到；用 --node22 指定，或照 docs/agents/workflow.md 下載到 scratch/node22/', failed: false });
    } else {
      const base = { name: 'node 22', label: `node ${await version(found)}（${relative(root, found).split('\\').join('/')}）` };
      const r = await run('node22', found, ['--test', ...tests]);
      record(r.timedOut ? timeoutStep(base) : nodeStep(base, r));
    }
  }
  // 3. node.exe（Windows）：測試檔清單由這裡列出、傳相對路徑，不靠 shell 展開 glob
  const nodeExe = which('node.exe', env);
  if (!nodeExe) record({ name: 'node.exe', label: 'node.exe', skipped: '找不到；PATH 上沒有 node.exe（在 WSL 執行，或把 Windows 的 Node 加進 PATH）', failed: false });
  else {
    const base = { name: 'node.exe', label: `node.exe ${await version(nodeExe)}（Windows）` };
    const r = await run('node-exe', nodeExe, ['--test', ...tests]);
    record(r.timedOut ? timeoutStep(base) : nodeStep(base, r));
  }
  // 4. Python
  const python = which('python3', env);
  if (!python) record({ name: 'python', label: 'python', skipped: '找不到；PATH 上沒有 python3', failed: false });
  else {
    const base = { name: 'python', label: `python ${await version(python)}` };
    const r = await run('python', python, ['-m', 'unittest', 'discover', '-s', 'tests/python']);
    if (r.timedOut) record(timeoutStep(base));
    else {
      const s = unittestSummary(`${r.stdout}\n${r.stderr}`);
      record({ ...base, exit: r.code, summary: s && s.text, failed: r.code !== 0 || !s || !s.ok });
    }
  }
  // 5. verify --static
  {
    const base = { name: 'verify --static', label: 'verify --static' };
    const r = await run('verify-static', nodeBin, ['scripts/verify.mjs', '--static']);
    if (r.timedOut) record(timeoutStep(base));
    else {
      const s = verifySummary(`${r.stdout}\n${r.stderr}`);
      record({ ...base, exit: r.code, summary: s && s.text, failed: r.code !== 0 || !s || !s.ok });
    }
  }
  // 6. --browser：node.exe 跑完整模式；先備份報告與截圖，跑完還原（截圖一律還原；報告只差執行時間就還原）
  if (opts.browser) {
    const base = { name: 'verify（完整）', label: 'verify（完整）' };
    if (!nodeExe) record({ ...base, skipped: '找不到 node.exe', failed: false });
    else {
      const backup = `${prefixAbs}-browser-backup`;
      const report = join(root, 'verify-report.md'), shots = join(root, 'verify-screenshots');
      mkdirSync(backup, { recursive: true });
      cpSync(report, join(backup, 'verify-report.md'));
      cpSync(shots, join(backup, 'verify-screenshots'), { recursive: true });
      const restoreShots = () => { rmSync(shots, { recursive: true, force: true }); cpSync(join(backup, 'verify-screenshots'), shots, { recursive: true }); };
      restoreBrowser = () => { restoreShots(); cpSync(join(backup, 'verify-report.md'), report); };
      const r = await run('browser', nodeExe, ['scripts/verify.mjs']);
      restoreBrowser = null;
      restoreShots();
      const notes = [];
      if (sameReportIgnoringRunTime(readFileSync(report, 'utf8'), readFileSync(join(backup, 'verify-report.md'), 'utf8'))) cpSync(join(backup, 'verify-report.md'), report);
      else notes.push('報告有變：要提交並重建');
      if (r.timedOut) record(timeoutStep(base));
      else {
        const s = verifySummary(`${r.stdout}\n${r.stderr}`);
        record({ ...base, exit: r.code, summary: s && s.text, notes, failed: r.code !== 0 || !s });
      }
    }
  }
  // 7. 重建：前後各記一次工作樹狀態，相同才算通過；改出來的檔案不還原
  {
    const base = { name: '重建', label: '重建' };
    const before = await treeState(root, exec);
    const r = await run('build', nodeBin, ['scripts/build-data.mjs']);
    if (r.timedOut) record(timeoutStep(base));
    else {
      const changed = changedPaths(before, await treeState(root, exec));
      record({ ...base, exit: r.code, summary: r.stdout.trim().split('\n')[0] || '（沒有輸出）', notes: changed.length ? [`改到：${changed.join('、')}`] : [], failed: r.code !== 0 || changed.length > 0 });
    }
  }

  const after = (await exec({ command: 'git', args: ['status', '--short'] }).result).stdout.split('\n').filter(Boolean);
  const { text, exitCode } = renderSummary({ prefix, head, at, steps, after });
  writeFileSync(`${prefixAbs}.txt`, text);
  log(text.split('\n')[1]);
  log(`摘要：${prefix}.txt`);
  return exitCode;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.platform === 'win32') {
    console.error('full-check.mjs 只支援 Linux／macOS：請在 WSL 的 bash 執行（node.exe 由 WSL 的 PATH 呼叫）');
    process.exit(2);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  process.chdir(root);   // runWithTimeout 在目前目錄開子行程
  process.exitCode = await fullCheck(process.argv.slice(2), { root, signals: true });
}
