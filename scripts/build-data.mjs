#!/usr/bin/env node
/**
 * build-data.mjs — 建置：把 docs/、skills/、examples/ 轉成網站載入的 data/*.js，並產生下載用的 ZIP
 * 將儲存庫內的單一來源內容（docs/、skills/、examples/）轉成網站可直接載入的 data/*.js，
 * 並產生可下載的 ZIP（downloads/）。純 Node 內建模組，無第三方相依。
 *
 * 用法：node scripts/build-data.mjs
 */
import { writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { crc32 } from './zip-util.mjs';
import { packageFiles, generatedFiles, sourceFilesFrom, replaceExactlyOnce } from './skill-packages.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { scriptsLine, SCRIPTS_LINE } from './deployment-guide.mjs';
import { repoReader } from './repo-files.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (p) => join(ROOT, p);
mkdirSync(out('data'), { recursive: true });
mkdirSync(out('downloads'), { recursive: true });

// 走訪目錄、POSIX 路徑與 LF 換行的工具（可重現建置），見 scripts/repo-files.mjs
const { relPosix, readText, walk } = repoReader(ROOT);
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

// ---------- 1. 研究文件 ----------
const researchDir = out('docs/research');
const research = walk(researchDir).filter(f => f.endsWith('.md')).map(f => {
  const { meta, body } = parseFrontmatter(readText(f));
  return { id: basename(f, '.md'), path: relPosix(f), title: meta.title || basename(f, '.md'), order: Number(meta.order || 99), summary: meta.summary || '', body };
}).sort((a, b) => a.order - b.order);
writeFileSync(out('data/research.js'), jsExport('RESEARCH_DOCS', research));

// ---------- 2. 指南文件（安裝／部署／維護） ----------
// 部署指南第 1 節的 scripts/ 清單由各支 .mjs 的檔頭第一行產生（scripts/deployment-guide.mjs），寫回 deployment.md；
// 要在下面讀 docs/guides/ 之前寫回，data/guides.js 才是新版。整份只有那一行以「scripts/ 」開頭，0 行或 2 行以上就中止
const deploymentGuide = out('docs/guides/deployment.md');
const scriptFiles = readdirSync(out('scripts')).filter(f => f.endsWith('.mjs')).map(name => ({ name, content: readText(out(`scripts/${name}`)) }));
writeFileSync(deploymentGuide, replaceExactlyOnce(readText(deploymentGuide), SCRIPTS_LINE, () => scriptsLine(scriptFiles),
  n => `docs/guides/deployment.md 有 ${n} 行以「scripts/ 」開頭，必須恰好一行（第 1 節的 scripts/ 清單），才知道要換哪一行`));
const guidesDir = out('docs/guides');
const guides = existsSync(guidesDir) ? walk(guidesDir).filter(f => f.endsWith('.md')).map(f => {
  const { meta, body } = parseFrontmatter(readText(f));
  return { id: basename(f, '.md'), path: relPosix(f), title: meta.title || basename(f, '.md'), order: Number(meta.order || 99), platform: meta.platform || '', body };
}).sort((a, b) => a.order - b.order) : [];
writeFileSync(out('data/guides.js'), jsExport('GUIDE_DOCS', guides));

// ---------- 3. Skills ----------
const skillsDir = out('skills');
// 先由技能包組裝器從 skills/shared/ 母本產生建置產物（各平臺 references/ 的複本、system-prompt.md 等的嵌入區塊，
// 以及 assets/scope-gate.js 的 scope 定義），下面走訪 skills/ 時拿到的才是最新內容。
// 輸入（整個 skills/ 加上 scope-gate.js）的組法跟 skill-packages.test.mjs 的整合檢查共用 sourceFilesFrom
const sourceFiles = sourceFilesFrom(ROOT);
// 新平臺第一次建置時 references/、scripts/ 還不存在，先建目錄再寫
for (const c of generatedFiles(sourceFiles)) { mkdirSync(dirname(out(c.path)), { recursive: true }); writeFileSync(out(c.path), c.content); }
const skillFiles = walk(skillsDir).map(f => {
  const rel = relPosix(f);
  const platform = rel.split('/')[1];
  const content = readText(f);
  // .md 另記 bodyStart（frontmatter 的長度）：網站的渲染檢視從這裡開始，原始碼檢視、複製、下載仍用含 frontmatter 的 content
  const fm = f.endsWith('.md') ? parseFrontmatter(content) : null;
  const meta = fm ? fm.meta : {};
  return { path: rel, platform, name: basename(f), ext: extname(f).slice(1), title: meta.title || '', role: meta.role || '', content,
           ...(fm && { bodyStart: fm.bodyStart }) };
});
writeFileSync(out('data/skills.js'), jsExport('SKILL_FILES', skillFiles));

// ---------- 4. 合成案例資料 ----------
const exDir = out('examples/synthetic-org');
const caseData = {
  assets: parseCSV(readText(join(exDir, 'assets.csv'))),
  vulnerabilities: parseCSV(readText(join(exDir, 'vulnerabilities.csv'))),
  identities: parseCSV(readText(join(exDir, 'identities.csv'))),
  misconfigurations: parseCSV(readText(join(exDir, 'misconfigurations.csv'))),
  controls: JSON.parse(readText(join(exDir, 'controls.json'))),
  threatIntel: JSON.parse(readText(join(exDir, 'threat-intel.json'))),
  topology: JSON.parse(readText(join(exDir, 'topology.json'))),
  exposures: JSON.parse(readText(join(exDir, 'exposures.json'))),
  scope: JSON.parse(readText(join(exDir, 'scope.json'))),
  expectedOutput: existsSync(out('examples/expected-output.md')) ? readText(out('examples/expected-output.md')) : ''
};
writeFileSync(out('data/case.js'), jsExport('CASE_DATA', caseData));

// ---------- 5. 其他站上需要的文件（證據檔、README、驗證報告、連結檢查） ----------
const readIf = (p) => existsSync(out(p)) ? readText(out(p)) : '';
const evidenceDir = out('docs/evidence');
const evidence = existsSync(evidenceDir) ? walk(evidenceDir).filter(f => f.endsWith('.md')).map(f => {
  const body = readText(f);
  const title = (body.match(/^#\s+(.*)$/m) || [])[1] || basename(f, '.md');
  return { id: basename(f, '.md'), path: relPosix(f), title, body };
}) : [];
const extra = {
  evidence,
  readme: readIf('README.md'),
  syntheticReadme: readIf('examples/synthetic-org/README.md'),
  backendReadme: readIf('backend/README.md'),
  verifyReport: readIf('verify-report.md'),
  linkCheck: readIf('link-check.md')
};
writeFileSync(out('data/extra.js'), jsExport('EXTRA_DOCS', extra));

// ---------- 6. ZIP 下載包（store 模式，無壓縮） ----------
function buildZip(entries) {
  // entries: [{name, data:Buffer}]
  const local = [], central = [];
  let offset = 0;
  // 固定時間戳，讓每次建置產生完全相同的 ZIP（可重現建置，避免重建就弄髒 git 工作樹）
  const dosTime = 0;                                    // 00:00:00
  const dosDate = (((2026 - 1980) << 9) | (1 << 5) | 1) & 0xffff; // 2026-01-01
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = e.data;
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    local.push(lh, name, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + data.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...local, ...central, eocd]);
}
const toEntry = (f) => ({ name: f.path, data: Buffer.from(f.content, 'utf8') });
const exampleFiles = walk(exDir).map(f => ({ path: relPosix(f), content: readText(f) }));
// 每個技能包 ZIP 的內容由技能包組裝器決定：平臺自己的檔案＋腳本依賴的母本＋合成資料，解壓後即可執行
const platforms = [...new Set(skillFiles.map(s => s.platform))];
for (const p of platforms) {
  writeFileSync(out(`downloads/skills-${p}.zip`), buildZip(packageFiles(p, [...skillFiles, ...exampleFiles]).map(toEntry)));
}
const allEntries = [
  ...skillFiles.map(toEntry),
  ...exampleFiles.map(toEntry),
  ...(existsSync(out('examples/expected-output.md')) ? [toEntry({ path: 'examples/expected-output.md', content: readText(out('examples/expected-output.md')) })] : [])
];
writeFileSync(out('downloads/skills-all-platforms.zip'), buildZip(allEntries));
writeFileSync(out('downloads/synthetic-example-data.zip'), buildZip(exampleFiles.map(toEntry)));

// 內容指紋取代「建置時間」：同一份來源內容永遠產生同一個 manifest，
// CI 建置後才能要求整份工作樹沒有變動（`git status --porcelain` 必須是空的），守住整個 data/ 目錄。
// 實際部署時間請看 GitHub Actions 的執行紀錄。
const contentHash = createHash('sha256').update(JSON.stringify({ research, guides, skillFiles, caseData })).digest('hex').slice(0, 12);

const manifest = {
  contentHash,
  research: research.map(r => ({ id: r.id, title: r.title, path: r.path })),
  guides: guides.map(g => ({ id: g.id, title: g.title, path: g.path })),
  skills: skillFiles.map(s => ({ path: s.path, platform: s.platform, bytes: Buffer.byteLength(s.content) })),
  downloads: [...platforms.map(p => `downloads/skills-${p}.zip`), 'downloads/skills-all-platforms.zip', 'downloads/synthetic-example-data.zip']
};
writeFileSync(out('data/manifest.js'), jsExport('BUILD_MANIFEST', manifest));
console.log(`research docs: ${research.length}, guides: ${guides.length}, skill files: ${skillFiles.length}, platforms: ${platforms.join(', ')}`);
