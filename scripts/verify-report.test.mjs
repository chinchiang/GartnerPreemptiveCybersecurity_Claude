// verify-report.test.mjs — verify.mjs 的報告檔與報告渲染：verify:static 不改寫 verify-report.md
// verify.mjs 的報告檔：verify:static（本機與 CI 的靜態驗證）只印結果、不改寫已提交的 verify-report.md；
// 只有完整模式（含瀏覽器檢查，CI 的 browser job 會上傳）才寫入。這樣跑完靜態驗證不必再手動還原檔案，
// CI 的生成檔檢查也才能用 git status 檢查整份工作樹。
// 報告的格式由 verify-report.mjs 的 renderReport 渲染（#100）：預期值是手寫的整份 Markdown 字面值。
// 也測 --only 的參數錯誤（名稱打錯、搭配 --static／--links）：它們在啟動瀏覽器之前就以結束碼 2 結束，不需要 playwright。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderReport } from './verify-report.mjs';

const REPORT = fileURLToPath(new URL('../verify-report.md', import.meta.url));
const VERIFY = fileURLToPath(new URL('./verify.mjs', import.meta.url));

test('verify --static 印出檢查結果，但不改寫 verify-report.md', () => {
  const before = { content: readFileSync(REPORT, 'utf8'), mtime: statSync(REPORT).mtimeMs };
  const run = spawnSync(process.execPath, [VERIFY, '--static'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /\d+\/\d+ 通過/);
  assert.equal(readFileSync(REPORT, 'utf8'), before.content);
  assert.equal(statSync(REPORT).mtimeMs, before.mtime);
});

test('renderReport 渲染整份報告：標題、執行時間、模式、通過數，表格的 ✅／❌，說明裡的 | 換成 /', () => {
  const results = [
    { name: '首頁渲染', pass: true, detail: '' },
    { name: '全站搜尋回傳結果', pass: false, detail: '0 筆｜a|b|c' },
    { name: '無 JS 執行錯誤', pass: true, detail: '' },
  ];
  assert.equal(renderReport(results, { mode: 'full', at: '2026-10-22T00:00:00.000Z' }), [
    '# 驗證報告',
    '',
    '執行時間：2026-10-22T00:00:00.000Z',
    '模式：full',
    '結果：2/3 通過',
    '',
    '| 檢查 | 結果 | 說明 |',
    '|---|---|---|',
    '| 首頁渲染 | ✅ |  |',
    '| 全站搜尋回傳結果 | ❌ | 0 筆｜a/b/c |',
    '| 無 JS 執行錯誤 | ✅ |  |',
    '',
  ].join('\n'));
});

// --only 的參數錯誤在啟動瀏覽器之前就以結束碼 2 結束，unit job 不需要 playwright 也能測（#100）
const runVerify = (...args) => spawnSync(process.execPath, [VERIFY, ...args], { encoding: 'utf8' });
const SCENARIO_NAMES = ['導覽', '方法論', '搜尋', 'I/O 篩選', 'Skills', '教學', '案例', '來源頁', '部署頁', '行動裝置', '無障礙', '儲存庫連結', '最後更新時間', '搜尋框與 topbar'];

test('verify --only 名稱打錯：結束碼 2，列出全部 14 個情境名稱，不改寫 verify-report.md', () => {
  const before = readFileSync(REPORT, 'utf8');
  const run = runVerify('--only', '最後更新時間,不存在的情境');
  assert.equal(run.status, 2, run.stdout + run.stderr);
  assert.equal(run.stderr.trim(), `--only 找不到情境：不存在的情境；可用的情境：${SCENARIO_NAMES.join('、')}`);
  assert.equal(readFileSync(REPORT, 'utf8'), before);
});

test('verify --only 搭配 --static 或 --links：參數錯誤，結束碼 2', () => {
  for (const extra of ['--static', '--links']) {
    const run = runVerify('--only', '導覽', extra);
    assert.equal(run.status, 2, `${extra}：${run.stdout}${run.stderr}`);
    assert.equal(run.stderr.trim(), '--only 不能和 --static、--links 一起用');
  }
});
