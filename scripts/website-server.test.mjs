// website-server.test.mjs — 本機驗證用網站伺服器的單元測試：真的啟動 HTTP 伺服器、送真實請求
// 路徑守門的回歸測試（Host、編碼越界、符號連結、. 開頭、backend/／scratch/、Windows 的 8.3 與無權限目錄）
// 經過一次驗證的生命週期，在 verification-run.test.mjs；這裡只測伺服器本身的基本回應。
// 執行：node --test scripts/website-server.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWebsiteServer, STAMPED_AT } from './website-server.mjs';

test('本機伺服器：/ 是根目錄的 index.html，?stamped 以固定時間填好最後更新時間，找不到的檔案回 404，content-type 依副檔名', async () => {
  const root = mkdtempSync(join(tmpdir(), 'website-server-'));
  writeFileSync(join(root, 'index.html'), '<meta name="last-updated" content="">');
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'styles.css'), 'h1 {}');
  const server = createWebsiteServer(root).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}/`;
    const plain = await fetch(base), stamped = await fetch(`${base}?stamped`), missing = await fetch(`${base}no-such-file.txt`), css = await fetch(`${base}assets/styles.css`);
    assert.match(await plain.text(), /<meta name="last-updated" content="">/);
    assert.match(await stamped.text(), /<meta name="last-updated" content="2026-10-17T16:30:00\+00:00">/);
    assert.equal(missing.status, 404);
    assert.equal(css.headers.get('content-type'), 'text/css');
    assert.equal(STAMPED_AT, '2026-10-17T16:30:00+00:00');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
});
