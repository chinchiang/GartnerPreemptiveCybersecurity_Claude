/**
 * output-schema.mjs — 驗證輸出 schema 使用的規則；不支援的關鍵字明確拒絕。
 */
export function outputProblems(value, schema, root = schema, path = '$') {
  const supported = new Set(['$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'required', 'properties', 'items', 'allOf', 'enum', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems']);
  for (const key of Object.keys(schema)) if (!supported.has(key)) throw new Error(`不支援的輸出 schema 規則：${key}`);
  let errors = [];
  if (schema.$ref) errors.push(...outputProblems(value, schema.$ref.slice(2).split('/').reduce((n, k) => n[k], root), root, path));
  for (const node of schema.allOf || []) errors.push(...outputProblems(value, node, root, path));
  const types = { object: v => v !== null && typeof v === 'object' && !Array.isArray(v), array: Array.isArray, string: v => typeof v === 'string', boolean: v => typeof v === 'boolean', number: v => typeof v === 'number' && Number.isFinite(v), integer: Number.isInteger, null: v => v === null };
  const kinds = typeof schema.type === 'string' ? [schema.type] : schema.type || [];
  if (kinds.length && !kinds.some(k => types[k](value))) return [...errors, `${path} 型別不合格`];
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} 不在允許值中`);
  if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) errors.push(`${path} 數值超出範圍`);
  if (typeof value === 'string' && ([...value].length < (schema.minLength ?? 0) || [...value].length > (schema.maxLength ?? Infinity))) errors.push(`${path} 字數不合格`);
  if (Array.isArray(value)) {
    if (value.length < (schema.minItems ?? 0)) errors.push(`${path} 項目不足`);
    value.forEach((item, i) => errors.push(...outputProblems(item, schema.items || {}, root, `${path}[${i}]`)));
  } else if (value !== null && typeof value === 'object') {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} 必填`);
    for (const [key, node] of Object.entries(schema.properties || {})) if (Object.hasOwn(value, key)) errors.push(...outputProblems(value[key], node, root, `${path}.${key}`));
  }
  return errors;
}

const RANK = { P1: 1, P2: 2, P3: 3, P4: 4 };
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
// 與授權範圍守門相同的「至少一個非空白字元」（Python 核心的 NON_BLANK_PATTERN）；不用 \S，兩種語言對 U+FEFF 等字元的判定不同
const NON_BLANK = /[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/;
const nonBlank = (v) => typeof v === 'string' && NON_BLANK.test(v);
const EVIDENCE_FIELDS = ['authorization_reference', 'performed_at', 'result'];

/**
 * 輸出內容一致性（schema 之外的第二層，#148）：分數與分級、參照完整性、驗證狀態要有證據。
 * 形狀不合格的部分略過，交給 outputProblems 回報。與 Python 核心的 output_consistency_problems 逐字相同，
 * 由 tests/fixtures/consistency-cases.json 守住。
 */
export function outputConsistencyProblems(output) {
  if (!isObject(output)) return [];
  const problems = [];
  const block = (key) => (isObject(output[key]) ? output[key] : {});
  const indexed = (key) => (Array.isArray(block(key).items) ? block(key).items.map((item, i) => [i, item]).filter(([, item]) => isObject(item)) : []);

  // 1. 分數與分級：有完整門檻就逐項比對；沒有門檻就檢查分級越高、分數不得越低
  const findings = indexed('exposure_priorities');
  const scored = findings.filter(([, f]) => f.priority in RANK && isNumber(f.score));
  const th = isObject(block('exposure_priorities').thresholds) ? block('exposure_priorities').thresholds : {};
  if (['P1', 'P2', 'P3'].every(k => isNumber(th[k]))) {
    if (!(th.P1 >= th.P2 && th.P2 >= th.P3)) problems.push('$.exposure_priorities.thresholds 門檻須為 P1 ≥ P2 ≥ P3');
    for (const [i, f] of scored) {
      const expected = f.score >= th.P1 ? 'P1' : f.score >= th.P2 ? 'P2' : f.score >= th.P3 ? 'P3' : 'P4';
      if (expected !== f.priority) problems.push(`$.exposure_priorities.items[${i}] 分數 ${f.score} 依門檻應為 ${expected}，卻標為 ${f.priority}`);
    }
  } else {
    for (const [i, high] of scored) for (const [j, low] of scored) {
      if (RANK[high.priority] < RANK[low.priority] && high.score < low.score) {
        problems.push(`$.exposure_priorities.items[${i}] ${high.priority} 的分數 ${high.score} 低於 items[${j}] ${low.priority} 的分數 ${low.score}`);
      }
    }
  }
  // 2. 參照完整性：改善建議指向的發現必須存在
  const ids = new Set(findings.map(([, f]) => f.finding_id));
  for (const [i, r] of indexed('remediation')) {
    if (typeof r.finding_id === 'string' && !ids.has(r.finding_id)) problems.push(`$.remediation.items[${i}].finding_id ${r.finding_id} 不在曝險優先序中`);
  }
  // 3. 驗證狀態：不是 hypothesis 就要附授權驗證的證據
  for (const [i, h] of indexed('attack_path_hypotheses')) {
    if (typeof h.status !== 'string' || h.status === 'hypothesis') continue;
    const evidence = isObject(h.evidence) ? h.evidence : {};
    const missing = EVIDENCE_FIELDS.filter(k => !nonBlank(evidence[k]));
    if (missing.length) problems.push(`$.attack_path_hypotheses.items[${i}] 狀態 ${h.status} 缺少驗證證據：${missing.join('、')}`);
  }
  return problems;
}
