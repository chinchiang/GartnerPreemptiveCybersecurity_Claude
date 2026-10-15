// 技能包組裝器的單元測試：只用 node:test，母本以記憶體中的字串提供，不碰磁碟。
// 執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCorePrompt, packageFiles } from './skill-packages.mjs';

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
