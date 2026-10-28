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
