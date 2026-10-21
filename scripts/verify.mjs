#!/usr/bin/env node
/**
 * verify.mjs — 網站驗證腳本
 *   node scripts/verify.mjs --static   只做靜態檢查（資料檔存在、JSON 可解析、來源 ID 對應、schema 檔有效）
 *   node scripts/verify.mjs            靜態檢查 + 以 Playwright（Chromium）啟動本機伺服器，檢查導覽、搜尋、篩選、複製、下載、案例互動
 *   node scripts/verify.mjs --only 最後更新時間[,搜尋框與 topbar]   只跑指定名稱的瀏覽器情境（名稱見 SCENARIOS），不跑靜態檢查、不寫報告；
 *                                      名稱打錯或搭配 --static／--links 時以結束碼 2 結束，不啟動瀏覽器
 * 完整模式的結果寫入 verify-report.md（實際檢查結果紀錄）；--static 只印到 stdout，不改寫這個已提交的檔案。
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { stampLastUpdated } from './stamp-last-updated.mjs';
import { renderReport } from './verify-report.mjs';
import { runBrowserChecks, STAMPED_AT } from './browser-checks.mjs';

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
  ok('五個平臺教學 + 部署文件', (w.GUIDE_DOCS || []).filter(g => g.platform).length === 5 && (w.GUIDE_DOCS || []).some(g => g.id === 'deployment'), (w.GUIDE_DOCS || []).map(g => g.id).join(','));
  const platforms = new Set((w.SKILL_FILES || []).map(s => s.platform));
  ok('Skills 涵蓋五平臺 + shared', ['chatgpt', 'claude', 'grok', 'glm', 'deepseek', 'shared'].every(p => platforms.has(p)), [...platforms].join(','));
  ok('每個平臺都有 SKILL.md 或 system-prompt.md', ['chatgpt', 'claude', 'grok', 'glm', 'deepseek'].every(p => (w.SKILL_FILES || []).some(s => s.platform === p && /SKILL\.md$|system-prompt\.md$/.test(s.name))));
  // 複本的標題要與母本相同：網站從 frontmatter 讀標題，標註若擋在 frontmatter 前面，標題就會變成空的
  const masterOf = (s) => (w.SKILL_FILES || []).find(m => m.path === `skills/shared/${s.name}`);
  const refCopies = (w.SKILL_FILES || []).filter(s => s.ext === 'md' && s.path.includes('/references/'));
  const badTitles = refCopies.filter(s => !masterOf(s) || s.title !== masterOf(s).title);
  ok('references/ 的 .md 複本標題與母本一致', refCopies.length > 0 && badTitles.length === 0, badTitles.length ? `不一致：${badTitles.map(s => s.path).join(', ')}` : `${refCopies.length} 份`);
  // 來源 ID 對應
  const srcIds = new Set((w.SOURCES || []).map(s => s.id));
  const referenced = new Set();
  for (const d of w.RESEARCH_DOCS || []) for (const m of d.body.matchAll(/\[(G-?[A-Za-z0-9]+|V\d+|U\d+|M\d+|P-[A-Z]+\d+)\]/g)) referenced.add(m[1]);
  for (const s of w.PROCESS_STAGES || []) for (const id of s.sources) referenced.add(id);
  for (const i of w.IO_ITEMS || []) for (const id of i.sources_refs || []) referenced.add(id);
  for (const p of w.PLATFORMS || []) for (const id of p.sources) referenced.add(id);
  const missing = [...referenced].filter(id => !srcIds.has(id));
  ok('所有引用的來源 ID 都存在於來源表', missing.length === 0, missing.length ? `缺：${missing.join(', ')}` : `${referenced.size} 個 ID`);
  const noVer = (w.SOURCES || []).filter(s => !s.verification || s.url === undefined || !s.date || !s.accessed).map(s => s.id);
  ok('每筆來源都有 verification、url（可為 null）、date、accessed', noVer.length === 0, noVer.join(','));
  // 待驗證清單：status 合法、pending 必須寫得出下一步、done 必須有完成日。
  const todo = w.TODO_ITEMS || [];
  const badStatus = todo.filter(t => !['pending', 'done'].includes(t.status)).map(t => t.item?.slice(0, 20));
  ok('待驗證清單每項都有合法 status', todo.length > 0 && badStatus.length === 0, badStatus.join('｜'));
  const emptyHow = todo.filter(t => t.status === 'pending' && !(t.how || '').trim()).map(t => t.item?.slice(0, 20));
  ok('待驗證項目都寫出了下一步（how）', emptyHow.length === 0, emptyHow.length ? emptyHow.join('｜') : `${todo.filter(t => t.status === 'pending').length} 項待處理`);
  const badDone = todo.filter(t => t.status === 'done' && !/^\d{4}-\d{2}-\d{2}$/.test(t.resolvedAt || '')).map(t => t.item?.slice(0, 20));
  ok('已完成項目都有 resolvedAt 日期', badDone.length === 0, badDone.length ? badDone.join('｜') : `${todo.filter(t => t.status === 'done').length} 項已完成`);
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
  // 示範引擎的行為、輸出結構與快照在 npm test：scoring.test.mjs、attack-paths.test.mjs、demo-output.test.mjs，驗收在 acceptance.test.mjs（#63、#98）
  // 站點層級檔案與 index.html 的 head
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  ok('index.html 有 CSP meta 且允許 inline style（app.js 用 style 屬性）',
    /http-equiv="Content-Security-Policy"/.test(html) && /style-src [^"]*'unsafe-inline'/.test(html));
  ok('index.html 有 OG／Twitter 卡片與 canonical', ['og:title', 'og:url', 'twitter:card', 'rel="canonical"'].every(k => html.includes(k)));
  // 最後更新時間由部署時的 stamp-last-updated.mjs 寫入：提交的版本要恰好一個空的 <meta>，否則要到部署才失敗；填了時間的版本也不該提交
  let stampable = true;
  try { stampLastUpdated(html, '2026-01-01T00:00:00+00:00'); } catch { stampable = false; }
  ok('index.html 恰好一個空的 last-updated <meta>（部署時才填得進最後更新時間）', stampable && html.split('name="last-updated"').length === 2);
  for (const f of ['robots.txt', 'sitemap.xml', '.nojekyll', '404.html']) ok(`站點檔案存在 ${f}`, existsSync(join(ROOT, f)));
  const SITE = 'https://chinchiang.github.io/GartnerPreemptiveCybersecurity_Claude/';
  ok('canonical、og:url、sitemap.xml、robots.txt 的網址一致',
    html.includes(`rel="canonical" href="${SITE}"`) && html.includes(`content="${SITE}"`)
    && readFileSync(join(ROOT, 'sitemap.xml'), 'utf8').includes(`<loc>${SITE}</loc>`)
    && readFileSync(join(ROOT, 'robots.txt'), 'utf8').includes(`${SITE}sitemap.xml`));
  // 下載檔案
  for (const d of w.BUILD_MANIFEST.downloads) ok(`下載檔存在 ${d}`, existsSync(join(ROOT, d)));
  // 機敏字串掃描
  const secretPatterns = [/sk-[A-Za-z0-9]{20,}/, /xai-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /ghp_[A-Za-z0-9]{36}/];
  const allText = (w.SKILL_FILES || []).map(s => s.content).join('\n') + (w.GUIDE_DOCS || []).map(g => g.body).join('\n');
  ok('無 API 金鑰樣式字串', !secretPatterns.some(p => p.test(allText)));
}

// ---------- 瀏覽器檢查 ----------
// 骨架（伺服器、瀏覽器、每次 open 的新 context、錯誤彙總、截圖目錄）在 browser-checks.mjs；這裡只列情境，依報告的順序。
// 情境彼此獨立：每個情境從自己 open 的頁面開始，不依賴其他情境留下的狀態；--only 用這裡的 name 選情境（#100）
const ROUTES = ['#/methodology', '#/process', '#/io', '#/platforms', '#/skills', '#/guides', '#/case', '#/sources', '#/deploy'];
const DESK = { width: 1280 };
// 最後更新時間：沒填（本機、clone、這裡的預設）時 topbar 與頁尾都不顯示；填了時寬螢幕顯示在 topbar、窄螢幕改顯示在頁尾
// （斷點與理由見 assets/styles.css）
const shown = (pg, sel) => pg.$eval(sel, n => n.checkVisibility()).catch(() => null);   // null＝元素不存在
// browser-checks.mjs 的 STAMPED_AT（2026-10-17T16:30:00+00:00）換成臺北時間的顯示文字；改 STAMPED_AT 時這裡要一起改
const LAST_UPDATED_TEXT = '最後更新：2026-10-18 00:30（UTC+8）';
// 「時間在頁尾」：量 topbar 與頁尾的時間是否顯示、頁尾的文字（footerStamp），判定只寫在 inFooter 這一份（#88）
const footerStamp = async pg => ({ top: await shown(pg, '#last-updated'), footer: await shown(pg, '#last-updated-footer'),
  text: await pg.$eval('#last-updated-footer', n => n.textContent.trim()).catch(() => '') });
const inFooter = s => s.top === false && s.footer === true && s.text === LAST_UPDATED_TEXT;

const SCENARIOS = [
  { name: '導覽', run: async ({ open, ok, shot }) => {
    const page = await open('#/', DESK);
    ok('首頁渲染', (await page.textContent('h1')).includes('Preemptive'));
    await shot(page, 'home');
    for (const r of ROUTES) {
      await page.goto(r); await page.waitForTimeout(150);
      const h1 = await page.textContent('h1');
      const hasError = await page.$('.callout.danger strong:has-text("頁面渲染錯誤")');
      ok(`導覽 ${r}`, !!h1 && !hasError, h1?.slice(0, 30));
      await shot(page, r.replace('#/', ''));
    }
  } },
  { name: '方法論', run: async ({ open, ok }) => {
    // 方法論分頁切換
    const page = await open('#/methodology', DESK); await page.waitForTimeout(100);
    const tabs = await page.$$('.tabs button');
    await tabs[1].click(); await page.waitForTimeout(100);
    ok('方法論章節切換', (await page.textContent('article h2')).length > 0 && page.url().includes('doc='), page.url().split('#')[1]);
    // 目錄錨點（中文 slug 需 decode）與 tab 鍵盤操作
    const tocLink = await page.$('.doc-toc a:nth-child(3)');
    const tocHref = await tocLink.getAttribute('href');
    await tocLink.click(); await page.waitForTimeout(150);
    const anchorId = decodeURIComponent(tocHref.split('#')[2] || '');
    const anchorEl = anchorId ? await page.$(`[id="${anchorId.replace(/"/g, '')}"]`) : null;
    // scrollY 每次執行都不同（捲動還在進行），只在失敗時寫進說明，否則已提交的報告每次都會過時
    const scrollY = await page.evaluate(() => window.scrollY);
    ok('目錄錨點：同章且元素存在', page.url().includes('doc=01-definition') && !!anchorEl && scrollY > 0, scrollY > 0 ? anchorId : `${anchorId} scrollY=${scrollY}`);
    await page.focus('.tabs [role="tab"][aria-selected="true"]'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
    ok('Tabs 方向鍵切換', page.url().includes('doc=02-relations'), page.url().split('#')[1]);
    // skip link 不應觸發「找不到頁面」
    await page.goto('#/process'); await page.waitForTimeout(100);
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
    ok('Skip link 不改變頁面', (await page.textContent('h1')).includes('可執行流程') && (await page.evaluate(() => document.activeElement?.id)) === 'main');
  } },
  { name: '搜尋', run: async ({ open, ok }) => {
    const page = await open('#/process', DESK);
    await page.fill('#search', 'CTEM'); await page.waitForTimeout(150);
    const n = await page.$$eval('#search-results a', a => a.length);
    ok('全站搜尋回傳結果', n > 0, `${n} 筆`);
    ok('搜尋 ARIA：aria-expanded 更新且結果為 option', (await page.getAttribute('#search', 'aria-expanded')) === 'true' && (await page.$$eval('#search-results [role="option"]', a => a.length)) === n);
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    ok('搜尋鍵盤導覽：aria-activedescendant', (await page.getAttribute('#search', 'aria-activedescendant')) === 'search-opt-1');
    ok('搜尋片段含 mark', (await page.$$eval('#search-results .small mark', m => m.length)) > 0);
  } },
  { name: 'I/O 篩選', run: async ({ open, ok }) => {
    const page = await open('#/io', DESK); await page.waitForTimeout(100);
    const before = await page.$$eval('#io-list details', d => d.length);
    await page.selectOption('#f-nec', 'required'); await page.waitForTimeout(100);
    const after = await page.$$eval('#io-list details', d => d.length);
    ok('I/O 必要性篩選', after < before && after > 0, `${before} → ${after}`);
    await page.selectOption('#f-stage', 's4'); await page.waitForTimeout(100);
    ok('I/O 階段篩選', (await page.$$eval('#io-list details', d => d.length)) >= 0);
  } },
  { name: 'Skills', run: async ({ open, ok }) => {
    // 複製與下載
    const page = await open('#/skills?platform=claude', { ...DESK, clipboard: true, downloads: true }); await page.waitForTimeout(150);
    await page.click('#copy-file');
    // Windows 的系統剪貼簿把 LF 換成 CRLF；換回來，字元數與原文比對才和 Linux 一致
    const clip = (await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')).replace(/\r\n/g, '\n');
    ok('Skills 一鍵複製（剪貼簿）', clip.includes('preemptive-exposure-analysis'), `${clip.length} 字元`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dl-file')]);
    ok('Skills 檔案下載', (await dl.suggestedFilename()) === 'SKILL.md', await dl.suggestedFilename());
    // 原始碼檢視、複製、下載都是含 frontmatter 的原文（SKILL.md 要靠 frontmatter 才能被各平臺讀取）
    const skillMd = await page.evaluate(() => window.SKILL_FILES.find(f => f.path === 'skills/claude/preemptive-exposure-analysis/SKILL.md').content);
    const rawView = await page.textContent('#file-raw code');
    const downloaded = readFileSync(await dl.path(), 'utf8');
    const notOriginal = [['原始碼檢視', rawView], ['複製', clip], ['下載', downloaded]].filter(([, text]) => text !== skillMd).map(([name]) => name);
    ok('Skills 原始碼檢視、複製、下載保留 frontmatter', skillMd.startsWith('---\n') && notOriginal.length === 0,
      notOriginal.length ? `${notOriginal.join('、')}與原文不同` : '三者皆與原文（含 frontmatter）相同');
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('a[href="downloads/skills-claude.zip"]')]);
    ok('Skills ZIP 下載', (await dl2.suggestedFilename()).endsWith('.zip'));
    await page.click('#toggle-view'); await page.waitForTimeout(50);
    ok('Skills 原始／渲染切換', await page.$eval('#file-rendered', el => !el.hidden));
    // 渲染檢視略過 frontmatter：從正文第一個標題開始，看不到欄位文字與分隔線
    const rendered = await page.$eval('#file-rendered', el => ({ text: el.textContent, first: el.firstElementChild?.tagName || '' }));
    const leaked = ['name: preemptive-exposure-analysis', 'description:'].filter(t => rendered.text.includes(t));
    ok('Skills 渲染檢視略過 frontmatter', leaked.length === 0 && /^H[1-6]$/.test(rendered.first),
      leaked.length ? `畫面出現 frontmatter：${leaked.join('、')}` : `第一個元素：${rendered.first}`);
  } },
  { name: '教學', run: async ({ open, ok }) => {
    const page = await open('#/guides?platform=grok', DESK); await page.waitForTimeout(100);
    ok('教學平臺切換 Grok', (await page.textContent('article')).includes('xAI'));
  } },
  { name: '案例', run: async ({ open, ok, shot }) => {
    const page = await open('#/case', { ...DESK, clipboard: true, downloads: true }); await page.waitForTimeout(200);
    // 規則卡：頁面上的文字等於引擎產生的文字（接線），且含預設規則的字面值錨點（規則刻意變更時，這裡和快照一起更新）
    const rulesCard = await page.textContent('#rules-card p');
    const rulesExpected = await page.evaluate(() => window.DEMO.rulesSummary().join(''));
    const missingAnchors = ['平衡胃納 P1 ≥ 60、P2 ≥ 40、P3 ≥ 20', '無任何發現的節點取 3'].filter(a => !rulesCard.includes(a));
    ok('案例：規則卡由示範引擎的規則資料渲染', rulesCard === rulesExpected && missingAnchors.length === 0,
      rulesCard !== rulesExpected ? `卡片與 DEMO.rulesSummary() 不同：${rulesCard.slice(0, 60)}…`
        : missingAnchors.length ? `卡片缺少預設規則：${missingAnchors.join('、')}` : '與 DEMO.rulesSummary() 相同，且含預設門檻與無發現節點取值');
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
    await shot(page, 'case-interactive', { fullPage: true });
  } },
  { name: '來源頁', run: async ({ open, ok }) => {
    // 篩選與連結格式
    const page = await open('#/sources', DESK); await page.waitForTimeout(100);
    const links = await page.$$eval('#src-list a', a => a.map(x => x.href));
    ok('來源頁所有連結為 http(s)', links.length > 30 && links.every(h => /^https?:\/\//.test(h)), `${links.length} 個連結`);
    await page.selectOption('#s-type', 'gartner'); await page.waitForTimeout(100);
    ok('來源頁類型篩選', (await page.$$eval('#src-list tbody tr', r => r.length)) < links.length);
    await page.selectOption('#s-type', 'all'); await page.selectOption('#s-ver', 'full'); await page.waitForTimeout(100);
    ok('來源頁查證等級篩選', (await page.$$eval('#src-list tbody tr', r => r.length)) === 7);
    ok('來源頁：證據檔附錄可展開', (await page.$$('details.doc-details')).length >= 3);
  } },
  { name: '部署頁', run: async ({ open, ok }) => {
    const page = await open('#/deploy', DESK); await page.waitForTimeout(100);
    ok('部署頁：標題層級無跳級', await page.evaluate(() => { const hs = [...document.querySelectorAll('main h1,main h2,main h3,main h4')].map(h => +h.tagName[1]); return hs.every((l, i) => i === 0 || l <= hs[i - 1] + 1); }));
  } },
  { name: '行動裝置', run: async ({ open, ok, shot }) => {
    const mp = await open('#/', { width: 390, height: 844 });
    const overflow = [];
    for (const r of ['#/', ...ROUTES, '#/skills?platform=claude', '#/guides?platform=claude', '#/methodology?doc=03-process']) {
      await mp.goto(r); await mp.waitForTimeout(150);
      const w = await mp.evaluate(() => document.documentElement.scrollWidth);
      if (w > 390) overflow.push(`${r}:${w}`);
    }
    ok('行動裝置 390px：所有路由無水平捲動', overflow.length === 0, overflow.join(' '));
    await mp.setViewportSize({ width: 320, height: 700 });
    const overflow320 = [];
    for (const r of ['#/', '#/io', '#/case', '#/skills', '#/deploy']) { await mp.goto(r); await mp.waitForTimeout(150); const w = await mp.evaluate(() => document.documentElement.scrollWidth); if (w > 320) overflow320.push(`${r}:${w}`); }
    ok('行動裝置 320px：無水平捲動', overflow320.length === 0, overflow320.join(' '));
    await mp.setViewportSize({ width: 390, height: 844 }); await mp.goto('#/platforms'); await mp.waitForTimeout(150);
    await mp.click('#menu-btn'); await mp.waitForTimeout(100);
    ok('行動裝置：漢堡選單開啟', await mp.$eval('.sidebar', s => s.classList.contains('open')));
    await shot(mp, 'mobile-platforms');
  } },
  { name: '無障礙', run: async ({ open, ok }) => {
    const page = await open('#/', DESK); await page.waitForTimeout(100);
    ok('無障礙：skip link、lang、aria-current', (await page.$('.skip-link')) && (await page.getAttribute('html', 'lang')) === 'zh-Hant' && (await page.$('.sidebar nav a[aria-current="page"]')) !== null);
    // 對比：主要按鈕文字與深色主題徽章（深色主題只設在這個情境自己的頁面上）
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
  } },
  { name: '儲存庫連結', run: async ({ open, ok }) => {
    // 顯示狀態必須與 assets/app.js 的 REPO_PUBLIC 一致
    const page = await open('#/', DESK);
    const repoPublic = /const REPO_PUBLIC = true/.test(readFileSync(join(ROOT, 'assets/app.js'), 'utf8'));
    const repoVisible = await page.evaluate(() => ['#repo-link', '#repo-footer'].every(s => { const n = document.querySelector(s); return n && !n.hidden; }));
    ok(`儲存庫連結顯示狀態符合 REPO_PUBLIC=${repoPublic}`, repoVisible === repoPublic, `實際 ${repoVisible ? '顯示' : '隱藏'}`);
  } },
  { name: '最後更新時間', run: async ({ open, ok, shot }) => {
    const page = await open('#/', DESK), mp = await open('#/', { width: 390, height: 844 });
    ok('最後更新時間：沒填時 topbar 與頁尾都不顯示（元素存在）',
      (await shown(page, '#last-updated')) === false && (await shown(page, '#last-updated-footer')) === false
      && (await shown(mp, '#last-updated')) === false && (await shown(mp, '#last-updated-footer')) === false);
    await page.goto('?stamped#/'); await page.waitForSelector('h1');
    const desk = await page.$eval('#last-updated', n => ({ text: n.textContent.trim(), datetime: n.querySelector('time')?.getAttribute('datetime') })).catch(() => ({}));
    ok('最後更新時間：填了時 1280px 的 topbar 顯示臺北時間、頁尾不顯示',
      (await shown(page, '#last-updated')) === true && desk.text === LAST_UPDATED_TEXT && desk.datetime === STAMPED_AT && (await shown(page, '#last-updated-footer')) === false,
      `${desk.text}｜${desk.datetime}`);
    await shot(page, 'home-last-updated');
    await mp.goto('?stamped#/'); await mp.waitForSelector('h1');
    const foot = await footerStamp(mp);
    ok('最後更新時間：填了時 390px 的 topbar 隱藏、頁尾顯示同一段文字', inFooter(foot), foot.text);
    const at1100 = await open('?stamped#/', { width: 1100 });
    const mid = await footerStamp(at1100);
    ok('最後更新時間：填了時 1100px 的 topbar 隱藏、頁尾顯示（topbar 放不下，否則搜尋框會被擠窄）', inFooter(mid), mid.text);
  } },
  { name: '搜尋框與 topbar', run: async ({ open, ok }) => {
    // 搜尋框不能被 topbar 擠窄（#75）：每段斷點區間裡最窄的是左端，901px（900px 的斷點）與 1151px（時間仍在 topbar 的最窄寬度）；
    // 改了 assets/styles.css 的斷點，這兩個寬度要一起改。160px 扣掉放大鏡與內距（約 52px）約剩 7 個中文字的打字空間。
    // 寬度隨字型而變（本機與 CI 不同），只在失敗時寫進說明，報告才和 CI 一致
    const MIN_SEARCH_WIDTH = 160;
    for (const [width, why] of [[901, ''], [1151, '（時間在 topbar 的最窄寬度）']]) {
      const stamped = await open('?stamped#/', { width });
      const searchW = await stamped.$eval('#search', n => n.getBoundingClientRect().width);
      const pass = searchW >= MIN_SEARCH_WIDTH;
      ok(`搜尋框：填了時 ${width}px 至少 ${MIN_SEARCH_WIDTH}px${why}`, pass, pass ? '' : `${Math.round(searchW * 10) / 10}px`);
    }
    // 搜尋框到 max-width 之後，多的空間由 spacer 的 auto margin 吃掉，右側按鈕仍貼齊 topbar 的內緣
    const wide = await open('?stamped#/', { width: 1920 });
    const wideBar = await wide.$eval('.topbar', bar => {
      const s = getComputedStyle(bar), last = [...bar.children].filter(c => c.checkVisibility()).at(-1), box = bar.querySelector('.search-box');
      return { rightGap: bar.getBoundingClientRect().right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth) - last.getBoundingClientRect().right,
        searchW: box.getBoundingClientRect().width, maxWidth: getComputedStyle(box).maxWidth };
    });
    // maxWidth 是 none（沒設 max-width）時 parseFloat 得 NaN，判定為失敗
    const widePass = Math.abs(wideBar.rightGap) < 1 && Math.abs(wideBar.searchW - parseFloat(wideBar.maxWidth)) < 1;
    ok('topbar：1920px 時搜尋框到了 max-width，右側按鈕仍靠右', widePass,
      widePass ? '' : `右側差 ${Math.round(wideBar.rightGap)}px；搜尋框 ${Math.round(wideBar.searchW)}px，max-width ${wideBar.maxWidth}`);
  } },
];

// ---------- 連結檢查（可選） ----------
async function linkChecks() {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, 'data/sources.js'), 'utf8'), ctx);
  const rows = [];
  let skipped = 0;
  for (const s of ctx.window.SOURCES) {
    if (!s.url) { rows.push(`| ${s.id} | －（無公開連結） | — |`); skipped++; continue; }
    try {
      const r = await fetch(s.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
      rows.push(`| ${s.id} | ${r.status} | ${s.url} |`);
    } catch (e) { rows.push(`| ${s.id} | ERR ${String(e.cause?.code || e.message).slice(0, 40)} | ${s.url} |`); }
  }
  const note = '> 403 表示執行環境無法判定連結是否有效（出口 proxy 或站方 bot 防護），不代表連結失效。\n';
  writeFileSync(join(ROOT, 'link-check.md'), `# 連結檢查 ${new Date().toISOString()}\n\n${note}\n檢查 ${rows.length - skipped} 個 URL，另有 ${skipped} 個來源無公開連結。\n\n| ID | 狀態 | URL |\n|---|---|---|\n${rows.join('\n')}\n`);
  console.log(rows.join('\n'));
}

const args = process.argv.slice(2);
// --only：先檢查參數再做任何事，名稱打錯或與 --static／--links 一起用時以結束碼 2 結束，不啟動瀏覽器
const onlyAt = args.indexOf('--only');
const only = onlyAt >= 0 ? (args[onlyAt + 1] || '').split(',').filter(Boolean) : null;
if (only) {
  const names = SCENARIOS.map(s => s.name);
  const unknown = only.filter(n => !names.includes(n));
  if (args.includes('--static') || args.includes('--links')) { console.error('--only 不能和 --static、--links 一起用'); process.exit(2); }
  if (!only.length || unknown.length) { console.error(`--only 找不到情境：${unknown.join('、') || '（沒有指定名稱）'}；可用的情境：${names.join('、')}`); process.exit(2); }
}
if (!only) staticChecks();
if (!args.includes('--static')) await runBrowserChecks(SCENARIOS, { root: ROOT, only, record: ok });
if (args.includes('--links')) await linkChecks();
const passed = results.filter(r => r.pass).length;
const report = renderReport(results, { mode: args.join(' ') || 'full', at: new Date().toISOString() });
// 只有完整模式（含瀏覽器檢查）寫入 verify-report.md；--static 與 --only 只印結果，不改寫已提交的報告
if (args.includes('--static')) console.log(`\n${passed}/${results.length} 通過（--static 不寫入 verify-report.md）`);
else if (only) console.log(`\n${passed}/${results.length} 通過（--only 不寫入 verify-report.md）`);
else { writeFileSync(join(ROOT, 'verify-report.md'), report); console.log(`\n${passed}/${results.length} 通過 → verify-report.md`); }
process.exit(passed === results.length ? 0 : 1);
