#!/usr/bin/env node
/**
 * check-acceptance.mjs — 對「真實模型輸出」執行可機器判定的驗收項目。
 *
 *   node scripts/check-acceptance.mjs output/chatgpt-output.json
 *   node scripts/check-acceptance.mjs output/chatgpt-output.json --variant no-intel
 *   node scripts/check-acceptance.mjs output/chatgpt-output.json --json
 *
 * 對應 skills/claude/preemptive-exposure-analysis/references/acceptance.md 的 7 項驗收：
 *   1–5   baseline 變體（本腳本檢查）
 *   6     no-intel 變體（本腳本檢查）
 *   7     移除 scope.json 應拒絕分析 —— 由呼叫端檢查腳本是否以非零狀態結束，本腳本不處理
 *
 * 刻意不檢查的部分（需要人工判讀，見 docs/evidence/model-acceptance-template.md）：
 *   摘要的中文品質與可讀性、改善建議是否合理、補償控制與核准層級是否恰當、遮罩是否足夠。
 *
 * 本腳本只讀 JSON，不呼叫任何 API、不需要金鑰。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const variant = (args[args.indexOf('--variant') + 1] && args.includes('--variant')) ? args[args.indexOf('--variant') + 1] : 'baseline';
const asJson = args.includes('--json');

if (!file) {
  console.error('用法：node scripts/check-acceptance.mjs <output.json> [--variant baseline|no-intel] [--json]');
  process.exit(2);
}

const results = [];
const ok = (id, name, pass, detail = '') => results.push({ id, name, pass, detail: String(detail) });

let obj;
try { obj = JSON.parse(readFileSync(file, 'utf8')); }
catch (e) { console.error(`無法解析 ${file}：${e.message}`); process.exit(2); }

// ---------- 0. 結構：頂層必要鍵與每個區塊的證據欄位 ----------
const schema = JSON.parse(readFileSync(join(ROOT, 'skills/shared/output-schema.json'), 'utf8'));
const missingTop = (schema.required || []).filter(k => !(k in obj));
ok('0a', '頂層鍵齊全（output-schema.json required）', missingTop.length === 0, missingTop.length ? `缺：${missingTop.join(', ')}` : `${(schema.required || []).length} 個鍵`);

const BLOCK_FIELDS = ['confidence', 'basis', 'missing_inputs', 'requires_human'];
const blockKeys = (schema.required || []).filter(k => k !== 'meta');
const badBlocks = blockKeys.filter(k => {
  const b = obj[k];
  return !b || typeof b !== 'object' || BLOCK_FIELDS.some(f => !(f in b));
});
ok('0b', '每個區塊都有 confidence／basis／missing_inputs／requires_human', badBlocks.length === 0, badBlocks.length ? `不完整：${badBlocks.join(', ')}` : '');

// ---------- 1. 資料品質：9 個檔案的筆數 ----------
const EXPECTED_RECORDS = { assets: 12, vulnerabilities: 14, identities: 8, misconfigurations: 9, controls: 8, exposures: 7 };
const files = obj.data_quality?.files || [];
const recordOf = (key) => {
  const hit = files.find(f => String(f.name || '').toLowerCase().includes(key));
  return hit ? hit.records : undefined;
};
const recordMismatch = Object.entries(EXPECTED_RECORDS)
  .map(([k, want]) => [k, want, recordOf(k)])
  .filter(([, want, got]) => got !== want);
ok('1', '驗收 1：資料品質回報 9 個檔案且筆數正確', files.length >= 9 && recordMismatch.length === 0,
  recordMismatch.length ? recordMismatch.map(([k, want, got]) => `${k} 期望 ${want} 得到 ${got ?? '未回報'}`).join('；') : `${files.length} 個檔案`);

// ---------- 2. vpn-gw-01 / SYN-2026-0101 為 P1 且含四項依據 ----------
const findings = obj.exposure_priorities?.items || [];
const vpn = findings.find(f => String(f.vuln_id).includes('SYN-2026-0101'));
// 依據用寬鬆關鍵字比對：模型的用字會有差異，但概念必須出現。
const FACTOR_KEYS = [
  { label: '對外曝露', re: /對外|外部曝[露险]|internet[- ]?exposed/i },
  { label: '公開利用程式', re: /利用程式|exploit|PoC/i },
  { label: 'KEV', re: /KEV|已知遭利用|known exploited/i },
  { label: '威脅情資', re: /情資|threat intel|SYNTHETIC-GROUP-ALPHA/i }
];
const vpnFactors = (vpn?.factors || []).join('；');
const missingFactors = FACTOR_KEYS.filter(k => !k.re.test(vpnFactors)).map(k => k.label);
ok('2', '驗收 2：vpn-gw-01/SYN-2026-0101 為 P1 且含四項依據',
  !!vpn && vpn.priority === 'P1' && String(vpn.asset_id || vpn.asset_name).includes('vpn-gw-01') && missingFactors.length === 0,
  !vpn ? '找不到該發現' : `${vpn.priority} score ${vpn.score}${missingFactors.length ? `；缺依據：${missingFactors.join('、')}` : ''}`);

// ---------- 3. 攻擊路徑假設 ----------
const paths = obj.attack_path_hypotheses?.items || [];
const CHAIN = ['vpn-gw-01', 'ad-dc-01', 'erp-db-01'];
const chainPath = paths.find(p => {
  const seq = (p.nodes || []).map(String);
  let i = 0;
  for (const n of seq) if (n.includes(CHAIN[i])) i++;
  return i === CHAIN.length;
});
ok('3', '驗收 3：存在 internet → vpn-gw-01 → ad-dc-01 → erp-db-01 且為 hypothesis',
  !!chainPath && chainPath.status === 'hypothesis',
  chainPath ? `${chainPath.id} feasibility ${chainPath.feasibility} status ${chainPath.status}` : `${paths.length} 條路徑中找不到該鏈`);
ok('3b', '所有攻擊路徑的 status 均為 hypothesis', paths.length > 0 && paths.every(p => p.status === 'hypothesis'),
  paths.filter(p => p.status !== 'hypothesis').map(p => p.id).join(',') || `${paths.length} 條`);

// ---------- 4. 驗證計畫的授權標示 ----------
const plan = obj.validation_plan?.items || [];
const unflagged = plan.filter(v => !/尚未授權/.test(String(v.authorization_required || '')));
ok('4', '驗收 4：驗證計畫每項標「尚未授權主動測試」', plan.length > 0 && unflagged.length === 0,
  plan.length === 0 ? '驗證計畫為空' : (unflagged.length ? `未標示：${unflagged.map(v => v.id).join(',')}` : `${plan.length} 項`));

// ---------- 5. 管理摘要 ----------
const summary = String(obj.executive_summary?.text || '');
const decisions = obj.executive_summary?.decisions_requested || [];
ok('5a', '驗收 5：管理摘要 ≤ 300 字', summary.length > 0 && summary.length <= 300, `${summary.length} 字`);
ok('5b', '驗收 5：管理摘要含決策請求與限制', (decisions.length > 0 || /決策/.test(summary)) && /限制|未驗證|假設/.test(summary),
  `decisions_requested ${decisions.length} 項`);

// ---------- 6. no-intel 變體 ----------
if (variant === 'no-intel') {
  const declared = JSON.stringify(obj.exposure_priorities?.missing_inputs || []) + JSON.stringify(obj.data_quality?.missing_inputs || []);
  ok('6a', '驗收 6：輸出明確標示未納入威脅情資', /情資|threat[- ]?intel/i.test(declared), declared.slice(0, 120));
  const conf = String(obj.exposure_priorities?.confidence || '');
  ok('6b', '驗收 6：曝險優先序的信心不再是「高」', conf !== '' && !/^高|^high/i.test(conf), `confidence=${conf || '未提供'}`);
  ok('6c', '驗收 6：SYN-2026-0101 仍為 P1', vpn?.priority === 'P1', vpn ? `${vpn.priority} score ${vpn.score}` : '找不到');
}

// ---------- 輸出 ----------
const passed = results.filter(r => r.pass).length;
if (asJson) {
  console.log(JSON.stringify({ file, variant, passed, total: results.length, results }, null, 2));
} else {
  console.log(`驗收檢查：${file}（變體 ${variant}）\n`);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  console.log(`\n${passed}/${results.length} 通過`);
}
process.exit(passed === results.length ? 0 : 1);
