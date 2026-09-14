#!/usr/bin/env node
/**
 * verify.mjs — 網站驗證腳本
 *   node scripts/verify.mjs --static   只做靜態檢查（資料檔存在、JSON 可解析、來源 ID 對應、schema 檔有效）
 *   node scripts/verify.mjs            靜態檢查 + 以 Playwright（Chromium）啟動本機伺服器，檢查導覽、搜尋、篩選、複製、下載、案例互動
 * 結果寫入 verify-report.md（實際檢查結果紀錄）。
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

// ---------- 靜態檢查 ----------
function staticChecks() {
  const ctx = { window: {} }; vm.createContext(ctx);
  for (const f of ['data/manifest.js', 'data/research.js', 'data/guides.js', 'data/skills.js', 'data/case.js', 'data/process.js', 'data/io.js', 'data/platforms.js', 'data/sources.js']) {
    try { vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx); ok(`載入 ${f}`, true); } catch (e) { ok(`載入 ${f}`, false, e.message); }
  }
  const w = ctx.window;
  ok('研究文件 ≥ 7 章', (w.RESEARCH_DOCS || []).length >= 7, `${(w.RESEARCH_DOCS || []).length} 章`);
  ok('五個平台教學 + 部署文件', (w.GUIDE_DOCS || []).filter(g => g.platform).length === 5 && (w.GUIDE_DOCS || []).some(g => g.id === 'deployment'), (w.GUIDE_DOCS || []).map(g => g.id).join(','));
  const platforms = new Set((w.SKILL_FILES || []).map(s => s.platform));
  ok('Skills 涵蓋五平台 + shared', ['chatgpt', 'claude', 'grok', 'glm', 'deepseek', 'shared'].every(p => platforms.has(p)), [...platforms].join(','));
  ok('每個平台都有 SKILL.md 或 system-prompt.md', ['chatgpt', 'claude', 'grok', 'glm', 'deepseek'].every(p => (w.SKILL_FILES || []).some(s => s.platform === p && /SKILL\.md$|system-prompt\.md$/.test(s.name))));
  // 來源 ID 對應
  const srcIds = new Set((w.SOURCES || []).map(s => s.id));
  const referenced = new Set();
  for (const d of w.RESEARCH_DOCS || []) for (const m of d.body.matchAll(/\[(G-?[A-Za-z0-9]+|V\d+|U\d+|M\d+|P-[A-Z]+\d+)\]/g)) referenced.add(m[1]);
  for (const s of w.PROCESS_STAGES || []) for (const id of s.sources) referenced.add(id);
  for (const i of w.IO_ITEMS || []) for (const id of i.sources_refs || []) referenced.add(id);
  for (const p of w.PLATFORMS || []) for (const id of p.sources) referenced.add(id);
  const missing = [...referenced].filter(id => !srcIds.has(id));
  ok('所有引用的來源 ID 都存在於來源表', missing.length === 0, missing.length ? `缺：${missing.join(', ')}` : `${referenced.size} 個 ID`);
  // 流程 ↔ IO 對應
  const ioIds = new Set((w.IO_ITEMS || []).map(i => i.id));
  const badIO = (w.PROCESS_STAGES || []).flatMap(s => [...s.inputs, ...s.outputs]).filter(id => !ioIds.has(id));
  ok('流程步驟引用的 I/O 都存在', badIO.length === 0, badIO.join(','));
  // schema JSON
  for (const f of ['skills/shared/input-schema.json', 'skills/shared/output-schema.json', 'skills/grok/tool-definitions.json', 'skills/glm/claude-code-settings.example.json']) {
    try { JSON.parse(readFileSync(join(ROOT, f), 'utf8')); ok(`JSON 有效 ${f}`, true); } catch (e) { ok(`JSON 有效 ${f}`, false, e.message); }
  }
  // 示範引擎驗收
  vm.runInContext(readFileSync(join(ROOT, 'assets/demo.js'), 'utf8'), ctx);
  const R = w.DEMO.analyze(w.CASE_DATA, {});
  const vpn = R.findings.find(f => f.vuln_id === 'SYN-2026-0101');
  ok('驗收 2：vpn-gw-01/SYN-2026-0101 為 P1 且含四項依據', vpn && vpn.priority === 'P1' && ['對外曝露', '公開利用程式', '模擬 KEV', '威脅情資命中'].every(k => vpn.factors.some(x => x.includes(k))), vpn ? `${vpn.priority} ${vpn.score}` : '找不到');
  ok('驗收 3：存在 internet → vpn-gw-01 → ad-dc-01 → erp-db-01', R.hypotheses.some(h => h.nodes.join('>') === 'A01>A04>A06'));
  ok('驗收 4：驗證計畫每項標「尚未授權主動測試」', R.validation.length > 0 && R.validation.every(v => v.requires.includes('尚未授權主動測試')));
  const R2 = w.DEMO.analyze(w.CASE_DATA, { inputs: { threatIntel: false } });
  ok('驗收 6：移除情資後信心下修並標示', R2.findings.every(f => f.confidence === '中') && R2.missingSummary.includes('威脅情資'));
  // 示範引擎 golden snapshot：評分規則同時存在於 assets/demo.js、skills/shared/core-prompt.md、
  // skills/shared/task-spec.md 附錄 A 與 references/scoring-rules.md，此檢查用來抓「改了一處忘了同步其他處」。
  const snapPath = join(ROOT, 'examples/demo-snapshot.txt');
  try {
    const actual = execFileSync(process.execPath, [join(ROOT, 'scripts/run-demo.mjs')], { encoding: 'utf8' }).replace(/\r\n/g, '\n');
    const expected = readFileSync(snapPath, 'utf8').replace(/\r\n/g, '\n');
    ok('示範引擎輸出與 examples/demo-snapshot.txt 一致', actual === expected,
      actual === expected ? `${actual.split('\n').length} 行` : '評分規則已變動：確認 demo.js／core-prompt.md／task-spec.md／scoring-rules.md 四處已同步後執行 npm run snapshot 更新快照');
  } catch (e) { ok('示範引擎輸出與 examples/demo-snapshot.txt 一致', false, e.message.slice(0, 120)); }
  // 下載檔案
  for (const d of w.BUILD_MANIFEST.downloads) ok(`下載檔存在 ${d}`, existsSync(join(ROOT, d)));
  // 機敏字串掃描
  const secretPatterns = [/sk-[A-Za-z0-9]{20,}/, /xai-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /ghp_[A-Za-z0-9]{36}/];
  const allText = (w.SKILL_FILES || []).map(s => s.content).join('\n') + (w.GUIDE_DOCS || []).map(g => g.body).join('\n');
  ok('無 API 金鑰樣式字串', !secretPatterns.some(p => p.test(allText)));
}

// ---------- 瀏覽器檢查 ----------
async function browserChecks() {
  let chromium;
  try { ({ chromium } = await import('playwright')); } catch { try { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); } catch (e) { ok('Playwright 可用', false, e.message); return; } }
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.zip': 'application/zip', '.md': 'text/markdown', '.csv': 'text/csv' };
  const server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = join(ROOT, p);
    if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': mime[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream' }); res.end(readFileSync(f));
  }).listen(0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}/`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const shots = join(ROOT, 'verify-screenshots'); mkdirSync(shots, { recursive: true });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + '#/');
  await page.waitForSelector('h1');
  ok('首頁渲染', (await page.textContent('h1')).includes('Preemptive'));
  await page.screenshot({ path: join(shots, 'home.png') });
  const routes = ['#/methodology', '#/process', '#/io', '#/platforms', '#/skills', '#/guides', '#/case', '#/sources', '#/deploy'];
  for (const r of routes) {
    await page.goto(base + r); await page.waitForTimeout(150);
    const h1 = await page.textContent('h1');
    const hasError = await page.$('.callout.danger strong:has-text("頁面渲染錯誤")');
    ok(`導覽 ${r}`, !!h1 && !hasError, h1?.slice(0, 30));
    await page.screenshot({ path: join(shots, r.replace('#/', '') + '.png') });
  }
  // 方法論分頁切換
  await page.goto(base + '#/methodology'); await page.waitForTimeout(100);
  const tabs = await page.$$('.tabs button');
  await tabs[1].click(); await page.waitForTimeout(100);
  ok('方法論章節切換', (await page.textContent('article h2')).length > 0 && page.url().includes('doc='), page.url().split('#')[1]);
  // 搜尋
  await page.fill('#search', 'CTEM'); await page.waitForTimeout(150);
  const n = await page.$$eval('#search-results a', a => a.length);
  ok('全站搜尋回傳結果', n > 0, `${n} 筆`);
  await page.fill('#search', '');
  // I/O 篩選
  await page.goto(base + '#/io'); await page.waitForTimeout(100);
  const before = await page.$$eval('#io-list details', d => d.length);
  await page.selectOption('#f-nec', 'required'); await page.waitForTimeout(100);
  const after = await page.$$eval('#io-list details', d => d.length);
  ok('I/O 必要性篩選', after < before && after > 0, `${before} → ${after}`);
  await page.selectOption('#f-stage', 's4'); await page.waitForTimeout(100);
  ok('I/O 階段篩選', (await page.$$eval('#io-list details', d => d.length)) >= 0);
  // Skills 複製與下載
  await page.goto(base + '#/skills?platform=claude'); await page.waitForTimeout(150);
  await page.click('#copy-file');
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok('Skills 一鍵複製（剪貼簿）', clip.includes('preemptive-exposure-analysis'), `${clip.length} 字元`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dl-file')]);
  ok('Skills 檔案下載', (await dl.suggestedFilename()) === 'SKILL.md', await dl.suggestedFilename());
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('a[href="downloads/skills-claude.zip"]')]);
  ok('Skills ZIP 下載', (await dl2.suggestedFilename()).endsWith('.zip'));
  await page.click('#toggle-view'); await page.waitForTimeout(50);
  ok('Skills 原始／渲染切換', await page.$eval('#file-rendered', el => !el.hidden));
  // 教學平台切換
  await page.goto(base + '#/guides?platform=grok'); await page.waitForTimeout(100);
  ok('教學平台切換 Grok', (await page.textContent('article')).includes('xAI'));
  // 案例互動
  await page.goto(base + '#/case'); await page.waitForTimeout(200);
  const p1Before = await page.$$eval('#case-output .score.P1', s => s.length);
  await page.uncheck('input[data-input="threatIntel"]'); await page.waitForTimeout(100);
  const warn = await page.textContent('#case-output .callout');
  ok('案例：移除情資後顯示缺漏警示', warn.includes('威脅情資'));
  await page.uncheck('input[data-input="topology"]'); await page.waitForTimeout(100);
  ok('案例：移除拓樸後無路徑假設', (await page.textContent('#case-output')).includes('未提供拓樸資料'));
  await page.check('input[data-input="topology"]'); await page.check('input[data-input="threatIntel"]');
  await page.fill('#inv', '70'); await page.dispatchEvent('#inv', 'input'); await page.waitForTimeout(100);
  ok('案例：清冊完整度調整', (await page.textContent('#case-output')).includes('資產清冊不完整'));
  await page.selectOption('#appetite', 'strict'); await page.waitForTimeout(100);
  const p1After = await page.$$eval('#case-output .score.P1', s => s.length);
  ok('案例：風險胃納切換改變 P1 數', p1After !== p1Before, `${p1Before} → ${p1After}`);
  const [dl3] = await Promise.all([page.waitForEvent('download'), page.click('#dl-json')]);
  ok('案例：輸出 JSON 下載', (await dl3.suggestedFilename()).endsWith('.json'));
  await page.click('#copy-md');
  const clip2 = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok('案例：複製報告 Markdown', clip2.includes('先制型曝險分析報告'));
  await page.screenshot({ path: join(shots, 'case-interactive.png'), fullPage: true });
  // 來源頁篩選與連結格式
  await page.goto(base + '#/sources'); await page.waitForTimeout(100);
  const links = await page.$$eval('#src-list a', a => a.map(x => x.href));
  ok('來源頁所有連結為 http(s)', links.length > 30 && links.every(h => /^https?:\/\//.test(h)), `${links.length} 個連結`);
  await page.selectOption('#s-type', 'gartner'); await page.waitForTimeout(100);
  ok('來源頁類型篩選', (await page.$$eval('#src-list tbody tr', r => r.length)) < links.length);
  // 行動裝置
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mobile.newPage();
  await mp.goto(base + '#/platforms'); await mp.waitForTimeout(150);
  const bodyW = await mp.evaluate(() => document.documentElement.scrollWidth);
  ok('行動裝置：無水平捲動', bodyW <= 390, `scrollWidth ${bodyW}`);
  await mp.click('#menu-btn'); await mp.waitForTimeout(100);
  ok('行動裝置：漢堡選單開啟', await mp.$eval('.sidebar', s => s.classList.contains('open')));
  await mp.screenshot({ path: join(shots, 'mobile-platforms.png') });
  // 無障礙基礎
  await page.goto(base + '#/'); await page.waitForTimeout(100);
  ok('無障礙：skip link、lang、aria-current', (await page.$('.skip-link')) && (await page.getAttribute('html', 'lang')) === 'zh-Hant' && (await page.$('.sidebar nav a[aria-current="page"]')) !== null);
  ok('無 JS 執行錯誤', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close(); server.close();
}

// ---------- 連結檢查（可選） ----------
async function linkChecks() {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'data/sources.js'), 'utf8'), ctx);
  const rows = [];
  for (const s of ctx.window.SOURCES) {
    try {
      const r = await fetch(s.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
      rows.push(`| ${s.id} | ${r.status} | ${s.url} |`);
    } catch (e) { rows.push(`| ${s.id} | ERR ${String(e.cause?.code || e.message).slice(0, 40)} | ${s.url} |`); }
  }
  writeFileSync(join(ROOT, 'link-check.md'), `# 連結檢查 ${new Date().toISOString()}\n\n| ID | 狀態 | URL |\n|---|---|---|\n${rows.join('\n')}\n`);
  console.log(rows.join('\n'));
}

const args = process.argv.slice(2);
staticChecks();
if (!args.includes('--static')) await browserChecks();
if (args.includes('--links')) await linkChecks();
const passed = results.filter(r => r.pass).length;
const report = `# 驗證報告\n\n執行時間：${new Date().toISOString()}\n模式：${args.join(' ') || 'full'}\n結果：${passed}/${results.length} 通過\n\n| 檢查 | 結果 | 說明 |\n|---|---|---|\n${results.map(r => `| ${r.name} | ${r.pass ? '✅' : '❌'} | ${r.detail.replace(/\|/g, '/')} |`).join('\n')}\n`;
writeFileSync(join(ROOT, 'verify-report.md'), report);
console.log(`\n${passed}/${results.length} 通過 → verify-report.md`);
process.exit(passed === results.length ? 0 : 1);
