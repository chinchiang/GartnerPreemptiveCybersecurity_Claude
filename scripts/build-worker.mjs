#!/usr/bin/env node
/**
 * build-worker.mjs
 * 把 skills/shared/core-prompt.md 內的 ```text 提示詞區塊嵌入 backend/worker.js 的 CORE_PROMPT，並把模板 import 的
 * assets/scope-gate.js（授權範圍守門，見 docs/adr/0004）內嵌進去，輸出到 backend/dist/worker.js（已列入 .gitignore，不提交）。
 * 這樣代理伺服器使用的系統提示與五平臺共用的核心提示詞永遠一致，部署的仍是單一檔案。
 *
 * 用法：node scripts/build-worker.mjs [輸出路徑]（預設 backend/dist/worker.js；測試用它建置到暫存目錄）
 * 之後：cd backend && wrangler deploy dist/worker.js（或在 wrangler.toml 指定 main = "dist/worker.js"）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCorePrompt } from './skill-packages.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// 換行正規化為 LF（與 build-data.mjs 的 readText 一致），CRLF 簽出時也能擷取到區塊
const promptMd = readFileSync(join(ROOT, 'skills/shared/core-prompt.md'), 'utf8').replace(/\r\n/g, '\n');
let prompt;
try { prompt = extractCorePrompt(promptMd); } catch (e) { console.error(e.message); process.exit(1); }

const template = readFileSync(join(ROOT, 'backend/worker.js'), 'utf8');
const gateImport = "import GATE from '../assets/scope-gate.js';";
if (template.split(gateImport).length !== 2) { console.error(`backend/worker.js 內必須恰好有一行 ${gateImport}`); process.exit(1); }
// scope-gate.js 在沒有 window 的環境只設定 module.exports；給它一個 module 物件執行，取回 interface
const gateSource = readFileSync(join(ROOT, 'assets/scope-gate.js'), 'utf8').replace(/\r\n/g, '\n');
const gateInline = `const GATE = (() => { const module = { exports: {} };\n${gateSource}\nreturn module.exports; })();`;
const marker = /const CORE_PROMPT = `[^`]*`;/;
if (!marker.test(template)) { console.error('backend/worker.js 內找不到 CORE_PROMPT 佔位字串'); process.exit(1); }
// 以 JSON.stringify 轉義，避免提示詞內的反引號或 ${} 破壞模板字串
const built = template.replace(marker, `const CORE_PROMPT = ${JSON.stringify(prompt)};`).replace(gateImport, () => gateInline);

const output = resolve(process.argv[2] || join(ROOT, 'backend/dist/worker.js'));
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, built);
console.log(`${relative(ROOT, output) || output} 已產生（提示詞 ${prompt.length} 字元）`);
