// build-worker.test.mjs — 後端代理建置的測試：兩個嵌入點都要恰好一處
// 後端代理建置（build-worker.mjs）的測試：實際執行 CLI，模板由這裡讀 backend/worker.js 再改字串，寫到暫存目錄傳進去。
// 兩個嵌入點（CORE_PROMPT 佔位字串、import GATE 那一行）都要恰好一處，0 處或 2 處以上就中止，不默默只換第一處。
// 執行：node --test scripts/build-worker.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCorePrompt } from './skill-packages.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = fileURLToPath(new URL('./build-worker.mjs', import.meta.url));
const TEMPLATE = readFileSync(join(ROOT, 'backend/worker.js'), 'utf8');

// 把模板寫進暫存目錄後建置；回傳結束碼、stderr、label（錯誤訊息裡顯示的模板路徑）與產物內容（失敗時是 null）
function build(template) {
  const dir = mkdtempSync(join(tmpdir(), 'pea-build-worker-'));
  try {
    const templatePath = join(dir, 'worker.js');
    const out = join(dir, 'dist.mjs');
    writeFileSync(templatePath, template);
    const r = spawnSync(process.execPath, [SCRIPT, out, templatePath], { encoding: 'utf8' });
    let built = null;
    try { built = readFileSync(out, 'utf8'); } catch {}
    return { status: r.status, stderr: r.stderr, label: relative(ROOT, templatePath) || templatePath, built };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('模板正常時建置成功：CORE_PROMPT 換成核心提示詞，scope-gate.js 內嵌，不留佔位字串與 import', () => {
  const r = build(TEMPLATE);
  assert.equal(r.status, 0, r.stderr);
  const embedded = r.built.match(/^const CORE_PROMPT = (.*);$/m);
  assert.ok(embedded, '產物裡找不到 CORE_PROMPT');
  const md = readFileSync(join(ROOT, 'skills/shared/core-prompt.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(JSON.parse(embedded[1]), extractCorePrompt(md));
  assert.doesNotMatch(r.built, /const CORE_PROMPT = `/);
  assert.doesNotMatch(r.built, /^import GATE from/m);
  assert.match(r.built, /^const GATE = \(\(\) => \{ const module = \{ exports: \{\} \};$/m);
});

test('模板有 2 個 CORE_PROMPT 佔位字串（第二個在另一層 scope）時中止，不只換第一個', () => {
  const r = build(`${TEMPLATE}\nfunction other() { const CORE_PROMPT = \`第二個佔位字串\`; return CORE_PROMPT; }\n`);
  assert.equal(r.status, 1);
  assert.equal(r.stderr, `${r.label} 內必須恰好有一個 CORE_PROMPT 佔位字串（const CORE_PROMPT = \`…\`;），找到 2 個\n`);
  assert.equal(r.built, null);
});

test('模板沒有 CORE_PROMPT 佔位字串時中止', () => {
  const r = build(TEMPLATE.replace('const CORE_PROMPT = `', 'const CORE_PROMPT = String.raw`'));
  assert.equal(r.status, 1);
  assert.equal(r.stderr, `${r.label} 內必須恰好有一個 CORE_PROMPT 佔位字串（const CORE_PROMPT = \`…\`;），找到 0 個\n`);
  assert.equal(r.built, null);
});

test("模板有 2 行 import GATE from '../assets/scope-gate.js'; 時中止", () => {
  const line = "import GATE from '../assets/scope-gate.js';";
  const r = build(TEMPLATE.replace(line, `${line}\n${line}`));
  assert.equal(r.status, 1);
  assert.equal(r.stderr, `${r.label} 內必須恰好有一行 ${line}，找到 2 行\n`);
  assert.equal(r.built, null);
});
