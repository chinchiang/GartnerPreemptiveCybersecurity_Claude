#!/usr/bin/env node
/**
 * build-worker.mjs
 * 把 skills/shared/core-prompt.md 內的 ```text 提示詞區塊嵌入 backend/worker.js 的 CORE_PROMPT，
 * 輸出到 backend/dist/worker.js（已列入 .gitignore，不提交）。這樣代理伺服器使用的系統提示與五平台共用的核心提示詞永遠一致。
 *
 * 用法：node scripts/build-worker.mjs
 * 之後：cd backend && wrangler deploy dist/worker.js（或在 wrangler.toml 指定 main = "dist/worker.js"）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const promptMd = readFileSync(join(ROOT, 'skills/shared/core-prompt.md'), 'utf8');
const m = promptMd.match(/```text\n([\s\S]*?)\n```/);
if (!m) { console.error('找不到 core-prompt.md 內的 ```text 區塊'); process.exit(1); }
const prompt = m[1];

const template = readFileSync(join(ROOT, 'backend/worker.js'), 'utf8');
const marker = /const CORE_PROMPT = `[^`]*`;/;
if (!marker.test(template)) { console.error('backend/worker.js 內找不到 CORE_PROMPT 佔位字串'); process.exit(1); }
// 以 JSON.stringify 轉義，避免提示詞內的反引號或 ${} 破壞模板字串
const built = template.replace(marker, `const CORE_PROMPT = ${JSON.stringify(prompt)};`);

mkdirSync(join(ROOT, 'backend/dist'), { recursive: true });
writeFileSync(join(ROOT, 'backend/dist/worker.js'), built);
console.log(`backend/dist/worker.js 已產生（提示詞 ${prompt.length} 字元）`);
