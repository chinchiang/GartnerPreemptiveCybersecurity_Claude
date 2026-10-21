// 技能包組裝器的單元測試：只用 node:test，母本以記憶體中的字串提供，不碰磁碟。
// 執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCorePrompt, packageFiles, generatedFiles, RULE_NOTE_TARGETS } from './skill-packages.mjs';

test('從核心提示詞母本擷取 ```text 區塊的內容', () => {
  const md = [
    '---',
    'title: 核心提示詞',
    '---',
    '',
    '# 說明',
    '',
    '```text',
    '你是先制型曝險分析助理。',
    '第 0 節：授權範圍。',
    '```',
    '',
    '其餘說明。',
    ''
  ].join('\n');
  assert.equal(extractCorePrompt(md), '你是先制型曝險分析助理。\n第 0 節：授權範圍。');
});

test('母本沒有 ```text 區塊時中止，錯誤訊息指出缺的是哪個區塊', () => {
  const md = '# 核心提示詞\n\n```markdown\n不是 text 區塊\n```\n';
  assert.throws(() => extractCorePrompt(md), { message: /找不到 .*```text 區塊/ });
});

test('只取第一個 ```text 區塊，不會延伸到後面的程式碼區塊', () => {
  const md = '```text\n第一段提示詞\n```\n\n範例：\n\n```json\n{"a": 1}\n```\n';
  assert.equal(extractCorePrompt(md), '第一段提示詞');
});

// 假的 repo 檔案清單：路徑＋內容，模擬 build-data 讀進來的 skills/ 與 examples/synthetic-org/
const repo = [
  'examples/synthetic-org/assets.csv',
  'examples/synthetic-org/scope.json',
  'skills/claude/preemptive-exposure-analysis/SKILL.md',
  'skills/chatgpt/api-workflow.py',
  'skills/claude/preemptive-exposure-analysis/scripts/validate_inputs.py',
  'skills/deepseek/api-workflow.py',
  'skills/glm/api-workflow.py',
  'skills/grok/README.md',
  'skills/grok/api-workflow.py',
  'skills/shared/analysis_workflow.py',
  'skills/shared/core-prompt.md',
  'skills/shared/input-schema.json',
  'skills/shared/output-schema.json',
  'skills/shared/task-spec.md'
].map(path => ({ path, content: `內容：${path}` }));
const paths = (files) => files.map(f => f.path);

test('平臺技能包含自己的檔案、腳本依賴的母本與合成資料，依路徑排序', () => {
  assert.deepEqual(paths(packageFiles('grok', repo)), [
    'examples/synthetic-org/assets.csv',
    'examples/synthetic-org/scope.json',
    'skills/grok/README.md',
    'skills/grok/api-workflow.py',
    'skills/shared/analysis_workflow.py',
    'skills/shared/core-prompt.md',
    'skills/shared/input-schema.json',
    'skills/shared/output-schema.json'
  ]);
  assert.equal(packageFiles('grok', repo).find(f => f.path === 'skills/shared/core-prompt.md').content, '內容：skills/shared/core-prompt.md');
});

test('對照表宣告的母本不存在時中止，錯誤訊息指出平臺與缺少的檔案', () => {
  const withoutSchema = repo.filter(f => f.path !== 'skills/shared/output-schema.json');
  assert.throws(() => packageFiles('grok', withoutSchema), { message: /grok.*skills\/shared\/output-schema\.json/ });
});

test('skills/ 底下有對照表沒有的目錄就中止，提示要在對照表補上一列', () => {
  assert.throws(() => packageFiles('gemini', repo), { message: /對照表.*gemini/ });
});

test('Claude 技能包不帶母本但附合成資料；shared 只放母本本身', () => {
  assert.deepEqual(paths(packageFiles('claude', repo)), [
    'examples/synthetic-org/assets.csv',
    'examples/synthetic-org/scope.json',
    'skills/claude/preemptive-exposure-analysis/SKILL.md',
    'skills/claude/preemptive-exposure-analysis/scripts/validate_inputs.py'
  ]);
  assert.deepEqual(paths(packageFiles('shared', repo)), [
    'skills/shared/analysis_workflow.py',
    'skills/shared/core-prompt.md',
    'skills/shared/input-schema.json',
    'skills/shared/output-schema.json',
    'skills/shared/task-spec.md'
  ]);
});

// 四支 api-workflow.py 執行時讀取 core-prompt.md 與 output-schema.json，預設輸入是 examples/synthetic-org/
for (const platform of ['chatgpt', 'deepseek', 'glm', 'grok']) {
  test(`${platform} 技能包帶齊 api-workflow.py 執行時讀取的母本與合成資料`, () => {
    const got = paths(packageFiles(platform, repo));
    for (const p of [`skills/${platform}/api-workflow.py`, 'skills/shared/core-prompt.md', 'skills/shared/output-schema.json',
      'examples/synthetic-org/assets.csv', 'examples/synthetic-org/scope.json']) {
      assert.ok(got.includes(p), `${platform} 技能包缺少 ${p}`);
    }
  });
}

// 母本：模擬 skills/shared/ 的六份會被複製的檔案
const masters = [
  { path: 'skills/shared/acceptance.md', content: '# 驗收清單\n\n| # | 檢查 |\n' },
  { path: 'skills/shared/analysis_workflow.py', content: '"""分析工作流程核心。"""\n\nimport json\n' },
  { path: 'skills/shared/input-schema.json', content: '{\n  "title": "輸入",\n  "properties": { "scope": { "type": "object", "required": ["organization"], "properties": { "organization": { "type": "string", "minLength": 1 } } } }\n}\n' },
  { path: 'skills/shared/output-schema.json', content: '{\n  "title": "輸出"\n}\n' },
  { path: 'skills/shared/scoring-rules.md', content: '# 示範評分規則\n\n規則內容。\n' },
  { path: 'skills/shared/task-spec.md', content: '---\ntitle: 共用任務規格\nrole: shared-spec\n---\n\n# 共用任務規格\n' }
];
// 平臺的系統提示詞：手寫的說明＋核心提示詞區塊＋手寫的範例區塊（也是 ```text）
const systemPromptMd = (name) => `---\ntitle: ${name} 系統提示詞\n---\n\n# ${name}\n\n> 用法說明。\n\n## 可直接複製的提示詞\n\n\`\`\`text\n舊的提示詞\n\`\`\`\n\n## 建議的第一則使用者訊息（範例）\n\n\`\`\`text\n請開始分析。\n\`\`\`\n`;
// 平臺技能的 SKILL.md：frontmatter（平臺讀取技能的依據）＋手寫步驟＋核心指令區塊＋其他手寫章節
const skillMd = (name) => `---\nname: preemptive-exposure-analysis\ndescription: 先制型曝險分析。\nmetadata:\n  backend: ${name}\n---\n\n# 先制型曝險分析\n\n## 執行步驟\n\n1. 依核心指令的八步流程產出報告。\n\n## 核心指令（與 \`skills/shared/core-prompt.md\` 一致；評分細則見 \`references/scoring-rules.md\`）\n\n\`\`\`text\n舊的核心指令\n\`\`\`\n\n## 輸出格式\n\n\`\`\`json\n{ "meta": {} }\n\`\`\`\n`;
// 授權範圍的規則說明行（見 docs/adr/0005）：固定開頭＋上面那份 scope 定義的規則說明＋句號
const RULE_LINE = '- scope 必填欄位的規則：organization 須為非空字串。';
const OLD_RULE_LINE = '- scope 必填欄位的規則：舊的說明。';
const CORE_TEXT = `你是先制型曝險分析助理。\n${RULE_LINE}`;
// 改寫版：手寫的內容裡有一行規則說明（Custom GPT 指示、Codex 與 Claude 的 SKILL.md）
const RULE_NOTE_REWRITES = RULE_NOTE_TARGETS.filter(path => path !== 'skills/shared/core-prompt.md');
const rewriteMd = (path) => `# ${path}\n\n## 安全與授權邊界\n\n- 未提供 scope 就拒絕分析。\n${OLD_RULE_LINE}\n- 不執行攻擊指令。\n`;
// 授權範圍守門的 JS 解讀（assets/scope-gate.js）：手寫的程式＋scope 定義的嵌入區塊（見 docs/adr/0004）
const SCOPE_MARKER = '  // 以下區塊由 scripts/build-data.mjs 從 skills/shared/input-schema.json 的 properties.scope 產生，請改母本後執行 npm run build，勿手動編輯';
const gateJs = (block) => `(function () {\n${SCOPE_MARKER}\n  const SCOPE_SCHEMA = ${block};\n  const api = { scopeSchema: () => SCOPE_SCHEMA };\n})();\n`;
// generatedFiles 的輸入：母本（含核心提示詞）＋含嵌入區塊的手寫檔（平臺系統提示詞、SKILL.md、改寫版、scope-gate.js）
const sources = [
  ...masters,
  { path: 'assets/scope-gate.js', content: gateJs('{ "舊的": "scope 定義" }') },
  { path: 'skills/shared/core-prompt.md', content: `---\ntitle: 核心提示詞\n---\n\n\`\`\`text\n你是先制型曝險分析助理。\n${OLD_RULE_LINE}\n\`\`\`\n` },
  ...RULE_NOTE_REWRITES.map(path => ({ path, content: rewriteMd(path) })),
  ...['grok', 'glm', 'deepseek'].map(p => ({ path: `skills/${p}/system-prompt.md`, content: systemPromptMd(p) })),
  ...['glm', 'deepseek'].map(p => ({ path: `skills/${p}/preemptive-exposure-analysis/SKILL.md`, content: skillMd(p) }))
];
const copyAt = (copies, path) => copies.find(c => c.path === path);

test('JSON 複本與母本位元組相同，放在平臺技能的 references/ 底下', () => {
  const copy = copyAt(generatedFiles(sources), 'skills/glm/preemptive-exposure-analysis/references/output-schema.json');
  assert.equal(copy.content, '{\n  "title": "輸出"\n}\n');
});

test('沒有 frontmatter 的 .md 複本，檔首加上「請勿手動編輯」標註，其後是母本原文', () => {
  const copy = copyAt(generatedFiles(sources), 'skills/glm/preemptive-exposure-analysis/references/scoring-rules.md');
  assert.equal(copy.content,
    '<!-- 由 scripts/build-data.mjs 從 skills/shared/scoring-rules.md 產生，請改母本後執行 npm run build，勿手動編輯 -->\n' +
    '# 示範評分規則\n\n規則內容。\n');
});

test('有 frontmatter 的 .md 複本，frontmatter 原封不動留在檔首，標註放在它之後', () => {
  const copy = copyAt(generatedFiles(sources), 'skills/glm/preemptive-exposure-analysis/references/task-spec.md');
  assert.equal(copy.content,
    '---\ntitle: 共用任務規格\nrole: shared-spec\n---\n' +
    '<!-- 由 scripts/build-data.mjs 從 skills/shared/task-spec.md 產生，請改母本後執行 npm run build，勿手動編輯 -->\n' +
    '\n# 共用任務規格\n');
});

test('.py 複本放在 Claude 技能的 scripts/ 底下，檔首加一行 Python 註解標註，其後是母本原文', () => {
  const copy = copyAt(generatedFiles(sources), 'skills/claude/preemptive-exposure-analysis/scripts/analysis_workflow.py');
  assert.equal(copy.content,
    '# 由 scripts/build-data.mjs 從 skills/shared/analysis_workflow.py 產生，請改母本後執行 npm run build，勿手動編輯\n' +
    '"""分析工作流程核心。"""\n\nimport json\n');
});

test('要放進 scripts/ 的母本不存在時中止，錯誤訊息指出平臺與缺少的母本', () => {
  const withoutCore = sources.filter(f => f.path !== 'skills/shared/analysis_workflow.py');
  assert.throws(() => generatedFiles(withoutCore), { message: /claude.*母本不存在.*skills\/shared\/analysis_workflow\.py/ });
});

test('要複製的母本不存在時中止，錯誤訊息指出缺少的母本', () => {
  const withoutTaskSpec = sources.filter(f => f.path !== 'skills/shared/task-spec.md');
  assert.throws(() => generatedFiles(withoutTaskSpec), { message: /母本不存在.*skills\/shared\/task-spec\.md/ });
});

test('建置產物集合：各平臺複本與現狀一致（Claude 沒有 task-spec、另有 scripts/ 的核心複本，Grok 與 shared 沒有 references/），Grok、GLM、DeepSeek 有含嵌入區塊的系統提示詞，GLM、DeepSeek 的 SKILL.md 也有', () => {
  assert.deepEqual(paths(generatedFiles(sources)).sort(), [
    'assets/scope-gate.js',
    'skills/chatgpt/custom-gpt-instructions.md',
    'skills/chatgpt/preemptive-exposure-analysis/SKILL.md',
    'skills/chatgpt/preemptive-exposure-analysis/references/acceptance.md',
    'skills/chatgpt/preemptive-exposure-analysis/references/input-schema.json',
    'skills/chatgpt/preemptive-exposure-analysis/references/output-schema.json',
    'skills/chatgpt/preemptive-exposure-analysis/references/scoring-rules.md',
    'skills/chatgpt/preemptive-exposure-analysis/references/task-spec.md',
    'skills/claude/preemptive-exposure-analysis/SKILL.md',
    'skills/claude/preemptive-exposure-analysis/references/acceptance.md',
    'skills/claude/preemptive-exposure-analysis/references/input-schema.json',
    'skills/claude/preemptive-exposure-analysis/references/output-schema.json',
    'skills/claude/preemptive-exposure-analysis/references/scoring-rules.md',
    'skills/claude/preemptive-exposure-analysis/scripts/analysis_workflow.py',
    'skills/deepseek/preemptive-exposure-analysis/SKILL.md',
    'skills/deepseek/preemptive-exposure-analysis/references/acceptance.md',
    'skills/deepseek/preemptive-exposure-analysis/references/input-schema.json',
    'skills/deepseek/preemptive-exposure-analysis/references/output-schema.json',
    'skills/deepseek/preemptive-exposure-analysis/references/scoring-rules.md',
    'skills/deepseek/preemptive-exposure-analysis/references/task-spec.md',
    'skills/deepseek/system-prompt.md',
    'skills/glm/preemptive-exposure-analysis/SKILL.md',
    'skills/glm/preemptive-exposure-analysis/references/acceptance.md',
    'skills/glm/preemptive-exposure-analysis/references/input-schema.json',
    'skills/glm/preemptive-exposure-analysis/references/output-schema.json',
    'skills/glm/preemptive-exposure-analysis/references/scoring-rules.md',
    'skills/glm/preemptive-exposure-analysis/references/task-spec.md',
    'skills/glm/system-prompt.md',
    'skills/grok/system-prompt.md',
    'skills/shared/core-prompt.md'
  ]);
});

const CORE_MARKER = '<!-- 以下區塊由 scripts/build-data.mjs 從 skills/shared/core-prompt.md 產生，請改母本後執行 npm run build，勿手動編輯 -->';

test('系統提示詞的第一個 ```text 區塊換成核心提示詞並加上標註；平臺說明與後面的範例區塊不變', () => {
  const copy = copyAt(generatedFiles(sources), 'skills/grok/system-prompt.md');
  assert.equal(copy.content,
    '---\ntitle: grok 系統提示詞\n---\n\n# grok\n\n> 用法說明。\n\n## 可直接複製的提示詞\n\n' +
    CORE_MARKER + `\n\`\`\`text\n${CORE_TEXT}\n\`\`\`\n\n` +
    '## 建議的第一則使用者訊息（範例）\n\n```text\n請開始分析。\n```\n');
});

test('已嵌入過的系統提示詞再產生一次結果不變，不會疊出第二行標註', () => {
  const once = generatedFiles(sources);
  const rebuilt = sources.map(f => once.find(c => c.path === f.path) || f);
  assert.equal(copyAt(generatedFiles(rebuilt), 'skills/glm/system-prompt.md').content, copyAt(once, 'skills/glm/system-prompt.md').content);
});

test('系統提示詞找不到 ```text 區塊時中止，錯誤訊息指出是哪個檔案', () => {
  const broken = sources.map(f => f.path === 'skills/deepseek/system-prompt.md' ? { ...f, content: '# DeepSeek\n\n沒有提示詞區塊。\n' } : f);
  assert.throws(() => generatedFiles(broken), { message: /skills\/deepseek\/system-prompt\.md.*```text/ });
});

test('對照表宣告要嵌入核心提示詞、但平臺沒有 system-prompt.md 時中止', () => {
  const withoutGlm = sources.filter(f => f.path !== 'skills/glm/system-prompt.md');
  assert.throws(() => generatedFiles(withoutGlm), { message: /skills\/glm\/system-prompt\.md.*不存在/ });
});

test('核心提示詞母本不存在時中止，錯誤訊息指出缺少的母本', () => {
  const withoutCore = sources.filter(f => f.path !== 'skills/shared/core-prompt.md');
  assert.throws(() => generatedFiles(withoutCore), { message: /母本不存在.*skills\/shared\/core-prompt\.md/ });
});

test('核心提示詞區塊被刪掉、只剩範例區塊時中止，不會把手寫的範例覆寫成核心提示詞', () => {
  const onlyExample = sources.map(f => f.path === 'skills/glm/system-prompt.md'
    ? { ...f, content: f.content.replace('```text\n舊的提示詞\n```\n\n', '') } : f);
  assert.ok(onlyExample.find(f => f.path === 'skills/glm/system-prompt.md').content.includes('```text\n請開始分析。\n```'));
  assert.throws(() => generatedFiles(onlyExample), { message: /skills\/glm\/system-prompt\.md.*可直接複製的提示詞/ });
});

test('SKILL.md 的「## 核心指令」標題下的區塊換成核心提示詞並加上標註；frontmatter 與其他手寫內容不變', () => {
  const copy = copyAt(generatedFiles(sources), 'skills/glm/preemptive-exposure-analysis/SKILL.md');
  assert.equal(copy.content,
    '---\nname: preemptive-exposure-analysis\ndescription: 先制型曝險分析。\nmetadata:\n  backend: glm\n---\n\n# 先制型曝險分析\n\n## 執行步驟\n\n1. 依核心指令的八步流程產出報告。\n\n' +
    '## 核心指令（與 `skills/shared/core-prompt.md` 一致；評分細則見 `references/scoring-rules.md`）\n\n' +
    CORE_MARKER + `\n\`\`\`text\n${CORE_TEXT}\n\`\`\`\n\n` +
    '## 輸出格式\n\n```json\n{ "meta": {} }\n```\n');
});

test('SKILL.md 的「## 核心指令」標題下沒有 ```text 區塊時中止，錯誤訊息指出檔案與標題', () => {
  const broken = sources.map(f => f.path === 'skills/deepseek/preemptive-exposure-analysis/SKILL.md'
    ? { ...f, content: f.content.replace('```text\n舊的核心指令\n```\n\n', '') } : f);
  assert.throws(() => generatedFiles(broken), { message: /skills\/deepseek\/preemptive-exposure-analysis\/SKILL\.md.*## 核心指令/ });
});

test('已嵌入過的 SKILL.md 再產生一次結果不變，不會疊出第二行標註', () => {
  const once = generatedFiles(sources);
  const rebuilt = sources.map(f => once.find(c => c.path === f.path) || f);
  const path = 'skills/deepseek/preemptive-exposure-analysis/SKILL.md';
  assert.equal(copyAt(generatedFiles(rebuilt), path).content, copyAt(once, path).content);
});

const withSkillMd = (platform, edit) => sources.map(f => f.path === `skills/${platform}/preemptive-exposure-analysis/SKILL.md` ? { ...f, content: edit(f.content) } : f);

test('SKILL.md 有兩行以「## 核心指令」開頭的標題時中止，不會默默換掉第一個標題下的區塊', () => {
  const twoHeadings = withSkillMd('glm', c => c.replace('## 核心指令（', '## 核心指令摘要\n\n```text\n手寫的摘要\n```\n\n## 核心指令（'));
  assert.throws(() => generatedFiles(twoHeadings), { message: /skills\/glm\/preemptive-exposure-analysis\/SKILL\.md.*2 行.*## 核心指令/ });
});

test('SKILL.md 的「## 核心指令」標題與 ```text 區塊之間夾了文字時中止，不會誤換後面的區塊', () => {
  const textBetween = withSkillMd('deepseek', c => c.replace('`references/scoring-rules.md`）\n\n```text', '`references/scoring-rules.md`）\n\n說明文字。\n\n```text'));
  assert.ok(textBetween.find(f => f.path.endsWith('deepseek/preemptive-exposure-analysis/SKILL.md')).content.includes('說明文字。\n\n```text'));
  assert.throws(() => generatedFiles(textBetween), { message: /skills\/deepseek\/preemptive-exposure-analysis\/SKILL\.md.*## 核心指令/ });
});

test('改用分析工作流程核心的平臺（四個有 api-workflow.py 的平臺）另外帶上核心與它讀取的 input-schema.json', () => {
  for (const platform of ['chatgpt', 'deepseek', 'glm', 'grok']) {
    const got = paths(packageFiles(platform, repo));
    for (const p of ['skills/shared/analysis_workflow.py', 'skills/shared/input-schema.json']) assert.ok(got.includes(p), `${platform} 技能包缺少 ${p}`);
  }
  assert.ok(!paths(packageFiles('claude', repo)).includes('skills/shared/analysis_workflow.py'), 'claude 用技能內 scripts/ 的核心複本，不帶母本');
});

test('核心提示詞母本的規則說明行換成由 scope 定義產生的說明，其餘內容不變', () => {
  assert.equal(copyAt(generatedFiles(sources), 'skills/shared/core-prompt.md').content,
    `---\ntitle: 核心提示詞\n---\n\n\`\`\`text\n${CORE_TEXT}\n\`\`\`\n`);
});

test('改寫版（Custom GPT 指示、Codex 與 Claude 的 SKILL.md）的規則說明行換成同一行，其餘手寫內容不變', () => {
  const generated = generatedFiles(sources);
  for (const path of RULE_NOTE_REWRITES) {
    assert.equal(copyAt(generated, path).content, rewriteMd(path).replace(OLD_RULE_LINE, RULE_LINE), path);
  }
});

test('規則說明行已是最新時再產生一次結果不變', () => {
  const once = generatedFiles(sources);
  const rebuilt = sources.map(f => once.find(c => c.path === f.path) || f);
  for (const path of ['skills/shared/core-prompt.md', ...RULE_NOTE_REWRITES]) {
    assert.equal(copyAt(generatedFiles(rebuilt), path).content, copyAt(once, path).content, path);
  }
});

test('規則說明行不是恰好一行時中止，錯誤訊息指出檔案', () => {
  for (const path of ['skills/shared/core-prompt.md', ...RULE_NOTE_REWRITES]) {
    const without = sources.map(f => f.path === path ? { ...f, content: f.content.replace(`${OLD_RULE_LINE}\n`, '') } : f);
    assert.throws(() => generatedFiles(without), { message: new RegExp(`${path.replace(/[./]/g, '\\$&')}.*0 行`) }, path);
    const twice = sources.map(f => f.path === path ? { ...f, content: f.content.replace(OLD_RULE_LINE, `${OLD_RULE_LINE}\n${OLD_RULE_LINE}`) } : f);
    assert.throws(() => generatedFiles(twice), { message: new RegExp(`${path.replace(/[./]/g, '\\$&')}.*2 行`) }, path);
  }
});

// scope 定義：上面 masters 裡 input-schema.json 的 properties.scope，以兩格縮排的 JSON 寫在 const SCOPE_SCHEMA = 後面（手寫的預期值）
const SCOPE_BLOCK = `{
    "type": "object",
    "required": [
      "organization"
    ],
    "properties": {
      "organization": {
        "type": "string",
        "minLength": 1
      }
    }
  }`;
const withGate = (content) => sources.map(f => f.path === 'assets/scope-gate.js' ? { ...f, content } : f);

test('scope-gate.js 的 SCOPE_SCHEMA 嵌入區塊換成 input-schema.json 的 scope 定義，標註與其餘手寫內容不變', () => {
  assert.equal(copyAt(generatedFiles(sources), 'assets/scope-gate.js').content, gateJs(SCOPE_BLOCK));
});

test('scope-gate.js 已是最新時再產生一次結果不變', () => {
  assert.equal(copyAt(generatedFiles(withGate(gateJs(SCOPE_BLOCK))), 'assets/scope-gate.js').content, gateJs(SCOPE_BLOCK));
});

test('scope-gate.js 沒有 SCOPE_SCHEMA 的嵌入區塊標註時中止，錯誤訊息指出檔案與數量', () => {
  assert.throws(() => generatedFiles(withGate(gateJs('{}').replace(`${SCOPE_MARKER}\n`, ''))), { message: /assets\/scope-gate\.js.*0 個.*SCOPE_SCHEMA/ });
});

test('scope-gate.js 有兩個 SCOPE_SCHEMA 的嵌入區塊標註時中止，不會只換掉第一個', () => {
  const twice = gateJs('{}') + `${SCOPE_MARKER}\n  const SCOPE_SCHEMA = {};\n`;
  assert.throws(() => generatedFiles(withGate(twice)), { message: /assets\/scope-gate\.js.*2 個.*SCOPE_SCHEMA/ });
});

test('沒有傳入 assets/scope-gate.js 時中止，錯誤訊息指出缺少的檔案', () => {
  assert.throws(() => generatedFiles(sources.filter(f => f.path !== 'assets/scope-gate.js')), { message: /assets\/scope-gate\.js.*不存在/ });
});
