// verification-run.test.mjs — 驗證例外收尾、產物隔離、錨點與網站路徑邊界的回歸測試
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { runVerification } from './verification-run.mjs';
import { anchorInViewport } from './verification-run.mjs';
import vm from 'node:vm';

test('目錄錨點：捲動須到達可視範圍，不能只因 scrollY 大於零就通過', () => {
  const evaluate = ({ y = 0, top = 200, bottom = 240, height = 40, exists = true, hash = '#/methodology?doc=01-definition#target' } = {}) =>
    vm.runInNewContext(`(${anchorInViewport.toString()})({ id: 'target', documentId: '01-definition' })`, {
      location: { hash }, window: { scrollY: y, innerHeight: 900 },
      document: { getElementById: id => id === 'target' && exists ? { getBoundingClientRect: () => ({ top, bottom, height }) } : null,
        querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 80 }) }) },
    });
  assert.equal(evaluate({ y: 1364 }), true);
  assert.equal(evaluate({ y: 0 }), false);
  assert.equal(evaluate({ y: 8, top: 1555, bottom: 1595 }), false);
  assert.equal(evaluate({ y: 1364, top: 20, bottom: 60 }), false);
  assert.equal(evaluate({ y: 1364, exists: false }), false);
  assert.equal(evaluate({ y: 1364, height: 0 }), false);
  assert.equal(evaluate({ y: 1364, hash: '#/methodology?doc=02-relations#target' }), false);
});

async function project(check) {
  const root = mkdtempSync(join(tmpdir(), 'verification-run-'));
  mkdirSync(join(root, 'verify-screenshots'));
  writeFileSync(join(root, 'verify-screenshots', 'old.png'), 'old image');
  writeFileSync(join(root, 'verify-report.md'), 'old report');
  writeFileSync(join(root, 'index.html'), '<meta name="last-updated" content="">');
  try { await check(root); } finally {
    try { rmSync(root, { recursive: true, force: true }); } catch (error) {
      // 拒絕權限沒還原時刪不掉：先重設整棵樹的 ACL 再刪，仍失敗才拋出。
      if (process.platform !== 'win32') throw error;
      icacls(root, '/reset', '/T', '/C', '/Q');
      rmSync(root, { recursive: true, force: true });
    }
  }
}
const readReport = root => readFileSync(join(root, 'verify-report.md'), 'utf8');
const options = root => ({ root, githubOutput: undefined, log() {}, staticChecks: ok => ok('靜態項目', true),
  browserType: { launch: async () => ({ close: async () => {} }) }, browserChecks: async () => {} });

test('--only 情境模式：不執行靜態檢查、不改寫維護用報告與截圖', () => project(async root => {
  const result = await runVerification({ ...options(root), args: ['--only', '導覽'],
    staticChecks: () => { throw new Error('不應執行靜態檢查'); },
    browserChecks: ({ ok, shots }) => {
      ok('指定情境', true);
      writeFileSync(join(shots, 'partial.png'), 'partial');
    } });
  assert.equal(result.exitCode, 0);
  assert.equal(readReport(root), 'old report');
  assert.deepEqual(readdirSync(join(root, 'verify-screenshots')), ['old.png']);
  assert.equal(readFileSync(join(result.runDir, 'verify-screenshots', 'partial.png'), 'utf8'), 'partial');
}));

