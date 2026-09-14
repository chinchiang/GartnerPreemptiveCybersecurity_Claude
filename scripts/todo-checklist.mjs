#!/usr/bin/env node
/**
 * todo-checklist.mjs — 把 data/sources.js 的 TODO_ITEMS 印成 Markdown 勾選清單。
 *
 *   node scripts/todo-checklist.mjs            # 只列 pending
 *   node scripts/todo-checklist.mjs --all      # 連 done 一起列
 *
 * 用途：.github/workflows/quarterly-review.yml 每季開 issue 時的內容；本機也可直接執行。
 * 資料以 <script> 形式提供給瀏覽器，因此這裡用 vm 執行取得 window.TODO_ITEMS。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: {} });
vm.runInContext(readFileSync(join(ROOT, 'data/sources.js'), 'utf8'), ctx);
const items = ctx.window.TODO_ITEMS || [];
const all = process.argv.includes('--all');

const pending = items.filter(t => t.status !== 'done');
const done = items.filter(t => t.status === 'done');

console.log(`共 ${pending.length} 項待查證（另有 ${done.length} 項已完成）。清單來源：\`data/sources.js\` 的 \`TODO_ITEMS\`。\n`);
for (const t of pending) {
  console.log(`- [ ] **${t.item}**`);
  console.log(`  - 為何待驗證：${t.why}`);
  console.log(`  - 下一步：${t.how}`);
}
if (all && done.length) {
  console.log('\n### 已完成（紀錄）\n');
  for (const t of done) console.log(`- [x] **${t.item}**（${t.resolvedAt}）`);
}
console.log('\n查證完成後：更新 `data/sources.js`（改 `status` 為 `done` 並填 `resolvedAt`，必要時同步 `docs/` 的敘述），執行 `npm run build && npm run verify:static` 後提交。');
