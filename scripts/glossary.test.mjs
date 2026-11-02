// glossary.test.mjs — 詞彙表 _Avoid_ 詞的單元測試，與對整個 repo 的檢查
// 詞彙表（GLOSSARY.md）的 _Avoid_ 詞：手寫的檔案不使用專指的 _Avoid_ 詞，改用詞條本身。
// 純函式在 scripts/glossary.mjs；這裡先以虛構的輸入測它們，最後對整個 repo 檢查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { avoidTerms, ignoreMatcher, avoidHits } from './glossary.mjs';

test('從詞彙表解析出每個詞條的 _Avoid_ 詞', () => {
  const md = '# 詞彙表\n\n## Language\n\n**母本**：\n唯一來源檔案。\n_Avoid_: 原始檔、主檔\n\n**複本**：\n建置產生的檔案；\n不得手改。\n_Avoid_: 副本\n';
  assert.deepEqual(avoidTerms(md), [
    { entry: '母本', term: '原始檔' }, { entry: '母本', term: '主檔' }, { entry: '複本', term: '副本' }
  ]);
});

test('解析 .ignore 的小子集：目錄（結尾斜線）、* 萬用字元（不跨 /）、完整路徑；註解與空行略過', () => {
  const ignored = ignoreMatcher('# 註解\n\ndata/case.js\ndownloads/\nskills/*/x/references/\n');
  for (const path of ['data/case.js', 'downloads/skills-glm.zip', 'downloads/a/b.zip', 'skills/glm/x/references/a.md']) {
    assert.equal(ignored(path), true, path);
  }
  for (const path of ['data/process.js', 'data/case.json', 'mydownloads/a.zip', 'skills/glm/y/references/a.md',
                      'skills/a/b/x/references/a.md', '# 註解']) {
    assert.equal(ignored(path), false, path);
  }
});

test('找出命中：排除的一般詞彙不檢查；允許片語只遮掉它涵蓋的那一處；回報檔案與行號', () => {
  const terms = [{ entry: '複本', term: '拷貝' }, { entry: '平臺', term: '模型' }, { entry: '母本', term: '主檔' }];
  const files = [
    { path: 'a.md', content: '第一行\n做一份深拷貝\n不要拷貝這份\n語言模型\n深拷貝之後再拷貝一次' },
    { path: 'b.mjs', content: '// 主檔\n' }
  ];
  const options = { excluded: { 模型: '語言模型是正當用法' }, allowed: [{ term: '拷貝', phrase: '深拷貝', reason: '程式術語' }] };
  assert.deepEqual(avoidHits(terms, files, options), [
    { file: 'a.md', line: 3, term: '拷貝', entry: '複本' },
    { file: 'a.md', line: 5, term: '拷貝', entry: '複本' },   // 同一行的第二個「拷貝」不在「深拷貝」裡
    { file: 'b.mjs', line: 1, term: '主檔', entry: '母本' }
  ]);
});

// ---------- 對整個 repo 檢查 ----------
// 有其他正當意思的一般詞彙：不檢查（新增排除項要附理由，審查者會判斷合不合理，見 CODING_STANDARDS.md）
const EXCLUDED = {
  模型: '「語言模型」「模型後端」是正當用法，不是指平臺',
  後端: '「選用後端代理」「模型後端」是正當用法',
  供應商: '指資安產品或模型的供應商，不是指平臺',
  驗證: '「安全驗證計畫」（S6）與網站的 verify 是不同概念，不是指驗收',
  finding: '資料欄位 finding_id 與 vulnerabilities 的 finding 是正當用法，不是指預檢發現'
};
// 正當的片語：只遮掉片語涵蓋的那一處
const ALLOWED = [
  { term: '拷貝', phrase: '深拷貝', reason: '程式術語 deep copy，不是指複本' },
  { term: '預檢', phrase: '腳本預檢', reason: '詞條「腳本預檢」本身' },
  { term: '預檢', phrase: '預檢發現', reason: '詞條「預檢發現」本身' },
  { term: '預檢', phrase: '[預檢]', reason: 'api-workflow.py 印到 stderr 的固定標籤，改它會改變輸出' },
  { term: 'pipeline', phrase: 'retrieval pipelines', reason: '證據檔逐字引用外部原文' },
  { term: '主檔', phrase: '建議主檔', reason: 'agentskills 規格的用語，指 SKILL.md 主檔，不是指母本' },
  { term: 'demo engine', phrase: 'demo engine checks', reason: 'CI 步驟名稱慣例用英文' },
  { term: '範例資料', phrase: '用範例資料', reason: '引述使用者可能說的話，模型要能辨識；同一句要求輸出標明「合成資料」' }
];
const TEXT_FILE = /\.(md|mjs|js|py|yml|json|html)$/;
// 不掃描：詞彙表本身（_Avoid_ 詞的定義處），以及這支測試（單元測試的輸入與上面兩份清單本來就寫著 _Avoid_ 詞）
const NOT_SCANNED = ['GLOSSARY.md', 'scripts/glossary.test.mjs'];

test('手寫的檔案不使用專指的 _Avoid_ 詞（建置產生的檔案依 .ignore 略過）', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const read = (path) => readFileSync(root + path, 'utf8');
  const ignored = ignoreMatcher(read('.ignore'));
  const tracked = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).stdout.split('\n');
  const files = tracked.filter(p => TEXT_FILE.test(p) && !NOT_SCANNED.includes(p) && !ignored(p)).map(path => ({ path, content: read(path) }));
  const hits = avoidHits(avoidTerms(read('GLOSSARY.md')), files, { excluded: EXCLUDED, allowed: ALLOWED });
  assert.deepEqual(hits.map(h => `${h.file}:${h.line} ${h.term}（改用「${h.entry}」）`), []);
});
