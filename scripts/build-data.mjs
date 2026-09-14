#!/usr/bin/env node
/**
 * build-data.mjs
 * 將儲存庫內的單一來源內容（docs/、skills/、examples/）轉成網站可直接載入的 data/*.js，
 * 並產生可下載的 ZIP（downloads/）。純 Node 內建模組，無第三方相依。
 *
 * 用法：node scripts/build-data.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from './zip-util.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (p) => join(ROOT, p);
mkdirSync(out('data'), { recursive: true });
mkdirSync(out('downloads'), { recursive: true });

// 以下三個工具讓建置在 Windows 與 Linux 上產生位元組相同的結果（可重現建置）：
// relPosix：路徑一律用 /，避免 Windows 的 \ 漏進 data/*.js 與 ZIP 檔名
const relPosix = (f) => relative(ROOT, f).split('\\').join('/');
// readText：換行一律正規化為 LF，避免 CRLF 簽出時內容與 ZIP 位元組改變
const readText = (f) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
// cmpPosix：以正規化後的路徑排序，讓兩個平台的檔案順序一致
const cmpPosix = (a, b) => { const x = relPosix(a), y = relPosix(b); return x < y ? -1 : x > y ? 1 : 0; };

function walk(dir) {
  const res = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) res.push(...walk(p));
    else res.push(p);
  }
  return res.sort(cmpPosix);
}
function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return { meta, body: md.slice(m[0].length) };
}
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
const guidesDir = out('docs/guides');
const guides = existsSync(guidesDir) ? walk(guidesDir).filter(f => f.endsWith('.md')).map(f => {
  const { meta, body } = parseFrontmatter(readText(f));
  return { id: basename(f, '.md'), path: relPosix(f), title: meta.title || basename(f, '.md'), order: Number(meta.order || 99), platform: meta.platform || '', body };
}).sort((a, b) => a.order - b.order) : [];
writeFileSync(out('data/guides.js'), jsExport('GUIDE_DOCS', guides));

// ---------- 3. Skills ----------
const skillsDir = out('skills');
const skillFiles = walk(skillsDir).map(f => {
  const rel = relPosix(f);
  const platform = rel.split('/')[1];
  const content = readText(f);
  const { meta } = f.endsWith('.md') ? parseFrontmatter(content) : { meta: {} };
  return { path: rel, platform, name: basename(f), ext: extname(f).slice(1), title: meta.title || '', role: meta.role || '', content };
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

// ---------- 5. ZIP 下載包（store 模式，無壓縮） ----------
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
const platforms = [...new Set(skillFiles.map(s => s.platform))];
for (const p of platforms) {
  const entries = skillFiles.filter(s => s.platform === p).map(s => ({ name: s.path, data: Buffer.from(s.content, 'utf8') }));
  writeFileSync(out(`downloads/skills-${p}.zip`), buildZip(entries));
}
const allEntries = [
  ...skillFiles.map(s => ({ name: s.path, data: Buffer.from(s.content, 'utf8') })),
  ...walk(exDir).map(f => ({ name: relPosix(f), data: Buffer.from(readText(f), 'utf8') })),
  ...(existsSync(out('examples/expected-output.md')) ? [{ name: 'examples/expected-output.md', data: Buffer.from(readText(out('examples/expected-output.md')), 'utf8') }] : [])
];
writeFileSync(out('downloads/skills-all-platforms.zip'), buildZip(allEntries));
const exampleEntries = walk(exDir).map(f => ({ name: relPosix(f), data: Buffer.from(readText(f), 'utf8') }));
writeFileSync(out('downloads/synthetic-example-data.zip'), buildZip(exampleEntries));

const manifest = {
  builtAt: new Date().toISOString(),
  research: research.map(r => ({ id: r.id, title: r.title, path: r.path })),
  guides: guides.map(g => ({ id: g.id, title: g.title, path: g.path })),
  skills: skillFiles.map(s => ({ path: s.path, platform: s.platform, bytes: Buffer.byteLength(s.content) })),
  downloads: [...platforms.map(p => `downloads/skills-${p}.zip`), 'downloads/skills-all-platforms.zip', 'downloads/synthetic-example-data.zip']
};
writeFileSync(out('data/manifest.js'), jsExport('BUILD_MANIFEST', manifest));
console.log(`research docs: ${research.length}, guides: ${guides.length}, skill files: ${skillFiles.length}, platforms: ${platforms.join(', ')}`);
