/**
 * build-outputs.mjs — 建置的核心：來源檔案進、全部建置產物出的純函式 buildOutputs
 * interface 是純函式 buildOutputs(files)：輸入建置的所有來源 [{ path, content }]（path 相對於 repo、用 /），在記憶體裡先套用
 * 兩種原地改寫（部署指南第 1 節的 scripts/ 那一行、技能包組裝器的產物），再用改寫後的內容產生 data/*.js 與 downloads/ 的 ZIP，
 * 回傳全部建置產物 [{ path, content }]（文字產物是字串，ZIP 是 Buffer）。寫檔交給呼叫端（build-data.mjs），因此不碰磁碟就能測試。
 * 唯一的例外是 inputFilesFrom(root)：照 INPUTS 從磁碟讀出 files，建置與整合檢查（scripts/build-outputs.test.mjs）共用，兩邊的輸入才會相同。
 * 建置需要的來源缺了任何一項都中止，不默默給空值。純 Node 內建模組，無第三方相依。所有輸入只認 LF 換行。
 */
import { join, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { parseFrontmatter } from './frontmatter.mjs';
import { withScriptsLine, scriptFilesFrom } from './deployment-guide.mjs';
import { generatedFiles, packageFiles, sourceFilesFrom } from './skill-packages.mjs';
import { repoReader } from './repo-files.mjs';
import { buildZip } from './zip-util.mjs';

// 建置的來源裡由 inputFilesFrom 自己讀的部分：結尾是 / 的是目錄（底下全部），其餘是單檔。
// skills/ 與 assets/scope-gate.js 由 sourceFilesFrom 讀、scripts/ 的 .mjs 由 scriptFilesFrom 讀，不在這裡；沒列的一律不讀
export const INPUTS = ['docs/research/', 'docs/guides/', 'docs/evidence/', 'examples/synthetic-org/',
  'examples/expected-output.md', 'README.md', 'backend/README.md', 'verify-report.md', 'link-check.md'];

const DEPLOYMENT_GUIDE = 'docs/guides/deployment.md';
const SCRIPT_FILE = /^scripts\/[^/]+\.mjs$/;

// 合成資料的 CSV：第一列是標頭；true／false 轉成布林，整數與小數轉成數字
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter(r => r.length > 1 || (r[0] || '').trim());
  return body.map(r => Object.fromEntries(header.map((h, i) => {
    let v = r[i] ?? '';
    if (v === 'true') v = true; else if (v === 'false') v = false;
    else if (v !== '' && !isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
    return [h, v];
  })));
}
const jsExport = (name, obj) => `// 由 scripts/build-data.mjs 自動產生，請勿手動編輯。\nwindow.${name} = ${JSON.stringify(obj, null, 1)};\n`;
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
// dir 底下的檔案，依路徑排序；rewritten 是原地改寫的結果：同一路徑以改寫後的內容取代，新的路徑加進來
function under(files, dir, rewritten = []) {
  const merged = new Map(files.map(f => [f.path, f]));
  for (const r of rewritten) merged.set(r.path, r);
  return [...merged.values()].filter(f => f.path.startsWith(`${dir}/`)).sort(byPath);
}
const toEntry = (f) => ({ name: f.path, data: Buffer.from(f.content, 'utf8') });

// root：repo 根目錄。讀出 buildOutputs 要的 files：[{ path, content }]，path 相對於 root、用 /，換行正規化成 LF。
// 這是 build-outputs.mjs 唯一讀磁碟的地方，建置與整合檢查共用，兩邊的輸入才會相同
export function inputFilesFrom(root) {
  const { relPosix, readText, walk } = repoReader(root);
  const read = (f) => ({ path: relPosix(f), content: readText(f) });
  const own = INPUTS.flatMap(p => {
    // 每一項都必須存在：不默默略過，跟 buildOutputs 缺單檔時一樣中止
    if (!existsSync(join(root, p))) throw new Error(`建置需要的來源不存在：${p}`);
    return p.endsWith('/') ? walk(join(root, p)).map(read) : [read(join(root, p))];
  });
  const scripts = scriptFilesFrom(root).map(({ name, content }) => ({ path: `scripts/${name}`, content }));
  return [...own, ...sourceFilesFrom(root), ...scripts];
}

// files：[{ path, content }]，path 相對於 repo、用 /。回傳全部建置產物 [{ path, content }]
export function buildOutputs(files) {
  // 建置需要的單檔：找不到就中止，不默默給空字串（網站上的區塊會悄悄變空白）
  const required = (path) => {
    const file = files.find(f => f.path === path);
    if (!file) throw new Error(`建置需要的來源不存在：${path}`);
    return file.content;
  };
  const research = under(files, 'docs/research').filter(f => f.path.endsWith('.md')).map(f => {
    const { meta, body } = parseFrontmatter(f.content);
    const id = posix.basename(f.path, '.md');
    return { id, path: f.path, title: meta.title || id, order: Number(meta.order || 99), summary: meta.summary || '', body };
  }).sort((a, b) => a.order - b.order);

  const scripts = files.filter(f => SCRIPT_FILE.test(f.path)).map(f => ({ name: posix.basename(f.path), content: f.content }));
  const deploymentGuide = { path: DEPLOYMENT_GUIDE, content: withScriptsLine(required(DEPLOYMENT_GUIDE), scripts) };

  const guides = under(files, 'docs/guides', [deploymentGuide]).filter(f => f.path.endsWith('.md')).map(f => {
    const { meta, body } = parseFrontmatter(f.content);
    const id = posix.basename(f.path, '.md');
    return { id, path: f.path, title: meta.title || id, order: Number(meta.order || 99), platform: meta.platform || '', body };
  }).sort((a, b) => a.order - b.order);

  // 技能包組裝器的產物（複本、嵌入區塊、規則說明行、scope-gate.js 的 scope 定義）；data/skills.js 與 ZIP 收的是改寫後的 skills/
  const generated = generatedFiles(files);
  const skillFiles = under(files, 'skills', generated).map(f => {
    const name = posix.basename(f.path);
    // .md 另記 bodyStart（frontmatter 的長度）：網站的渲染檢視從這裡開始，原始碼檢視、複製、下載仍用含 frontmatter 的 content
    const fm = name.endsWith('.md') ? parseFrontmatter(f.content) : null;
    const meta = fm ? fm.meta : {};
    return { path: f.path, platform: f.path.split('/')[1], name, ext: posix.extname(name).slice(1), title: meta.title || '', role: meta.role || '',
             content: f.content, ...(fm && { bodyStart: fm.bodyStart }) };
  });
  const exampleText = (name) => required(`examples/synthetic-org/${name}`);
  const caseData = {
    assets: parseCSV(exampleText('assets.csv')),
    vulnerabilities: parseCSV(exampleText('vulnerabilities.csv')),
    identities: parseCSV(exampleText('identities.csv')),
    misconfigurations: parseCSV(exampleText('misconfigurations.csv')),
    controls: JSON.parse(exampleText('controls.json')),
    threatIntel: JSON.parse(exampleText('threat-intel.json')),
    topology: JSON.parse(exampleText('topology.json')),
    exposures: JSON.parse(exampleText('exposures.json')),
    scope: JSON.parse(exampleText('scope.json')),
    expectedOutput: required('examples/expected-output.md')
  };

  // 其他站上需要的文件（證據檔、README、驗證報告、連結檢查）
  const evidence = under(files, 'docs/evidence').filter(f => f.path.endsWith('.md')).map(f => {
    const id = posix.basename(f.path, '.md');
    const title = (f.content.match(/^#\s+(.*)$/m) || [])[1] || id;
    return { id, path: f.path, title, body: f.content };
  });
  const extra = {
    evidence,
    readme: required('README.md'),
    syntheticReadme: required('examples/synthetic-org/README.md'),
    backendReadme: required('backend/README.md'),
    verifyReport: required('verify-report.md'),
    linkCheck: required('link-check.md')
  };

  const exampleFiles = under(files, 'examples/synthetic-org');
  // 每個技能包 ZIP 的內容由技能包組裝器決定：平臺自己的檔案＋腳本依賴的母本＋合成資料，解壓後即可執行
  const platforms = [...new Set(skillFiles.map(s => s.platform))];
  const platformZips = platforms.map(p => ({ path: `downloads/skills-${p}.zip`, content: buildZip(packageFiles(p, [...skillFiles, ...exampleFiles]).map(toEntry)) }));
  const allEntries = [...skillFiles, ...exampleFiles, { path: 'examples/expected-output.md', content: required('examples/expected-output.md') }].map(toEntry);

  // 內容指紋取代「建置時間」：同一份來源內容永遠產生同一個 manifest，
  // CI 建置後才能要求整份工作樹沒有變動（`git status --porcelain` 必須是空的），守住整個 data/ 目錄。
  // 實際部署時間請看 GitHub Actions 的執行紀錄。
  const contentHash = createHash('sha256').update(JSON.stringify({ research, guides, skillFiles, caseData })).digest('hex').slice(0, 12);
  const manifest = {
    contentHash,
    research: research.map(r => ({ id: r.id, title: r.title, path: r.path })),
    guides: guides.map(g => ({ id: g.id, title: g.title, path: g.path })),
    skills: skillFiles.map(s => ({ path: s.path, platform: s.platform, bytes: Buffer.byteLength(s.content) })),
    downloads: [...platformZips.map(z => z.path), 'downloads/skills-all-platforms.zip', 'downloads/synthetic-example-data.zip']
  };

  return [deploymentGuide, ...generated,
    { path: 'data/research.js', content: jsExport('RESEARCH_DOCS', research) },
    { path: 'data/guides.js', content: jsExport('GUIDE_DOCS', guides) },
    { path: 'data/skills.js', content: jsExport('SKILL_FILES', skillFiles) },
    { path: 'data/case.js', content: jsExport('CASE_DATA', caseData) },
    { path: 'data/extra.js', content: jsExport('EXTRA_DOCS', extra) },
    { path: 'data/manifest.js', content: jsExport('BUILD_MANIFEST', manifest) },
    ...platformZips,
    { path: 'downloads/skills-all-platforms.zip', content: buildZip(allEntries) },
    { path: 'downloads/synthetic-example-data.zip', content: buildZip(exampleFiles.map(toEntry)) }];
}