test('網站檔案邊界：拒絕編碼越界與符號連結逃逸，仍可讀取一般檔案', () => project(async root => {
  const outside = mkdtempSync(root + '-outside-');
  writeFileSync(join(outside, 'canary.txt'), 'OUTSIDE_ROOT_CANARY');
  mkdirSync(join(root, 'public'));
  writeFileSync(join(root, 'public', '正常檔案.txt'), 'public content');
  symlinkSync(outside, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  const request = (base, path) => new Promise((resolve, reject) => {
    const req = get({ hostname: '127.0.0.1', port: new URL(base).port, path }, res => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
  });
  try {
    const result = await runVerification({ ...options(root), browserChecks: async ({ base }) => {
      const sibling = outside.slice(root.lastIndexOf(process.platform === 'win32' ? '\\' : '/') + 1);
      for (const path of [`/%2e%2e/${sibling}/canary.txt`, `/..%5c${sibling}%5ccanary.txt`, '/escape/canary.txt']) {
        const response = await request(base, path);
        assert.equal(response.status, 403, path);
        assert.doesNotMatch(response.body, /OUTSIDE_ROOT_CANARY/, path);
      }
      assert.deepEqual(await request(base, '/public/' + encodeURIComponent('正常檔案.txt')), { status: 200, body: 'public content' });
      assert.equal((await request(base, '/missing.txt')).status, 404);
      assert.equal((await request(base, '/')).status, 200);
    } });
    assert.equal(result.exitCode, 0, readReport(root));
  } finally { rmSync(outside, { recursive: true, force: true }); }
}));

test('啟動失敗：取代舊報告、保留已完成項目、輸出本次 CI 目錄且不夾帶舊圖', () => project(async root => {
  const output = join(root, 'github-output');
  const result = await runVerification({ ...options(root), githubOutput: output,
    browserType: { launch: async () => { throw new Error('launch failed'); } } });
  assert.equal(result.exitCode, 1);
  assert.equal(result.incomplete, true);
  assert.match(readReport(root), /狀態：未完成/);
  assert.match(readReport(root), /靜態項目.*✅/);
  assert.match(readReport(root), /啟動瀏覽器.*launch failed/);
  assert.equal(readFileSync(join(result.runDir, 'verify-report.md'), 'utf8'), readReport(root));
  assert.deepEqual(readdirSync(join(result.runDir, 'verify-screenshots')), []);
  assert.equal(readFileSync(output, 'utf8'), `run-directory=${result.runDir}\n`);
}));

test('中途例外與清理失敗同時保留；伺服器仍會關閉，舊截圖不更新', () => project(async root => {
  let base, closed = false;
  const result = await runVerification({ ...options(root),
    browserType: { launch: async () => ({ close: async () => { closed = true; throw new Error('close failed'); } }) },
    browserChecks: async context => {
      base = context.base;
      assert.equal((await fetch(base)).status, 200);
      context.ok('已完成檢查', true);
      writeFileSync(join(context.shots, 'partial.png'), 'partial image');
      throw new Error('page failed\nwith | detail');
    } });
  assert.equal(closed, true);
  assert.equal(result.exitCode, 1);
  assert.match(readReport(root), /瀏覽器檢查.*page failed with \/ detail/);
  assert.match(readReport(root), /清理：瀏覽器.*close failed/);
  await assert.rejects(fetch(base));
  assert.deepEqual(readdirSync(join(root, 'verify-screenshots')), ['old.png']);
  assert.deepEqual(readdirSync(join(result.runDir, 'verify-screenshots')), ['partial.png']);
}));

test('一般 FAIL 繼續執行，回傳失敗並保留本次截圖，維護用截圖不變', () => project(async root => {
  const result = await runVerification({ ...options(root), browserChecks: async ({ ok, shots }) => {
    ok('失敗檢查', false); ok('後續檢查', true);
    writeFileSync(join(shots, 'current.png'), 'current');
  } });
  assert.equal(result.exitCode, 1);
  assert.equal(result.incomplete, false);
  assert.match(readReport(root), /後續檢查.*✅/);
  assert.doesNotMatch(readReport(root), /未完成/);
  assert.deepEqual(readdirSync(join(root, 'verify-screenshots')), ['old.png']);
}));

test('全部通過：釋放資源、更新維護用截圖；每次目錄獨立', () => project(async root => {
  let base;
  const run = () => runVerification({ ...options(root), browserChecks: async context => {
    base = context.base;
    const response = await fetch(base + '?stamped');
    assert.match(await response.text(), /2026-10-17T16:30:00\+00:00/);
    context.ok('瀏覽器檢查', true);
    writeFileSync(join(context.shots, 'current.png'), 'current');
  } });
  const first = await run(); const second = await run();
  assert.equal(first.exitCode, 0);
  assert.notEqual(first.runDir, second.runDir);
  assert.equal(readFileSync(join(root, 'verify-screenshots', 'current.png'), 'utf8'), 'current');
  assert.deepEqual(readdirSync(join(first.runDir, 'verify-screenshots')), ['current.png']);
  assert.doesNotMatch(readReport(root), /未完成/);
  await assert.rejects(fetch(base));
}));

test('清理逾時也完成報告與伺服器關閉', () => project(async root => {
  let base;
  const result = await runVerification({ ...options(root), cleanupTimeout: 20,
    browserType: { launch: async () => ({ close: () => new Promise(() => {}) }) },
    browserChecks: context => { base = context.base; } });
  assert.equal(result.exitCode, 1);
  assert.match(readReport(root), /清理：瀏覽器.*資源關閉逾時/);
  await assert.rejects(fetch(base));
}));

test('靜態例外：靜態模式保留報告且不建目錄；完整模式仍產生本次未完成報告', () => project(async root => {
  const config = { ...options(root), staticChecks: () => { throw new Error('static failed'); } };
  const staticResult = await runVerification({ ...config, args: ['--static'] });
  assert.equal(staticResult.exitCode, 1);
  assert.equal(staticResult.runDir, undefined);
  assert.equal(readReport(root), 'old report');
  const fullResult = await runVerification(config);
  assert.equal(fullResult.exitCode, 1);
  assert.match(readReport(root), /靜態檢查.*static failed/);
}));

test('連結檢查例外也收尾並保留失敗原因', () => project(async root => {
  const result = await runVerification({ ...options(root), args: ['--links'],
    linkChecks: () => { throw new Error('links failed'); } });
  assert.equal(result.exitCode, 1);
  assert.match(readReport(root), /連結檢查.*links failed/);
}));

test('網站檔案讀取例外會停止執行，不再進行連結檢查並關閉資源', () => project(async root => {
  let base, closed = false, linked = false;
  const result = await runVerification({ ...options(root), args: ['--links'],
    browserType: { launch: async () => ({ close: async () => { closed = true; } }) },
    browserChecks: async context => {
      base = context.base;
      await fetch(base + '%E0%A4%A'); // decodeURIComponent 會拋錯
      await new Promise(() => {}); // 若未傳回致命錯誤，這次執行便無法完成。
    }, linkChecks: () => { linked = true; } });
  assert.equal(result.exitCode, 1);
  assert.equal(closed, true);
  assert.equal(linked, false);
  assert.match(readReport(root), /提供網站檔案.*URI malformed/);
  await assert.rejects(fetch(base));
}));

test('網站例外後晚到的檢查結果不再列入報告或結果陣列', () => project(async root => {
  let release, completed;
  const waiting = new Promise(resolve => { release = resolve; });
  const result = await runVerification({ ...options(root), browserChecks: context => {
    completed = (async () => {
      await fetch(context.base + '%E0%A4%A').catch(() => {});
      await waiting;
      context.ok('晚到的結果', true);
    })();
    return completed;
  } });
  const count = result.results.length;
  const report = readReport(root);
  release(); await completed;
  assert.equal(result.exitCode, 1);
  assert.equal(result.results.length, count);
  assert.doesNotMatch(report, /晚到的結果/);
  assert.equal(readReport(root), report);
}));

// 對本機驗證伺服器送原始請求；headers 可覆寫 Host，模擬 DNS rebinding 帶來的外部網域。
const requestServer = (base, path, headers = {}) => new Promise((resolve, reject) => {
  const req = get({ hostname: '127.0.0.1', port: new URL(base).port, path, headers }, res => {
    let body = ''; res.setEncoding('utf8');
    res.on('data', chunk => { body += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.on('error', reject);
});

test('網站 Host 守門：只回應 127.0.0.1 與 localhost，外部網域（DNS rebinding）回 403', () => project(async root => {
  writeFileSync(join(root, 'page.txt'), 'PAGE_CONTENT');
  const result = await runVerification({ ...options(root), browserChecks: async ({ base }) => {
    const port = new URL(base).port;
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, `LOCALHOST:${port}`]) {
      assert.deepEqual(await requestServer(base, '/page.txt', { host }), { status: 200, body: 'PAGE_CONTENT' }, host);
    }
    for (const host of [`attacker.example:${port}`, 'attacker.example', `127.0.0.1.attacker.example:${port}`, `localhost:${Number(port) + 1}`, `127.0.0.1`]) {
      const response = await requestServer(base, '/page.txt', { host });
      assert.equal(response.status, 403, host);
      assert.doesNotMatch(response.body, /PAGE_CONTENT/, host);
    }
  } });
  assert.equal(result.exitCode, 0, readReport(root));
}));

test('網站隱藏路徑：以 . 開頭的路徑段（.git、.env）回 403，一般檔名中的點仍可讀取', () => project(async root => {
  mkdirSync(join(root, '.git')); writeFileSync(join(root, '.git', 'config'), 'HIDDEN_SECRET');
  writeFileSync(join(root, '.env'), 'HIDDEN_SECRET');
  mkdirSync(join(root, 'data')); writeFileSync(join(root, 'data', '.secret'), 'HIDDEN_SECRET');
  writeFileSync(join(root, 'data', 'a.b.txt'), 'DOTTED_NAME');
  const result = await runVerification({ ...options(root), browserChecks: async ({ base }) => {
    const host = new URL(base).host;
    for (const path of ['/.git/config', '/.env', '/data/.secret', '/%2egit/config', '/data/%2Esecret', '/data/..%2f.env', '/.GIT/config']) {
      const response = await requestServer(base, path, { host });
      assert.equal(response.status, 403, path);
      assert.doesNotMatch(response.body, /HIDDEN_SECRET/, path);
    }
    assert.deepEqual(await requestServer(base, '/data/a.b.txt', { host }), { status: 200, body: 'DOTTED_NAME' });
  } });
  assert.equal(result.exitCode, 0, readReport(root));
}));

test('網站私有目錄：backend/ 與 scratch/ 回 403，含大小寫、尾端點、.. 與連結繞道', () => project(async root => {
  for (const dir of ['backend', 'scratch']) { mkdirSync(join(root, dir)); writeFileSync(join(root, dir, 'secret.txt'), 'PRIVATE_DIR_SECRET'); }
  mkdirSync(join(root, 'data')); writeFileSync(join(root, 'data', 'backend-notes.txt'), 'PUBLIC_NOTES');
  symlinkSync(join(root, 'backend'), join(root, 'data', 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = await runVerification({ ...options(root), browserChecks: async ({ base }) => {
    const host = new URL(base).host;
    for (const path of ['/backend/secret.txt', '/scratch/secret.txt', '/Backend/secret.txt', '/SCRATCH/secret.txt',
      '/backend./secret.txt', '/backend%20/secret.txt', '/data/%2e%2e/backend/secret.txt', '/data/alias/secret.txt', '/backend/']) {
      const response = await requestServer(base, path, { host });
      assert.equal(response.status, 403, path);
      assert.doesNotMatch(response.body, /PRIVATE_DIR_SECRET/, path);
    }
    assert.deepEqual(await requestServer(base, '/data/backend-notes.txt', { host }), { status: 200, body: 'PUBLIC_NOTES' });
  } });
  assert.equal(result.exitCode, 0, readReport(root));
}));

test('網站私有目錄（Windows）：NTFS 目錄串流後綴 ::$INDEX_ALLOCATION 不能繞過 backend/ 與 scratch/', { skip: process.platform !== 'win32' && '只有 NTFS 會把目錄串流當成目錄本身' }, () => project(async root => {
  for (const dir of ['backend', 'scratch']) { mkdirSync(join(root, dir)); writeFileSync(join(root, dir, 'secret.txt'), 'PRIVATE_DIR_SECRET'); }
  const result = await runVerification({ ...options(root), browserChecks: async ({ base }) => {
    const host = new URL(base).host;
    for (const path of ['/backend::$INDEX_ALLOCATION/secret.txt', '/backend:$I30:$INDEX_ALLOCATION/secret.txt',
      '/scratch::$INDEX_ALLOCATION/secret.txt', '/backend%3a%3a$INDEX_ALLOCATION/secret.txt', '/BACKEND::$index_allocation/secret.txt']) {
      const response = await requestServer(base, path, { host });
      assert.equal(response.status, 403, path);
      assert.doesNotMatch(response.body, /PRIVATE_DIR_SECRET/, path);
    }
  } });
  assert.equal(result.exitCode, 0, readReport(root));
}));

test('網站隱藏路徑（Windows）：8.3 短檔名（GIT~1）不能繞過以 . 開頭的路徑段', t => project(async root => {
  mkdirSync(join(root, '.git')); writeFileSync(join(root, '.git', 'config'), 'HIDDEN_SECRET');
  // 短檔名由磁碟區設定決定；沒有產生時無法重現這種繞道。
  if (process.platform !== 'win32' || !existsSync(join(root, 'GIT~1', 'config'))) { t.skip('此磁碟區沒有 8.3 短檔名'); return; }
  const result = await runVerification({ ...options(root), browserChecks: async ({ base }) => {
    const host = new URL(base).host;
    for (const path of ['/GIT~1/config', '/git~1/config']) {
      const response = await requestServer(base, path, { host });
      assert.equal(response.status, 403, path);
      assert.doesNotMatch(response.body, /HIDDEN_SECRET/, path);
    }
  } });
  assert.equal(result.exitCode, 0, readReport(root));
}));

test('網站無權限目錄（Windows）：拒絕讀取的目錄回 403，不視為伺服器錯誤、不中斷驗證', { skip: process.platform !== 'win32' && '用 icacls 設定 Windows 拒絕權限' }, () => project(async root => {
  const locked = join(root, 'locked');
  mkdirSync(locked); writeFileSync(join(root, 'page.txt'), 'PAGE_CONTENT');
  const restore = denyRead(locked);
  try {
    const result = await runVerification({ ...options(root), browserChecks: async ({ base, ok }) => {
      const host = new URL(base).host;
      assert.equal((await requestServer(base, '/locked', { host })).status, 403);
      assert.deepEqual(await requestServer(base, '/page.txt', { host }), { status: 200, body: 'PAGE_CONTENT' });
      ok('無權限路徑之後的檢查', true);
    } });
    assert.equal(result.exitCode, 0, readReport(root));
    assert.match(readReport(root), /無權限路徑之後的檢查/);
    assert.doesNotMatch(readReport(root), /執行中斷|提供網站檔案/);
  } finally { restore(); }
}));

// whoami、icacls 用 System32 的完整路徑：Git Bash 的 PATH 會先找到 coreutils 的 whoami。
const system32 = () => join(process.env.SystemRoot, 'System32');

// 失敗時把結束碼與 icacls 的輸出帶進錯誤訊息（以 UTF-8 解碼；在地化語系的輸出可能顯示為亂碼）。
function icacls(...args) {
  try { execFileSync(join(system32(), 'icacls.exe'), args, { stdio: 'pipe', encoding: 'utf8' }); } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || ''}`.trim();
    throw new Error(`icacls ${args.join(' ')} 失敗（結束碼 ${error.status}）${output ? '：' + output : ''}`);
  }
}

// whoami /user /fo csv /nh 只輸出一行「"網域\帳號","SID"」；不符就丟錯，不拿解析殘片去設定權限。
function currentUserSid() {
  const output = execFileSync(join(system32(), 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' });
  const match = /^"[^"]*","(S-1-\d+(?:-\d+)+)"$/.exec(output.trim());
  if (!match) throw new Error(`whoami 輸出無法解析：${JSON.stringify(output)}`);
  return match[1];
}

// 以 SID 拒絕目前使用者讀取（不靠帳號名稱解析）；回傳的還原函式不拋錯，避免蓋掉原本的斷言錯誤，
// 還原失敗留下的拒絕權限由 project() 清理時重設。
function denyRead(path) {
  const sid = currentUserSid();
  icacls(path, '/deny', `*${sid}:(R)`);
  return () => { try { icacls(path, '/remove:d', `*${sid}`); } catch {} };
}

test('網站無權限檔案（Windows）：拒絕讀取的檔案仍視為伺服器錯誤，中斷驗證並保留原因', { skip: process.platform !== 'win32' && '用 icacls 設定 Windows 拒絕權限' }, () => project(async root => {
  writeFileSync(join(root, 'locked.txt'), 'LOCKED_CONTENT');
  const restore = denyRead(join(root, 'locked.txt'));
  try {
    const result = await runVerification({ ...options(root), browserChecks: async ({ base }) => {
      const response = await requestServer(base, '/locked.txt', { host: new URL(base).host });
      assert.equal(response.status, 500);
      assert.doesNotMatch(response.body, /LOCKED_CONTENT/);
    } });
    assert.equal(result.exitCode, 1);
    assert.match(readReport(root), /執行中斷：瀏覽器檢查.*提供網站檔案：EPERM/);
  } finally { restore(); }
}));
