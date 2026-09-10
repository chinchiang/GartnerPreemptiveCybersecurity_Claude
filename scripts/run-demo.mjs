#!/usr/bin/env node
/** 在 Node 中執行網站示範引擎（assets/demo.js）以產生確定性輸出，供文件與驗收對照。
 *  用法：node scripts/run-demo.mjs [--no-intel] [--no-topology] [--inventory 70] [--json]
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
if (args.includes('--no-intel')) params.inputs.threatIntel = false;
if (args.includes('--no-topology')) params.inputs.topology = false;
if (args.includes('--no-identities')) params.inputs.identities = false;
if (args.includes('--no-controls')) params.inputs.controls = false;
const inv = args.indexOf('--inventory'); if (inv >= 0) params.inventoryCompleteness = Number(args[inv + 1]);
const R = ctx.window.DEMO.analyze(ctx.window.CASE_DATA, params);
if (args.includes('--json')) { console.log(JSON.stringify({ findings: R.findings.map(({ asset, ...f }) => ({ ...f, asset_name: asset.name })), hypotheses: R.hypotheses, metrics: R.metrics, missing: R.missingSummary }, null, 2)); process.exit(0); }
console.log('== 曝險優先序 ==');
for (const f of R.findings) console.log(`${f.priority} | ${f.asset.name} | ${f.vuln_id} | score ${f.score} | L ${f.likelihood.toFixed(1)} | I ${f.impact.toFixed(1)} | ${f.confidence} | ${f.factors.join('；')}`);
console.log('\n== 攻擊路徑假設 ==');
const name = (id) => ctx.window.CASE_DATA.assets.find(a => a.asset_id === id)?.name || id;
R.hypotheses.forEach((h, i) => console.log(`${i + 1}. internet → ${h.nodes.map(name).join(' → ')} | hops ${h.hops} | feasibility ${h.feasibility}`));
console.log('\n== 指標 ==');
for (const m of R.metrics) console.log(`${m.name}: ${m.value} (目標 ${m.target})`);
console.log('\n== 缺漏 ==', R.missingSummary.join('；') || '無');
console.log('\n== 驗證計畫 ==');
for (const v of R.validation) console.log(`${v.id} ${v.hypothesis} | ${v.method} | ${v.requires}`);
