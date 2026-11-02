// stamp-last-updated.test.mjs — 部署時寫入最後更新時間的測試
// 最後更新時間的寫入（scripts/stamp-last-updated.mjs）：部署時 pages.yml 把 HEAD commit 的時間寫進 _site/index.html
// 預留的 <meta name="last-updated" content="">；repo 裡提交的 index.html 永遠是空的。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stampLastUpdated } from './stamp-last-updated.mjs';

const STAMP = fileURLToPath(new URL('./stamp-last-updated.mjs', import.meta.url));

const HTML = '<head>\n  <meta charset="utf-8">\n  <meta name="last-updated" content="">\n  <title>t</title>\n</head>\n';

test('把空的 last-updated 填上時間，其餘逐字不變', () => {
  assert.equal(stampLastUpdated(HTML, '2026-10-18T06:32:05+00:00'),
    '<head>\n  <meta charset="utf-8">\n  <meta name="last-updated" content="2026-10-18T06:32:05+00:00">\n  <title>t</title>\n</head>\n');
});

test('找不到空的 last-updated：丟錯（不默默回傳沒有時間的網站）', () => {
  assert.throws(() => stampLastUpdated('<head>\n  <title>t</title>\n</head>\n', '2026-10-18T06:32:05+00:00'), /找不到/);
});

test('不只一個空的 last-updated：丟錯（不知道該填哪一個）', () => {
  const twice = HTML.replace('<title>', '<meta name="last-updated" content="">\n  <title>');
  assert.throws(() => stampLastUpdated(twice, '2026-10-18T06:32:05+00:00'), /不只一個/);
});

test('時間不是 git log --format=%cI 的格式或不是真的日期：丟錯', () => {
  for (const bad of ['', 'yesterday', '2026-10-18', '2026-13-01T00:00:00+00:00', '2026-02-30T00:00:00+00:00', '2026-10-18T24:00:00+00:00',
    '2026-10-18T06:32:05+15:00', '2026-10-18T06:32:05+08:60',
    '2026-10-18T06:32:05+00:00"><script>alert(1)</script>']) {
    assert.throws(() => stampLastUpdated(HTML, bad), /時間/, `應該拒絕：${bad}`);
  }
});

test('CLI：成功時結束碼 0、檔案已寫入；時間不合法、找不到 meta 或少了參數時結束碼非 0，檔案不變', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stamp-test-'));
  const file = join(dir, 'index.html');
  const run = (...args) => spawnSync(process.execPath, [STAMP, ...args], { encoding: 'utf8' });
  try {
    writeFileSync(file, HTML);
    for (const [label, args, message] of [['時間不合法', [file, 'yesterday'], /時間/], ['少了時間', [file], /用法/], ['沒有參數', [], /用法/]]) {
      const r = run(...args);
      assert.notEqual(r.status, 0, label);
      assert.match(r.stderr, message, label);
      assert.equal(readFileSync(file, 'utf8'), HTML, label);
    }
    writeFileSync(file, '<head></head>\n');
    assert.notEqual(run(file, '2026-10-18T06:32:05+00:00').status, 0, '找不到 meta');
    assert.equal(readFileSync(file, 'utf8'), '<head></head>\n');
    writeFileSync(file, HTML);
    const ok = run(file, '2026-10-18T06:32:05+00:00');
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(readFileSync(file, 'utf8'), /<meta name="last-updated" content="2026-10-18T06:32:05\+00:00">/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
