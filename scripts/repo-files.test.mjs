// repo-files.test.mjs — 讀 repo 檔案的共用工具（scripts/repo-files.mjs）的單元測試
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { handwrittenTextFiles, ignoreMatcher } from './repo-files.mjs';

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};
// 暫存的 git repo：tracked 的檔案 git add（不必 commit，git ls-files 看的是 index），untracked 的只寫進工作樹；
// root 一律有 .ignore（ignore 是它的內容），跟本 repo 一樣
function fixture({ tracked, untracked = [], ignore = '' }) {
  const repo = mkdtempSync(join(tmpdir(), 'repo-files-'));
  writeFileSync(join(repo, '.ignore'), ignore);
  for (const path of [...tracked, ...untracked]) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), 'x\n');
  }
  git(repo, 'init', '-q');
  git(repo, 'add', '--', '.ignore', ...tracked);
  return repo;
}

test('handwrittenTextFiles：只列出 git 追蹤中、副檔名是 md／mjs／js／py／yml／json／html 的檔案，路徑相對於 root、用 /', (t) => {
  const repo = fixture({
    tracked: ['README.md', 'scripts/a.mjs', 'assets/b.js', 'tests/c.py', '.github/workflows/ci.yml', 'data/d.json', 'index.html',
              'verify-screenshots/e.png', 'LICENSE', 'docs/f.txt', 'g.yaml'],
    untracked: ['scratch/h.md']
  });
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  assert.deepEqual(handwrittenTextFiles(repo).sort(),
    ['.github/workflows/ci.yml', 'README.md', 'assets/b.js', 'data/d.json', 'index.html', 'scripts/a.mjs', 'tests/c.py']);
});

test('handwrittenTextFiles：略過 root 的 .ignore 排除的建置產物', (t) => {
  const repo = fixture({
    tracked: ['data/case.js', 'data/process.js', 'downloads/a/b.json', 'skills/glm/x/references/r.md', 'skills/glm/y/references/r.md'],
    ignore: '# 建置產物\n\ndata/case.js\ndownloads/\nskills/*/x/references/\n'
  });
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  assert.deepEqual(handwrittenTextFiles(repo).sort(), ['data/process.js', 'skills/glm/y/references/r.md']);
});

// 目錄裡沒有 .ignore：先檢查 git ls-files，錯誤訊息才會指出真正的原因（不在 git repo 裡），而不是讀不到 .ignore
test('handwrittenTextFiles：git ls-files 失敗時（不是 git repo）丟出錯誤，訊息寫出 git ls-files 與 git 的 stderr，不回傳空清單', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'repo-files-no-git-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'README.md'), 'x\n');
  assert.throws(() => handwrittenTextFiles(dir), (e) => /git ls-files/.test(e.message) && /fatal:/.test(e.message));
});

test('handwrittenTextFiles：root 結尾有沒有 / 結果都一樣（測試以 fileURLToPath(new URL(\'..\', …)) 傳入，結尾有 /）', (t) => {
  const repo = fixture({ tracked: ['README.md', 'data/case.js'], ignore: 'data/case.js\n' });
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  assert.deepEqual(handwrittenTextFiles(repo + '/'), ['README.md']);
  assert.deepEqual(handwrittenTextFiles(repo), ['README.md']);
});

test('解析 .ignore 的小子集：目錄（結尾斜線）、* 萬用字元（不跨 /）、完整路徑；註解與空行略過', () => {
  const ignored = ignoreMatcher('# 註解\n\ndata/case.js\ndownloads/\nskills/*/x/references/\n');
  for (const path of ['data/case.js', 'downloads/skills-glm.zip', 'downloads/a/b.zip', 'skills/glm/x/references/a.md']) {
    assert.equal(ignored(path), true, path);
  }
  for (const path of ['data/process.js', 'data/case.json', 'mydownloads/a.zip', 'skills/glm/y/references/a.md',
                      'skills/a/b/x/references/a.md', '# 註解']) {
    assert.equal(ignored(path), false, path);
  }
});

test('handwrittenTextFiles：root 沒有 .ignore 時丟出錯誤，不當成沒有排除（否則建置產物會被默默掃進來）', (t) => {
  const repo = fixture({ tracked: ['README.md', 'data/case.js'] });
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  rmSync(join(repo, '.ignore'));
  assert.throws(() => handwrittenTextFiles(repo), { code: 'ENOENT' });
});
