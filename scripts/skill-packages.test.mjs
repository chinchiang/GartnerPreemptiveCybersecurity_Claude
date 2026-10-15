// 技能包組裝器的單元測試：只用 node:test，母本以記憶體中的字串提供，不碰磁碟。
// 執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCorePrompt, packageFiles, generateCopies } from './skill-packages.mjs';

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
  'skills/shared/core-prompt.md',
  'skills/shared/input-schema.json',
  'skills/shared/output-schema.json',
  'skills/shared/task-spec.md'
].map(path => ({ path, content: `內容：${path}` }));
const paths = (files) => files.map(f => f.path);

test('平臺技能包含自己的檔案、腳本依賴的母本與合成範例資料，依路徑排序', () => {
  assert.deepEqual(paths(packageFiles('grok', repo)), [
    'examples/synthetic-org/assets.csv',
    'examples/synthetic-org/scope.json',
    'skills/grok/README.md',
    'skills/grok/api-workflow.py',
    'skills/shared/core-prompt.md',
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

test('Claude 技能包不帶母本但附合成範例資料；shared 只放母本本身', () => {
  assert.deepEqual(paths(packageFiles('claude', repo)), [
    'examples/synthetic-org/assets.csv',
    'examples/synthetic-org/scope.json',
    'skills/claude/preemptive-exposure-analysis/SKILL.md',
    'skills/claude/preemptive-exposure-analysis/scripts/validate_inputs.py'
  ]);
  assert.deepEqual(paths(packageFiles('shared', repo)), [
    'skills/shared/core-prompt.md',
    'skills/shared/input-schema.json',
    'skills/shared/output-schema.json',
    'skills/shared/task-spec.md'
  ]);
});

// 四支 api-workflow.py 執行時讀取 core-prompt.md 與 output-schema.json，預設輸入是 examples/synthetic-org/
for (const platform of ['chatgpt', 'deepseek', 'glm', 'grok']) {
  test(`${platform} 技能包帶齊 api-workflow.py 執行時讀取的母本與合成範例資料`, () => {
    const got = paths(packageFiles(platform, repo));
    for (const p of [`skills/${platform}/api-workflow.py`, 'skills/shared/core-prompt.md', 'skills/shared/output-schema.json',
      'examples/synthetic-org/assets.csv', 'examples/synthetic-org/scope.json']) {
      assert.ok(got.includes(p), `${platform} 技能包缺少 ${p}`);
    }
  });
}

// 母本：模擬 skills/shared/ 的五份會被複製的檔案
const masters = [
  { path: 'skills/shared/acceptance.md', content: '# 驗收清單\n\n| # | 檢查 |\n' },
  { path: 'skills/shared/input-schema.json', content: '{\n  "title": "輸入"\n}\n' },
  { path: 'skills/shared/output-schema.json', content: '{\n  "title": "輸出"\n}\n' },
  { path: 'skills/shared/scoring-rules.md', content: '# 示範評分規則\n\n規則內容。\n' },
  { path: 'skills/shared/task-spec.md', content: '---\ntitle: 共用任務規格\nrole: shared-spec\n---\n\n# 共用任務規格\n' }
];
// 平臺的系統提示詞：手寫的說明＋核心提示詞區塊＋手寫的範例區塊（也是 ```text）
const systemPrompt = (name) => `---\ntitle: ${name} 系統提示詞\n---\n\n# ${name}\n\n> 用法說明。\n\n## 可直接複製的提示詞\n\n\`\`\`text\n舊的提示詞\n\`\`\`\n\n## 建議的第一則使用者訊息（範例）\n\n\`\`\`text\n請開始分析。\n\`\`\`\n`;
// generateCopies 的輸入：母本（含核心提示詞）＋要嵌入核心提示詞的平臺檔案
const sources = [
  ...masters,
  { path: 'skills/shared/core-prompt.md', content: '---\ntitle: 核心提示詞\n---\n\n```text\n你是先制型曝險分析助理。\n```\n' },
  ...['grok', 'glm', 'deepseek'].map(p => ({ path: `skills/${p}/system-prompt.md`, content: systemPrompt(p) }))
];
const copyAt = (copies, path) => copies.find(c => c.path === path);

test('JSON 複本與母本位元組相同，放在平臺技能的 references/ 底下', () => {
  const copy = copyAt(generateCopies(sources), 'skills/glm/preemptive-exposure-analysis/references/output-schema.json');
  assert.equal(copy.content, '{\n  "title": "輸出"\n}\n');
});

test('沒有 frontmatter 的 .md 複本，檔首加上「請勿手動編輯」標註，其後是母本原文', () => {
  const copy = copyAt(generateCopies(sources), 'skills/glm/preemptive-exposure-analysis/references/scoring-rules.md');
  assert.equal(copy.content,
    '<!-- 由 scripts/build-data.mjs 從 skills/shared/scoring-rules.md 產生，請改母本後執行 npm run build，勿手動編輯 -->\n' +
    '# 示範評分規則\n\n規則內容。\n');
});

test('有 frontmatter 的 .md 複本，frontmatter 原封不動留在檔首，標註放在它之後', () => {
  const copy = copyAt(generateCopies(sources), 'skills/glm/preemptive-exposure-analysis/references/task-spec.md');
  assert.equal(copy.content,
    '---\ntitle: 共用任務規格\nrole: shared-spec\n---\n' +
    '<!-- 由 scripts/build-data.mjs 從 skills/shared/task-spec.md 產生，請改母本後執行 npm run build，勿手動編輯 -->\n' +
    '\n# 共用任務規格\n');
});

test('要複製的母本不存在時中止，錯誤訊息指出缺少的母本', () => {
  const withoutTaskSpec = sources.filter(f => f.path !== 'skills/shared/task-spec.md');
  assert.throws(() => generateCopies(withoutTaskSpec), { message: /母本不存在.*skills\/shared\/task-spec\.md/ });
});

test('各平臺的複本集合與現狀一致：Claude 沒有 task-spec，Grok 與 shared 沒有 references/；Grok、GLM、DeepSeek 有系統提示詞', () => {
  assert.deepEqual(paths(generateCopies(sources)).sort(), [
    'skills/chatgpt/preemptive-exposure-analysis/references/acceptance.md',
    'skills/chatgpt/preemptive-exposure-analysis/references/input-schema.json',
    'skills/chatgpt/preemptive-exposure-analysis/references/output-schema.json',
    'skills/chatgpt/preemptive-exposure-analysis/references/scoring-rules.md',
    'skills/chatgpt/preemptive-exposure-analysis/references/task-spec.md',
    'skills/claude/preemptive-exposure-analysis/references/acceptance.md',
    'skills/claude/preemptive-exposure-analysis/references/input-schema.json',
    'skills/claude/preemptive-exposure-analysis/references/output-schema.json',
    'skills/claude/preemptive-exposure-analysis/references/scoring-rules.md',
    'skills/deepseek/preemptive-exposure-analysis/references/acceptance.md',
    'skills/deepseek/preemptive-exposure-analysis/references/input-schema.json',
    'skills/deepseek/preemptive-exposure-analysis/references/output-schema.json',
    'skills/deepseek/preemptive-exposure-analysis/references/scoring-rules.md',
    'skills/deepseek/preemptive-exposure-analysis/references/task-spec.md',
    'skills/deepseek/system-prompt.md',
    'skills/glm/preemptive-exposure-analysis/references/acceptance.md',
    'skills/glm/preemptive-exposure-analysis/references/input-schema.json',
    'skills/glm/preemptive-exposure-analysis/references/output-schema.json',
    'skills/glm/preemptive-exposure-analysis/references/scoring-rules.md',
    'skills/glm/preemptive-exposure-analysis/references/task-spec.md',
    'skills/glm/system-prompt.md',
    'skills/grok/system-prompt.md'
  ]);
});

const CORE_MARKER = '<!-- 以下區塊由 scripts/build-data.mjs 從 skills/shared/core-prompt.md 產生，請改母本後執行 npm run build，勿手動編輯 -->';

test('系統提示詞的第一個 ```text 區塊換成核心提示詞並加上標註；平臺說明與後面的範例區塊不變', () => {
  const copy = copyAt(generateCopies(sources), 'skills/grok/system-prompt.md');
  assert.equal(copy.content,
    '---\ntitle: grok 系統提示詞\n---\n\n# grok\n\n> 用法說明。\n\n## 可直接複製的提示詞\n\n' +
    CORE_MARKER + '\n```text\n你是先制型曝險分析助理。\n```\n\n' +
    '## 建議的第一則使用者訊息（範例）\n\n```text\n請開始分析。\n```\n');
});

test('已嵌入過的系統提示詞再產生一次結果不變，不會疊出第二行標註', () => {
  const once = generateCopies(sources);
  const rebuilt = sources.map(f => once.find(c => c.path === f.path) || f);
  assert.equal(copyAt(generateCopies(rebuilt), 'skills/glm/system-prompt.md').content, copyAt(once, 'skills/glm/system-prompt.md').content);
});

test('系統提示詞找不到 ```text 區塊時中止，錯誤訊息指出是哪個檔案', () => {
  const broken = sources.map(f => f.path === 'skills/deepseek/system-prompt.md' ? { ...f, content: '# DeepSeek\n\n沒有提示詞區塊。\n' } : f);
  assert.throws(() => generateCopies(broken), { message: /skills\/deepseek\/system-prompt\.md.*```text/ });
});

test('對照表宣告要嵌入核心提示詞、但平臺沒有 system-prompt.md 時中止', () => {
  const withoutGlm = sources.filter(f => f.path !== 'skills/glm/system-prompt.md');
  assert.throws(() => generateCopies(withoutGlm), { message: /skills\/glm\/system-prompt\.md.*不存在/ });
});

test('核心提示詞母本不存在時中止，錯誤訊息指出缺少的母本', () => {
  const withoutCore = sources.filter(f => f.path !== 'skills/shared/core-prompt.md');
  assert.throws(() => generateCopies(withoutCore), { message: /母本不存在.*skills\/shared\/core-prompt\.md/ });
});
