#!/usr/bin/env node
/** 在 Node 中執行網站示範引擎（assets/demo.js）以產生確定性輸出，供文件與驗收對照。
 *  用法：node scripts/run-demo.mjs [--no-intel] [--no-topology] [--no-identities] [--no-controls] [--no-misconfig] [--no-epss] [--no-exposures]
 *                                  [--no-scope] [--inventory 70] [--appetite strict|balanced|tolerant] [--json]
 *  --json 輸出符合 skills/shared/output-schema.json 的 JSON；--no-scope 模擬缺少授權範圍（驗收第 7 項）。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {} };
vm.createContext(ctx);
for (const f of ['data/case.js', 'assets/demo.js']) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx);
const args = process.argv.slice(2);
const params = { inputs: {}, inventoryCompleteness: 100, riskAppetite: 'balanced' };
const flags = { '--no-intel': 'threatIntel', '--no-topology': 'topology', '--no-identities': 'identities', '--no-controls': 'controls', '--no-misconfig': 'misconfig', '--no-epss': 'epss', '--no-exposures': 'exposures' };
for (const [flag, key] of Object.entries(flags)) if (args.includes(flag)) params.inputs[key] = false;
const inv = args.indexOf('--inventory'); if (inv >= 0) params.inventoryCompleteness = Number(args[inv + 1]);
const app = args.indexOf('--appetite'); if (app >= 0) params.riskAppetite = args[app + 1];
const data = args.includes('--no-scope') ? { ...ctx.window.CASE_DATA, scope: undefined } : ctx.window.CASE_DATA;
const R = ctx.window.DEMO.analyze(data, params);
if (args.includes('--json')) { console.log(JSON.stringify(ctx.window.DEMO.toSchema(R, data, 'demo-engine (scripts/run-demo.mjs) / skill 1.0.0'), null, 2)); process.exit(0); }
if (R.refused) {
  console.log('== 拒絕分析 ==');
  console.log(R.reason);
  console.log('缺少欄位：', R.missingFields.join('、'));
  console.log('必要欄位：', R.requiredFields.join('、'));
  process.exit(2);
}
console.log('== 曝險優先序 ==');
for (const f of R.findings) console.log(`${f.priority} | ${f.asset.name} | ${f.vuln_id} | score ${f.score} | L ${f.likelihood.toFixed(1)} | I ${f.impact.toFixed(1)} | ${f.confidence} | ${f.factors.join('；')}`);
console.log('\n== 攻擊路徑假設（status: hypothesis） ==');
const name = (id) => data.assets.find(a => a.asset_id === id)?.name || id;
R.hypotheses.forEach((h, i) => console.log(`${i + 1}. internet → ${h.nodes.map(name).join(' → ')} | hops ${h.hops} | feasibility ${h.feasibility} | ${h.status}`));
console.log('\n== 指標 ==');
for (const m of R.metrics) console.log(`${m.name}: ${m.value} (目標 ${m.target})`);
console.log('\n== 缺漏 ==', R.missingSummary.join('；') || '無');
console.log('\n== 驗證計畫 ==');
for (const v of R.validation) console.log(`${v.id} ${v.hypothesis} | ${v.method} | ${v.requires}`);
console.log('\n== 管理摘要（O5） ==');
console.log(R.summary.header);
console.log(R.summary.text);
console.log(`（正文 ${R.summary.length} 字；規格 ≤ 300）`);
