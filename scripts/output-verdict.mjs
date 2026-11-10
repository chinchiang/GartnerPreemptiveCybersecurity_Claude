/**
 * output-verdict.mjs — 輸出判定：模型輸出依序對照 output schema、內容一致性與分數表（#275）；schema 不支援的關鍵字明確拒絕。
 * 沒有 import、只用 export function 宣告：scripts/build-worker.mjs 拿掉 export 後內嵌進後端代理。
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

  // 1. 分數與分級：依門檻逐項比對。門檻是輸出 schema 的必填（P1、P2、P3 三個數字，#163），缺少或格式不對由 outputProblems 回報，
  //    這裡略過；不退回只比大小順序（抓不到整體偏移，例如 72 分與 65 分都標成 P2）
  const findings = indexed('exposure_priorities');
  const scored = findings.filter(([, f]) => f.priority in RANK && isNumber(f.score));
  const th = isObject(block('exposure_priorities').thresholds) ? block('exposure_priorities').thresholds : {};
  if (['P1', 'P2', 'P3'].every(k => isNumber(th[k]))) {
    if (!(th.P1 >= th.P2 && th.P2 >= th.P3)) problems.push('$.exposure_priorities.thresholds 門檻須為 P1 ≥ P2 ≥ P3');
    for (const [i, f] of scored) {
      const expected = f.score >= th.P1 ? 'P1' : f.score >= th.P2 ? 'P2' : f.score >= th.P3 ? 'P3' : 'P4';
      if (expected !== f.priority) problems.push(`$.exposure_priorities.items[${i}] 分數 ${f.score} 依門檻應為 ${expected}，卻標為 ${f.priority}`);
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

/**
 * 模型輸出跟分數表的對照（#247，#275 從示範引擎搬來）：後端代理收到模型的回應後用它判斷模型有沒有照用分數表。
 * exposure_priorities.items 的每一項以 finding_id 對照 table.findings：priority 不同、score 不同或不是有限數字算 mismatch，
 * finding_id 不在表裡算 not_in_table；表裡有、輸出沒列的不算；形狀不合格的部分略過（交給 schema 驗證，#252）。
 * 回傳 [{ index, finding_id, kind, expected?, got }]，got 裡沒有的欄位寫 null。
 * Python 核心的 score_table_problems 是同一條規則，由共用案例 tests/fixtures/score-problems-cases.json 守住。
 */
export function scoreTableProblems(output, table) {
  // 輸出不是物件、exposure_priorities 不是物件時，取 .items 都是 undefined，一樣當成沒有項目
  const items = Array.isArray(output?.exposure_priorities?.items) ? output.exposure_priorities.items : [];
  const expected = new Map(table.findings.map(f => [f.finding_id, f]));
  const problems = [];
  items.forEach((item, index) => {
    // 不是物件的項目（null、數字、字串、陣列）都沒有字串的 finding_id，一併略過
    if (typeof item?.finding_id !== 'string') return;
    const got = { priority: item.priority ?? null, score: item.score ?? null };
    const want = expected.get(item.finding_id);
    if (!want) problems.push({ index, finding_id: item.finding_id, kind: 'not_in_table', got });
    // 分數表的 score 一定是有限數字，!== 不轉型：字串、布林值、缺少都算不同（Python 的 != 會把 True 當成 1，所以那邊另外檢查是不是數字）
    else if (item.priority !== want.priority || item.score !== want.score) {
      problems.push({ index, finding_id: item.finding_id, kind: 'mismatch', expected: { priority: want.priority, score: want.score }, got });
    }
  });
  return problems;
}

/**
 * 輸出判定（GLOSSARY.md）：解析後的輸出依序對照 output schema、內容一致性與分數表，第一個失敗的就是結果。
 * 通過回傳 null；失敗回傳 { kind, problems }，kind 是 output_schema_invalid、output_inconsistent 或 score_table_mismatch，
 * 前兩種的 problems 是字串陣列，score_table_mismatch 是 scoreTableProblems 的結構化紀錄。table 是 null 時不對照分數表。
 * schema 驗證是遞迴的，巢狀太深時會超過呼叫堆疊而丟出例外；schema 用了不支援的關鍵字也會丟出例外，這裡都不攔。
 * Python 核心的 output_verdict 是同一個判定，由共用案例 tests/fixtures/verdict-cases.json 守住。
 */
export function outputVerdict(output, schema, table) {
  let problems = outputProblems(output, schema);
  if (problems.length) return { kind: 'output_schema_invalid', problems };
  problems = outputConsistencyProblems(output);
  if (problems.length) return { kind: 'output_inconsistent', problems };
  if (!table) return null;
  problems = scoreTableProblems(output, table);
  return problems.length ? { kind: 'score_table_mismatch', problems } : null;
}
