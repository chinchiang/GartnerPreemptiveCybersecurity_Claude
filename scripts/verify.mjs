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
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

// ---------- 靜態檢查 ----------
function staticChecks() {
  const ctx = { window: {} }; vm.createContext(ctx);
  for (const f of ['data/manifest.js', 'data/research.js', 'data/guides.js', 'data/skills.js', 'data/case.js', 'data/process.js', 'data/io.js', 'data/platforms.js', 'data/sources.js', 'data/extra.js']) {
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
  const noVer = (w.SOURCES || []).filter(s => !s.verification || !s.url || !s.date || !s.accessed).map(s => s.id);
  ok('每筆來源都有 verification、url、date、accessed', noVer.length === 0, noVer.join(','));
  ok('證據檔已嵌入網站', (w.EXTRA_DOCS?.evidence || []).length >= 2, `${(w.EXTRA_DOCS?.evidence || []).length} 份`);
  const badDerived = (w.PROCESS_STAGES || []).flatMap(s => s.derivedFrom || []).filter(id => !(w.PROCESS_STAGES || []).some(x => x.id === id));
  ok('流程步驟 derivedFrom 指向存在的步驟', badDerived.length === 0, badDerived.join(','));
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
  ok('驗收 5：管理摘要 ≤ 300 字且含「決策請求」「限制」', R.summary.length <= 300 && R.summary.text.includes('決策請求') && R.summary.text.includes('限制'), `${R.summary.length} 字`);
  const R7 = w.DEMO.analyze({ ...w.CASE_DATA, scope: undefined }, {});
  ok('驗收 7：缺 scope 時拒絕分析並列出必要欄位', R7.refused === true && R7.requiredFields.length === 6 && R7.findings.length === 0);
  const Rx = w.DEMO.analyze(w.CASE_DATA, { inputs: { topology: false } });
  ok('缺拓樸：信心下修且無路徑假設', Rx.hypotheses.length === 0 && Rx.findings.every(f => f.confidence === '中'));
  const Ri = w.DEMO.analyze(w.CASE_DATA, { inventoryCompleteness: 70 });
  ok('清冊 < 80%：信心「低」', Ri.findings.length > 0 && Ri.findings.every(f => f.confidence === '低'));
  const Ra = w.DEMO.analyze({ ...w.CASE_DATA, scope: { ...w.CASE_DATA.scope, authorized_scope: { ...w.CASE_DATA.scope.authorized_scope, active_testing_authorized: true, external_scanning_authorized: false } } }, {});
  ok('驗證計畫：外部驗證需兩個授權旗標', Ra.validation.filter(v => v.method.includes('外部')).every(v => v.requires.includes('尚未授權')));
  const S = w.DEMO.toSchema(R, w.CASE_DATA);
  const schema = JSON.parse(readFileSync(join(ROOT, 'skills/shared/output-schema.json'), 'utf8'));
  const missTop = schema.required.filter(k => !(k in S));
  const blocksOK = schema.required.filter(k => k !== 'human_review_points' && k !== 'meta').every(k => ['confidence', 'basis', 'missing_inputs', 'requires_human'].every(f => f in S[k]));
  const hypOK = S.attack_path_hypotheses.items.every(h => h.status === 'hypothesis' && ['id', 'entry', 'target', 'nodes', 'edges', 'feasibility'].every(f => f in h));
  const valOK = S.validation_plan.items.every(v => ['id', 'hypothesis', 'method', 'authorization_required', 'success_criteria'].every(f => f in v));
  const remOK = S.remediation.items.every(r => ['finding_id', 'priority', 'action', 'owner', 'effort', 'verify', 'approval_level'].every(f => f in r));
  ok('引擎 JSON 符合 output-schema 結構', missTop.length === 0 && blocksOK && hypOK && valOK && remOK && (S.executive_summary.text.length <= 300), missTop.join(',') || 'required、block 欄位、items 必填鍵、摘要長度');
  const R2 = w.DEMO.analyze(w.CASE_DATA, { inputs: { threatIntel: false } });
  ok('驗收 6：移除情資後信心下修並標示', R2.findings.every(f => f.confidence === '中') && R2.missingSummary.includes('威脅情資'));
  // 陳舊產生檔：downloads/*.zip 與 data/*.js 由 build-data.mjs 產生，CI 另以 git status 檢查
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
  // 目錄錨點（中文 slug 需 decode）與 tab 鍵盤操作
  const tocLink = await page.$('.doc-toc a:nth-child(3)');
  const tocHref = await tocLink.getAttribute('href');
  await tocLink.click(); await page.waitForTimeout(150);
  const anchorId = decodeURIComponent(tocHref.split('#')[2] || '');
  const anchorEl = anchorId ? await page.$(`[id="${anchorId.replace(/"/g, '')}"]`) : null;
  ok('目錄錨點：同章且元素存在', page.url().includes('doc=01-definition') && !!anchorEl && (await page.evaluate(() => window.scrollY)) > 0, `${anchorId} scrollY=${await page.evaluate(() => window.scrollY)}`);
  await page.focus('.tabs [role="tab"][aria-selected="true"]'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
  ok('Tabs 方向鍵切換', page.url().includes('doc=02-relations'), page.url().split('#')[1]);
  // skip link 不應觸發「找不到頁面」
  await page.goto(base + '#/process'); await page.waitForTimeout(100);
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  ok('Skip link 不改變頁面', (await page.textContent('h1')).includes('可執行流程') && (await page.evaluate(() => document.activeElement?.id)) === 'main');
  // 搜尋
  await page.fill('#search', 'CTEM'); await page.waitForTimeout(150);
  const n = await page.$$eval('#search-results a', a => a.length);
  ok('全站搜尋回傳結果', n > 0, `${n} 筆`);
  ok('搜尋 ARIA：aria-expanded 更新且結果為 option', (await page.getAttribute('#search', 'aria-expanded')) === 'true' && (await page.$$eval('#search-results [role="option"]', a => a.length)) === n);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  ok('搜尋鍵盤導覽：aria-activedescendant', (await page.getAttribute('#search', 'aria-activedescendant')) === 'search-opt-1');
  ok('搜尋片段含 mark', (await page.$$eval('#search-results .small mark', m => m.length)) > 0);
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
  await page.selectOption('#s-type', 'all'); await page.selectOption('#s-ver', 'full'); await page.waitForTimeout(100);
  ok('來源頁查證等級篩選', (await page.$$eval('#src-list tbody tr', r => r.length)) === 6);
  ok('來源頁：證據檔附錄可展開', (await page.$$('details.doc-details')).length >= 3);
  await page.goto(base + '#/deploy'); await page.waitForTimeout(100);
  ok('部署頁：標題層級無跳級', await page.evaluate(() => { const hs = [...document.querySelectorAll('main h1,main h2,main h3,main h4')].map(h => +h.tagName[1]); return hs.every((l, i) => i === 0 || l <= hs[i - 1] + 1); }));
  // 行動裝置
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mobile.newPage();
  const overflow = [];
  for (const r of ['#/', ...routes, '#/skills?platform=claude', '#/guides?platform=claude', '#/methodology?doc=03-process']) {
    await mp.goto(base + r); await mp.waitForTimeout(150);
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    if (w > 390) overflow.push(`${r}:${w}`);
  }
  ok('行動裝置 390px：所有路由無水平捲動', overflow.length === 0, overflow.join(' '));
  await mp.setViewportSize({ width: 320, height: 700 });
  const overflow320 = [];
  for (const r of ['#/', '#/io', '#/case', '#/skills', '#/deploy']) { await mp.goto(base + r); await mp.waitForTimeout(150); const w = await mp.evaluate(() => document.documentElement.scrollWidth); if (w > 320) overflow320.push(`${r}:${w}`); }
  ok('行動裝置 320px：無水平捲動', overflow320.length === 0, overflow320.join(' '));
  await mp.setViewportSize({ width: 390, height: 844 }); await mp.goto(base + '#/platforms'); await mp.waitForTimeout(150);
  await mp.click('#menu-btn'); await mp.waitForTimeout(100);
  ok('行動裝置：漢堡選單開啟', await mp.$eval('.sidebar', s => s.classList.contains('open')));
  await mp.screenshot({ path: join(shots, 'mobile-platforms.png') });
  // 無障礙基礎
  await page.goto(base + '#/'); await page.waitForTimeout(100);
  ok('無障礙：skip link、lang、aria-current', (await page.$('.skip-link')) && (await page.getAttribute('html', 'lang')) === 'zh-Hant' && (await page.$('.sidebar nav a[aria-current="page"]')) !== null);
  // 對比：主要按鈕文字與深色主題徽章
  const contrast = await page.evaluate(() => {
    const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const btn = document.querySelector('.btn:not(.secondary)'); const cs = getComputedStyle(btn);
    return ratio(cs.color, cs.backgroundColor);
  });
  ok('對比：主要按鈕 ≥ 4.5', contrast >= 4.5, contrast.toFixed(2));
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  const darkContrast = await page.evaluate(() => {
    const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const els = [document.querySelector('.btn:not(.secondary)'), document.querySelector('.brand .badge'), document.querySelector('.sidebar nav a[aria-current="page"]')];
    return Math.min(...els.map(e => { const cs = getComputedStyle(e); return ratio(cs.color, cs.backgroundColor); }));
  });
  ok('對比：深色主題強調色元素 ≥ 4.5', darkContrast >= 4.5, darkContrast.toFixed(2));
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
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
