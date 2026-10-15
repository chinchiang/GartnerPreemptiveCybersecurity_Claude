// 技能包組裝器的單元測試：只用 node:test，母本以記憶體中的字串提供，不碰磁碟。
// 執行：npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCorePrompt } from './skill-packages.mjs';

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
