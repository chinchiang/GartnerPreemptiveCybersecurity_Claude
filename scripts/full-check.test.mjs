// full-check.test.mjs — 全套檢查（full-check.mjs）：摘要擷取、前綴遞增、重建前後比對、結論與結束碼的單元測試，以及換成假執行器的整合測試
// 輸出樣本是手寫的字面值：spec、unittest、verify 取自 #139 的 full-3（PR #137 的實際摘要），TAP 的略過取自實際用 Node 22 跑出的輸出。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import {
  nodeSummary, skippedTests, unittestSummary, verifySummary, nextPrefix, changedPaths, latestNode22, parseArgs,
  nodeStep, conclusion, renderSummary, fullCheck, USAGE
} from './full-check.mjs';

const SPEC = 'ℹ tests 264\nℹ suites 0\nℹ pass 263\nℹ fail 0\nℹ cancelled 0\nℹ skipped 1\nℹ todo 0\nℹ duration_ms 52019.12\n';
const TAP = '1..264\n# tests 264\n# suites 0\n# pass 264\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 51000.1\n';

test('nodeSummary：spec（ℹ tests 264）與 TAP（# tests 264）的計數摘要都讀得到', () => {
  assert.deepEqual(nodeSummary(SPEC), { tests: 264, pass: 263, fail: 0, cancelled: 0, skipped: 1, todo: 0 });
  assert.deepEqual(nodeSummary(TAP), { tests: 264, pass: 264, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
});

test('nodeSummary：讀不到任一個計數就是 null（ℹ 後面少了空白、少了 todo 那一行），不當成通過（#138 的回顧）', () => {
  assert.equal(nodeSummary(SPEC.replace(/ℹ /g, 'ℹ')), null);
  assert.equal(nodeSummary(SPEC.replace('ℹ todo 0\n', '')), null);
  assert.equal(nodeSummary(''), null);
});

test('skippedTests：spec 的「﹣ 名稱 (時間) # 原因」與 TAP 的「ok n - 名稱 # SKIP 原因」都列出；TODO 不算略過', () => {
  const spec = '✔ 會通過的 (2.000205ms)\n' +
    '﹣ 跑測試時被中斷（SIGTERM）：檔案仍然還原，測試子行程也結束 (0.5027ms) # Windows 上 SIGTERM 不會觸發訊號處理器，中斷時的還原只保證 Linux／macOS\n' +
    '✔ 還沒寫的 (0.608664ms) # TODO\n';
  assert.deepEqual(skippedTests(spec), ['跑測試時被中斷（SIGTERM）：檔案仍然還原，測試子行程也結束 # Windows 上 SIGTERM 不會觸發訊號處理器，中斷時的還原只保證 Linux／macOS']);
  const tap = '# Subtest: 會通過的\nok 1 - 會通過的\n  ---\n  duration_ms: 4.107292\n  ...\n' +
    '# Subtest: 跑測試時被中斷（SIGTERM）\nok 2 - 跑測試時被中斷（SIGTERM） # SKIP Windows 上 SIGTERM 不會觸發訊號處理器\n' +
    '# Subtest: 還沒寫的\nok 3 - 還沒寫的 # TODO\n';
  assert.deepEqual(skippedTests(tap), ['跑測試時被中斷（SIGTERM） # Windows 上 SIGTERM 不會觸發訊號處理器']);
});

test('unittestSummary：Ran … tests in …s 加上結尾的 OK／FAILED (…)；讀不到任一個就是 null', () => {
  assert.deepEqual(unittestSummary('......\n----------------------------------------------------------------------\nRan 112 tests in 22.975s\n\nOK\n'),
    { text: 'Ran 112 tests in 22.975s OK', ok: true });
  assert.deepEqual(unittestSummary('Ran 112 tests in 22.975s\n\nFAILED (failures=1)\n'), { text: 'Ran 112 tests in 22.975s FAILED (failures=1)', ok: false });
  assert.equal(unittestSummary('Ran 112 tests in 22.975s\n'), null);
  assert.equal(unittestSummary('OK\n'), null);
});

test('verifySummary：靜態與完整模式的「<n>/<m> 通過…」；讀不到就是 null', () => {
  assert.deepEqual(verifySummary('PASS  無 API 金鑰樣式字串\n\n45/45 通過（--static 不寫入 verify-report.md）\n'), { text: '45/45 通過（--static 不寫入 verify-report.md）', ok: true });
  assert.deepEqual(verifySummary('FAIL  x\n\n99/100 通過 → verify-report.md\n本次產物：scratch/verification-runs/run-1\n'), { text: '99/100 通過 → verify-report.md', ok: false });
  assert.equal(verifySummary('PASS  只有逐項結果\n'), null);
});

test('nextPrefix：<前綴>.txt 或任何 <前綴>-*.log 存在就算用掉；結尾數字加 1，沒有數字從 -2 開始', () => {
  assert.equal(nextPrefix(join('d', 'full-3'), ['full-3.txt', 'full-3-node.log']), join('d', 'full-4'));
  assert.equal(nextPrefix(join('d', 'full-3'), ['full-3-node.log']), join('d', 'full-4'));   // 只有 log（中斷時不寫摘要）也算用掉
  assert.equal(nextPrefix(join('d', 'full-3'), ['full-3.txt', 'full-4-node.log']), join('d', 'full-5'));
  assert.equal(nextPrefix(join('d', 'check'), ['check.txt', 'check-2.txt']), join('d', 'check-3'));
  assert.equal(nextPrefix(join('d', 'full-1'), ['full-10.txt', 'full-1-browser-backup']), join('d', 'full-1'));   // full-10 不是 full-1 用掉的
});

test('changedPaths：同一個檔案內容變了也抓得到（狀態碼一樣）；新增與消失的路徑都列，排序後回傳', () => {
  const before = { 'data/a.js': ' M:111', 'data/b.js': ' M:222' };
  assert.deepEqual(changedPaths(before, { 'data/a.js': ' M:111', 'data/b.js': ' M:333', 'data/c.js': '??:444' }), ['data/b.js', 'data/c.js']);
  assert.deepEqual(changedPaths(before, { 'data/a.js': ' M:111' }), ['data/b.js']);
  assert.deepEqual(changedPaths(before, { ...before }), []);
});

test('latestNode22：依版本號比較取最新的（字串比較會把 22.9.0 排在 22.23.4 後面），沒有就是 null', () => {
  assert.equal(latestNode22(['node-v22.9.0-linux-x64', 'node-v22.23.4-linux-x64', 'node-v22.23.3-linux-x64', 'SHASUMS256.txt']), 'node-v22.23.4-linux-x64');
  assert.equal(latestNode22(['node-v24.19.0-linux-x64', 'x.tar.xz']), null);
});

test('parseArgs：--out 必填；不認得的參數、--timeout 不合法、值缺漏都回報錯誤', () => {
  assert.deepEqual(parseArgs(['--out', 'scratch/1/full-1', '--browser', '--node22', 'n', '--timeout', '1.5']), { out: 'scratch/1/full-1', browser: true, node22: 'n', timeout: 1.5 });
  assert.deepEqual(parseArgs(['--browser']), { error: '缺少 --out <前綴>' });
  assert.deepEqual(parseArgs(['--out', 'x', '--json']), { error: '不認得的參數：--json' });
  assert.deepEqual(parseArgs(['--out', 'x', '--timeout', '-1']), { error: '--timeout 要是 0 或正數（秒），收到 -1' });
  assert.deepEqual(parseArgs(['--out']), { error: '--out 後面要接值' });
});

test('nodeStep：結束碼 0 但讀不到摘要算失敗，摘要行寫「讀不到摘要」；fail 或 cancelled 大於 0 也算失敗', () => {
  const base = { name: 'node', label: 'node v24.19.0' };
  const unreadable = nodeStep(base, { code: 0, stdout: SPEC.replace(/ℹ /g, 'ℹ'), stderr: '' });
  assert.equal(unreadable.failed, true);
  assert.deepEqual(renderSummary({ prefix: 'p', head: { sha: 'abc1234', dirty: [] }, at: 'T', steps: [unreadable], after: [] }).text.split('\n')[2], '== node v24.19.0：exit=0；讀不到摘要');
  assert.equal(nodeStep(base, { code: 0, stdout: SPEC.replace('ℹ cancelled 0', 'ℹ cancelled 1'), stderr: '' }).failed, true);
  assert.equal(nodeStep(base, { code: 0, stdout: SPEC, stderr: '' }).failed, false);
});

test('結論與結束碼：全過 0、有略過 3、有失敗 1（同時有失敗與略過時兩種都列，以 1 為準）', () => {
  const ok = (name) => ({ name, label: name, exit: 0, summary: 's', failed: false });
  const six = ['node', 'node 22', 'node.exe', 'python', 'verify --static', '重建'].map(ok);
  assert.deepEqual(conclusion(six), { text: '全過（6/6）', exitCode: 0 });
  const skipped = { name: 'node 22', label: 'node 22', skipped: '找不到', failed: false };
  assert.deepEqual(conclusion([six[0], skipped, ...six.slice(2)]), { text: '有略過：node 22', exitCode: 3 });
  const failed = { ...six[3], failed: true };
  assert.deepEqual(conclusion([six[0], skipped, six[2], failed, ...six.slice(4)]), { text: '有失敗：python；有略過：node 22', exitCode: 1 });
});

test('摘要全文：第一行是前綴、HEAD 與工作樹狀態，第二行結論；略過、逾時、略過的測試、跑完後的 git status 照格式', () => {
  const steps = [
    { name: 'node', label: 'node v24.19.0', exit: 0, summary: 'tests 264 pass 264 fail 0 cancelled 0 skipped 0 todo 0', failed: false },
    { name: 'node 22', label: 'node 22', skipped: '找不到；用 --node22 指定，或照 docs/agents/workflow.md 下載到 scratch/node22/', failed: false },
    { name: 'node.exe', label: 'node.exe v24.19.0（Windows）', exit: 0, summary: 'tests 264 pass 263 fail 0 cancelled 0 skipped 1 todo 0', tests: ['跑測試時被中斷（SIGTERM） # Windows 上不會觸發'], failed: false },
    { name: 'python', label: 'python 3.14.4', timedOut: true, seconds: 1, failed: true },
    { name: '重建', label: '重建', exit: 0, summary: 'wrote 54 files', notes: ['改到：data/guides.js'], failed: true },
  ];
  const { text, exitCode } = renderSummary({ prefix: 'scratch/139/full-4', head: { sha: 'ccb350b', dirty: ['a.md', 'b.md'] }, at: '2026-11-05T00:00:00.000Z', steps, after: [' M data/guides.js'] });
  assert.equal(exitCode, 1);
  assert.equal(text, [
    '前綴 scratch/139/full-4；HEAD ccb350b（未提交的變動 2 個：a.md、b.md）2026-11-05T00:00:00.000Z',
    '結論：有失敗：python、重建；有略過：node 22',
    '== node v24.19.0：exit=0；tests 264 pass 264 fail 0 cancelled 0 skipped 0 todo 0',
    '== node 22：略過（找不到；用 --node22 指定，或照 docs/agents/workflow.md 下載到 scratch/node22/）',
    '== node.exe v24.19.0（Windows）：exit=0；tests 264 pass 263 fail 0 cancelled 0 skipped 1 todo 0',
    '﹣ 跑測試時被中斷（SIGTERM） # Windows 上不會觸發',
    '== python 3.14.4：逾時（1 秒）',
    '== 重建：exit=0；wrote 54 files；改到：data/guides.js',
    '跑完後 git status： M data/guides.js',
  ].join('\n') + '\n');
  assert.equal(renderSummary({ prefix: 'p', head: { sha: 's', dirty: [] }, at: 'T', steps: [], after: [] }).text.split('\n')[0], '前綴 p；HEAD s（工作樹乾淨）T');
});

// ---------- 整合：換成假的執行器，在暫存目錄裡跑整個 fullCheck ----------

// 暫存的 repo：scripts/ 底下有兩支測試檔，bin/ 有 node.exe 與 python3（which 只看檔案在不在），scratch/node22/ 視情況建立
function fakeRepo({ node22 = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'full-check-test-'));
  mkdirSync(join(root, 'scripts'));
  for (const f of ['a.test.mjs', 'b.test.mjs', 'full-check.mjs']) writeFileSync(join(root, 'scripts', f), '');
  mkdirSync(join(root, 'bin'));
  for (const f of ['node.exe', 'python3']) writeFileSync(join(root, 'bin', f), '');
  if (node22) { mkdirSync(join(root, 'scratch', 'node22', 'node-v22.23.4-linux-x64', 'bin'), { recursive: true }); writeFileSync(join(root, 'scratch', 'node22', 'node-v22.23.4-linux-x64', 'bin', 'node'), ''); }
  return root;
}
// 假的執行器：依指令回傳固定的輸出；calls 記下每一次呼叫。build 為真時，重建之後的 git status 多一個檔案
function fakeExec({ timedOut = [], buildChanges = false } = {}) {
  const calls = [];
  let built = false;
  const exec = ({ command, args, timeoutSeconds }) => {
    calls.push({ command, args, timeoutSeconds });
    const ok = (stdout) => ({ result: Promise.resolve({ code: 0, stdout, stderr: '', timedOut: false }), kill() {} });
    const name = command.split(/[\\/]/).pop();
    if (args[0] === '--version') return ok(name === 'python3' ? 'Python 3.14.4\n' : command !== process.execPath && command.includes('node22') ? 'v22.23.4\n' : 'v24.19.0\n');
    if (command === 'git' && args[0] === 'rev-parse') return ok('abc1234\n');
    if (command === 'git' && args[0] === 'status') return ok(built && buildChanges ? (args[1] === '--short' ? ' M data/guides.js\n' : ' M data/guides.js\0') : '');
    // 本機 node 用完整路徑認（在 Windows 上跑這支測試時，process.execPath 本身就叫 node.exe）
    const key = args[0] === '--test' ? (command === process.execPath ? 'node' : command.includes('node22') ? 'node22' : 'node-exe') : name === 'python3' ? 'python' : args.includes('--static') ? 'verify-static' : 'build';
    if (timedOut.includes(key)) return { result: Promise.resolve({ code: null, stdout: '', stderr: '', timedOut: true }), kill() {} };
    if (key === 'build') built = true;
    return ok({ node: SPEC, node22: TAP, 'node-exe': SPEC, python: 'Ran 112 tests in 22.975s\n\nOK\n', 'verify-static': '45/45 通過（--static 不寫入 verify-report.md）\n', build: 'wrote 54 files (data: 6)\n' }[key]);
  };
  return { exec, calls };
}
const silent = () => {};

test('整合：全部通過時結論「全過（6/6）」、結束碼 0；Node 22 自動找 scratch/node22/，三個 Node 環境拿到相同的測試檔清單（相對路徑）', async () => {
  const root = fakeRepo();
  try {
    const { exec, calls } = fakeExec();
    const code = await fullCheck(['--out', 'scratch/139/full-1'], { root, exec, env: { PATH: join(root, 'bin') }, now: () => new Date('2026-11-05T00:00:00Z'), log: silent });
    assert.equal(code, 0);
    const summary = readFileSync(join(root, 'scratch', '139', 'full-1.txt'), 'utf8').split('\n');
    assert.equal(summary[0], '前綴 scratch/139/full-1；HEAD abc1234（工作樹乾淨）2026-11-05T00:00:00.000Z');
    assert.equal(summary[1], '結論：全過（6/6）');
    assert.equal(summary[3], '== node v22.23.4（scratch/node22/node-v22.23.4-linux-x64/bin/node）：exit=0；tests 264 pass 264 fail 0 cancelled 0 skipped 0 todo 0');
    const testRuns = calls.filter(c => c.args[0] === '--test');
    assert.equal(testRuns.length, 3);
    for (const c of testRuns) assert.deepEqual(c.args, ['--test', 'scripts/a.test.mjs', 'scripts/b.test.mjs']);
    assert.deepEqual(readdirSync(join(root, 'scratch', '139')).sort(),
      ['full-1-build.log', 'full-1-node-exe.log', 'full-1-node.log', 'full-1-node22.log', 'full-1-python.log', 'full-1-verify-static.log', 'full-1.txt']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('整合：同一個 --out 連續跑兩次，第二次自動換成下一個號碼，畫面與摘要第一行都是新的前綴', async () => {
  const root = fakeRepo();
  try {
    const opts = { root, exec: fakeExec().exec, env: { PATH: join(root, 'bin') }, log: silent };
    await fullCheck(['--out', 'scratch/139/full-1'], opts);
    const screen = [];
    await fullCheck(['--out', 'scratch/139/full-1'], { ...opts, exec: fakeExec().exec, log: (l) => screen.push(l) });
    assert.equal(screen[0], '前綴 scratch/139/full-2');
    assert.match(readFileSync(join(root, 'scratch', '139', 'full-2.txt'), 'utf8').split('\n')[0], /^前綴 scratch\/139\/full-2；/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('整合：找不到 Node 22 時那一步略過、其他照跑，結束碼 3；--node22 指向不存在的檔案是參數錯誤 2，一步都沒跑', async () => {
  const root = fakeRepo({ node22: false });
  try {
    const { exec, calls } = fakeExec();
    const opts = { root, exec, env: { PATH: join(root, 'bin') }, log: silent };
    assert.equal(await fullCheck(['--out', 'scratch/x/full-1'], opts), 3);
    const summary = readFileSync(join(root, 'scratch', 'x', 'full-1.txt'), 'utf8').split('\n');
    assert.equal(summary[1], '結論：有略過：node 22');
    assert.equal(summary[3], '== node 22：略過（找不到；用 --node22 指定，或照 docs/agents/workflow.md 下載到 scratch/node22/）');
    const before = calls.length;
    const errors = [];
    const realError = console.error;
    console.error = (m) => errors.push(m);
    try { assert.equal(await fullCheck(['--out', 'scratch/x/full-1', '--node22', 'scratch/nope/node'], opts), 2); }
    finally { console.error = realError; }
    assert.equal(calls.length, before, '參數有誤時不應該執行任何指令');
    assert.equal(errors[0], `--node22 指的檔案不存在：scratch/nope/node\n${USAGE}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('整合：逾時算失敗、接著跑下一步；--timeout 傳給每一步；重建改動了工作樹也算失敗並列出路徑', async () => {
  const root = fakeRepo();
  try {
    const { exec, calls } = fakeExec({ timedOut: ['node', 'python'], buildChanges: true });
    const code = await fullCheck(['--out', 'scratch/t/full-1', '--timeout', '1'], { root, exec, env: { PATH: join(root, 'bin') }, log: silent });
    assert.equal(code, 1);
    const summary = readFileSync(join(root, 'scratch', 't', 'full-1.txt'), 'utf8').split('\n');
    assert.equal(summary[1], '結論：有失敗：node、python、重建');
    assert.equal(summary[2], '== node v24.19.0：逾時（1 秒）');
    assert.ok(summary.includes('== 重建：exit=0；wrote 54 files (data: 6)；改到：data/guides.js'), summary.join('\n'));
    assert.equal(summary.at(-2), '跑完後 git status： M data/guides.js');
    for (const c of calls.filter(c => c.args[0] === '--test' || c.args[0] === '-m')) assert.equal(c.timeoutSeconds, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
