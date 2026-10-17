/* 授權範圍守門的 JS schema 解讀（見 GLOSSARY.md「授權範圍守門」、docs/adr/0004）。
   規則只來自 skills/shared/input-schema.json 的 scope 定義：建置把它以嵌入區塊寫在下面，這個檔案本身就帶著規則，
   瀏覽器（file://）、Node 的 require／vm 與選用後端代理都不用另外供應 schema。
   示範引擎（assets/demo.js）與選用後端代理（backend/worker.js）共用；Python 分析工作流程核心是另一份對等的解讀。 */
(function () {
  // 以下區塊由 scripts/build-data.mjs 從 skills/shared/input-schema.json 的 properties.scope 產生，請改母本後執行 npm run build，勿手動編輯
  const SCOPE_SCHEMA = {
    "type": "object",
    "required": [
      "organization",
      "analysis_date",
      "authorized_scope",
      "reporting"
    ],
    "properties": {
      "organization": {
        "type": "string",
        "minLength": 1,
        "pattern": "[^\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]"
      },
      "analysis_date": {
        "type": "string",
        "minLength": 1,
        "format": "date"
      },
      "authorized_scope": {
        "type": "object",
        "required": [
          "in_scope_assets",
          "active_testing_authorized",
          "external_scanning_authorized"
        ],
        "properties": {
          "in_scope_assets": {
            "type": "array",
            "items": {
              "type": "string",
              "pattern": "[^\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]"
            },
            "minItems": 1
          },
          "excluded": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "active_testing_authorized": {
            "type": "boolean"
          },
          "external_scanning_authorized": {
            "type": "boolean"
          },
          "authorizer": {
            "type": "string"
          },
          "authorization_reference": {
            "type": "string"
          }
        }
      },
      "risk_appetite": {
        "type": "object"
      },
      "reporting": {
        "type": "object",
        "required": [
          "audience"
        ],
        "properties": {
          "audience": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "string",
              "pattern": "[^\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]"
            }
          },
          "language": {
            "type": "string",
            "default": "zh-TW"
          },
          "mask_identifiers": {
            "type": "boolean",
            "default": true
          },
          "cadence": {
            "type": "string"
          }
        }
      }
    }
  };

  const join = (prefix, key) => (prefix ? `${prefix}.${key}` : key);

  /** 必填的末端欄位與它們的 schema 節點 [[路徑, 節點]]（物件往下展開其 required），順序同 schema。 */
  function requiredLeafNodes(node, prefix) {
    if (node.type !== 'object' || !node.required) return [[prefix, node]];
    return node.required.flatMap(key => requiredLeafNodes((node.properties || {})[key] || {}, join(prefix, key)));
  }
  const requiredLeaves = (node, prefix) => requiredLeafNodes(node, prefix).map(([path]) => path);

  // 兩份解讀（這裡與 Python 核心）只認得同一組關鍵字；註記關鍵字不影響判定，放行
  const RULE_KEYWORDS = ['type', 'required', 'properties', 'minLength', 'minItems', 'format', 'pattern', 'items'];
  const NOTE_KEYWORDS = ['default', 'description', 'title', '$comment'];

  /** 整個節點（含 properties、items 底下）只能用認得的關鍵字，format 只支援 date；否則丟出錯誤，避免規則被默默略過。 */
  function assertSupported(node, path) {
    for (const key of Object.keys(node)) {
      if (!RULE_KEYWORDS.includes(key) && !NOTE_KEYWORDS.includes(key)) {
        throw new Error(`授權範圍守門不認得 schema 關鍵字 ${key}（${path || 'scope'}）；兩份解讀都要實作它，見 docs/adr/0004`);
      }
    }
    if ('format' in node && node.format !== 'date') {
      throw new Error(`授權範圍守門不支援 schema 關鍵字 format: ${node.format}（${path || 'scope'}），只支援 date；見 docs/adr/0004`);
    }
    for (const [key, child] of Object.entries(node.properties || {})) assertSupported(child, join(path, key));
    if (node.items) assertSupported(node.items, path);
  }

  const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
  const TYPE_CHECKS = {
    string: (v) => typeof v === 'string',
    boolean: (v) => typeof v === 'boolean',
    array: (v) => Array.isArray(v),
    object: isPlainObject,
    integer: (v) => Number.isInteger(v),
    number: (v) => typeof v === 'number'
  };

  // RFC 3339 full-date（format: date）：恰好 YYYY-MM-DD，而且是存在的日期。不用 Date：它會把 2026-02-30 換算成 3 月 2 日；
  // 年份從 1 起算，與 Python 的 date 一致
  const isFullDate = (s) => {
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
    if (!m) return false;
    const [y, mo, d] = m.slice(1).map(Number);
    const days = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return y >= 1 && mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo - 1];
  };

  // 與 Python 核心的 _check 對等：缺少或型別不對時回報底下所有必填末端欄位；字串長度以 Unicode 碼位計算（同 Python 的 len）；
  // pattern 不錨定（JSON Schema 的語意）；陣列任一項目不合格就回報陣列欄位本身
  function check(value, node, path) {
    if (value === undefined || value === null) return requiredLeaves(node, path);
    const type = node.type;
    if (type && TYPE_CHECKS[type] && !TYPE_CHECKS[type](value)) return requiredLeaves(node, path);
    if (type === 'string') {
      if ([...value].length < (node.minLength || 0)) return [path];
      if (node.format === 'date' && !isFullDate(value)) return [path];
      if ('pattern' in node && !new RegExp(node.pattern).test(value)) return [path];
    }
    if (type === 'array') {
      if (value.length < (node.minItems || 0)) return [path];
      if (node.items && value.some(item => check(item, node.items, path).length)) return [path];
    }
    if (type === 'object') {
      const own = (key) => (Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined);
      return (node.required || []).flatMap(key => check(own(key), (node.properties || {})[key] || {}, join(path, key)));
    }
    return [];
  }

  /** 依 schema 節點檢查一個值，回傳缺少或不合格的欄位路徑（空陣列＝合格）。 */
  function problemsAgainst(value, node, path = '') {
    assertSupported(node, path);
    return check(value, node, path);
  }

  /** 授權範圍守門：回傳缺少或不合格的必填欄位路徑；scope 不是物件時回報全部必填欄位（同 Python 的 scope_problems）。 */
  const scopeProblems = (scope) => problemsAgainst(isPlainObject(scope) ? scope : {}, SCOPE_SCHEMA);

  /** 授權範圍的必填欄位，順序與 Python 的 required_scope_fields 相同。 */
  const requiredScopeFields = () => requiredLeaves(SCOPE_SCHEMA, '');

  // schema 的「至少一個非空白字元」（與 Python 核心的 NON_BLANK_PATTERN 相同），規則說明寫成「非空白」
  const NON_BLANK_PATTERN = '[^\\u0009-\\u000d\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]';

  /** 一個必填欄位的 schema 節點寫成給人看的規則（與 Python 核心的 _rule_text 相同）。說明必須涵蓋節點的每一條規則：
      寫不出來的就丟出錯誤，不退回比較寬鬆的說明——模型側守門只看得到這段說明（見 docs/adr/0005）。 */
  function ruleText(node, path) {
    const unsupported = (keyword) => {
      throw new Error(`授權範圍的規則說明寫不出 schema 關鍵字 ${keyword}（${path}）；兩份規則說明都要實作它，見 docs/adr/0005`);
    };
    if (node.type === 'string') {
      if (node.minLength > 1) unsupported(`minLength: ${node.minLength}`);
      if (node.format === 'date') return 'pattern' in node ? unsupported('pattern') : '須為 YYYY-MM-DD 的有效日期';
      if ('pattern' in node) return node.pattern === NON_BLANK_PATTERN ? '須含非空白字元' : unsupported('pattern');
      return node.minLength ? '須為非空字串' : '須為字串';
    }
    if (node.type === 'array') {
      if (node.minItems > 1) unsupported(`minItems: ${node.minItems}`);
      return (node.minItems ? '須為非空陣列' : '須為陣列') + (node.items ? itemsText(node.items, unsupported) : '');
    }
    if (node.type === 'boolean') return '須為布林值';
    if (node.type === undefined) return '須提供';
    return unsupported(`type: ${node.type}`);
  }
  function itemsText(items, unsupported) {
    if (items.type !== 'string') unsupported('items');
    if (items.minLength > 1) unsupported(`minLength: ${items.minLength}`);
    if ('format' in items) unsupported('format');
    if ('pattern' in items) return items.pattern === NON_BLANK_PATTERN ? '，且每項為非空白字串' : unsupported('pattern');
    return items.minLength ? '，且每項為非空字串' : '，且每項為字串';
  }

  /** 依 scope 定義寫出規則說明：規則相同的欄位併成一組，欄位只寫最後一段名稱（與 Python 的 scope_rule_note 相同，不加括號）。 */
  function ruleNoteAgainst(node) {
    assertSupported(node, ''); // 守門不認得的關鍵字，說明也寫不出來：先擋下，不讓建置寫出比較寬鬆的規則說明行
    const groups = new Map();
    for (const [path, leaf] of requiredLeafNodes(node, '')) {
      const rule = ruleText(leaf, path);
      groups.set(rule, [...(groups.get(rule) || []), path.split('.').pop()]);
    }
    return [...groups].map(([rule, names]) => `${names.join('、')} ${rule}`).join('；');
  }

  /** 模型側守門的規則說明（嵌入的 scope 定義寫成給人看的句子；建置把它寫進核心提示詞，見 docs/adr/0005）。 */
  const scopeRuleNote = () => ruleNoteAgainst(SCOPE_SCHEMA);

  /** 嵌入的 scope 定義（複本，改了也不影響守門）。 */
  const scopeSchema = () => JSON.parse(JSON.stringify(SCOPE_SCHEMA));

  const api = { scopeProblems, requiredScopeFields, problemsAgainst, scopeSchema, scopeRuleNote, ruleNoteAgainst };
  if (typeof window !== 'undefined') window.SCOPE_GATE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
