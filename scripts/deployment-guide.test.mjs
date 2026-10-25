// deployment-guide.test.mjs — 部署指南第 1 節 scripts/ 那一行的改寫（withScriptsLine、scriptFilesFrom）的單元測試
// 部署指南（docs/guides/deployment.md）第 1 節的 scripts/ 清單由 scripts/deployment-guide.mjs 從各支 .mjs 的檔頭第一行產生。
// withScriptsLine 的單元測試是純函式，用記憶體裡的字串，不碰磁碟；預期值是手寫的字面值：整行、全文或錯誤訊息，
// 只有「重複改寫結果相同」比的是改寫一次的結果。scriptFilesFrom 的單元測試用暫存目錄。
// 已提交的部署指南那一行是否最新，由 build-outputs.test.mjs 的整合檢查比對。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withScriptsLine, scriptFilesFrom } from './deployment-guide.mjs';

// /** 開頭的 module 與 // 開頭的測試檔，檔頭第一行之後的內容都不進清單
const mod = (name, desc) => ({ name, content: `/**\n * ${name} — ${desc}\n * 第二行以下不進清單。\n */\nexport const x = 1;\n` });
const spec = (name, desc) => ({ name, content: `// ${name} — ${desc}\n// 第二行以下不進清單。\nimport { test } from 'node:test';\n` });
// 只有那一行、沒有換行的最小指南：改寫後的全文就是那一行，預期值照舊是手寫的整行字面值
const line = (files) => withScriptsLine('scripts/ 舊的', files);

test('x.mjs 和 x.test.mjs 配成一段，說明取 module 的檔頭；說明從第 23 個字元開始', () => {
  assert.equal(line([mod('acceptance.mjs', '驗收 module'), spec('acceptance.test.mjs', '測試檔自己的說明')]),
    'scripts/              acceptance.mjs（驗收 module；單元測試在 acceptance.test.mjs）');
});

test('沒有測試的 module、沒有同名 module 的測試檔各自一段（測試檔用自己的檔頭），段與段用「、」分隔', () => {
  assert.equal(line([mod('build-data.mjs', '建置'), spec('scoring.test.mjs', '計算行為')]),
    'scripts/              build-data.mjs（建置）、scoring.test.mjs（計算行為）');
});

test('依檔名的字母順序排列，成對的那段以 module 的檔名為準；JS 預設排序下 - 排在 . 前面', () => {
  const files = [mod('verify.mjs', 'V'), spec('verify-report.test.mjs', 'VRT'), spec('scoring.test.mjs', 'ST'),
    mod('verify-report.mjs', 'VR'), mod('scoring-rules.mjs', 'SR'), mod('acceptance.mjs', 'A')];
  assert.equal(line(files),
    'scripts/              acceptance.mjs（A）、scoring-rules.mjs（SR）、scoring.test.mjs（ST）、verify-report.mjs（VR；單元測試在 verify-report.test.mjs）、verify.mjs（V）');
});

test('說明結尾的「。」只拿掉一個；說明裡的全形括號與「、」照原樣，不跳脫', () => {
  assert.equal(line([mod('a.mjs', '渲染（報告）、檢查。'), spec('b.test.mjs', '兩個句號。。')]),
    'scripts/              a.mjs（渲染（報告）、檢查）、b.test.mjs（兩個句號。）');
});

test('開頭的 shebang 行略過，從下一行開始認檔頭', () => {
  const cli = { name: 'run-demo.mjs', content: '#!/usr/bin/env node\n/**\n * run-demo.mjs — 執行示範引擎\n */\n' };
  assert.equal(line([cli]), 'scripts/              run-demo.mjs（執行示範引擎）');
});

// 檔頭第一行寫不出來就丟錯，訊息寫出是哪支檔案、違反了哪一條；不退回比較寬鬆的寫法（同 docs/adr/0005）
test('檔頭第一行的檔名跟實際的檔名不同：丟錯', () => {
  const copied = { name: 'b.mjs', content: mod('a.mjs', '從 a.mjs 複製過來').content };
  assert.throws(() => line([mod('verify.mjs', '網站驗證'), copied]),
    { message: 'scripts/b.mjs：檔頭第一行的檔名是 a.mjs，要跟實際的檔名 b.mjs 相同' });
});

test('「 — 」後面的說明是空白：丟錯（行尾空白被編輯器刪掉、只剩「—」也算）', () => {
  assert.throws(() => line([{ name: 'a.mjs', content: '/**\n * a.mjs —   \n */\n' }]),
    { message: 'scripts/a.mjs：檔頭第一行「 — 」後面的說明是空白' });
  assert.throws(() => line([{ name: 'b.test.mjs', content: '// b.test.mjs —\n' }]),
    { message: 'scripts/b.test.mjs：檔頭第一行「 — 」後面的說明是空白' });
});

test('說明只有「。」：拿掉結尾的「。」之後是空白，一樣丟錯（不產生空括號）', () => {
  assert.throws(() => line([mod('a.mjs', '。')]), { message: 'scripts/a.mjs：檔頭第一行「 — 」後面的說明是空白' });
});

test('/** 的下一行、// 開頭的那一行不是「檔名 — 說明」：丟錯，訊息寫出該怎麼寫', () => {
  assert.throws(() => line([{ name: 'a.mjs', content: '/**\n * a.mjs\n * 說明寫在下一行。\n */\n' }]),
    { message: 'scripts/a.mjs：檔頭第一行要寫成「 * a.mjs — 一句說明」' });
  assert.throws(() => line([{ name: 'b.test.mjs', content: '// 只有說明、沒寫檔名。\n' }]),
    { message: 'scripts/b.test.mjs：檔頭第一行要寫成「// b.test.mjs — 一句說明」' });
});

test('略過 shebang 後的第一行不是單獨的 /**、也不是 // 開頭：丟錯（例如「/** 說明」寫在同一行、沒有檔頭）', () => {
  const message = 'scripts/run-demo.mjs：略過 shebang 後，檔頭要從單獨一行的「/**」或「//」開始';
  assert.throws(() => line([{ name: 'run-demo.mjs', content: '#!/usr/bin/env node\n/** 執行示範引擎。\n */\n' }]), { message });
  assert.throws(() => line([{ name: 'run-demo.mjs', content: "import { x } from './x.mjs';\n" }]), { message });
});

test('成對的測試檔不進清單，檔頭第一行照樣檢查', () => {
  assert.throws(() => line([mod('glossary.mjs', '詞彙表'), { name: 'glossary.test.mjs', content: '// 沒寫檔名的舊寫法。\n' }]),
    { message: 'scripts/glossary.test.mjs：檔頭第一行要寫成「// glossary.test.mjs — 一句說明」' });
});

// 指南裡以「scripts/ 」開頭的行要恰好一行，才知道要換哪一行；0 行或 2 行以上就中止，不默默只換第一行
const notExactlyOne = (n) => `docs/guides/deployment.md 有 ${n} 行以「scripts/ 」開頭，必須恰好一行（第 1 節的 scripts/ 清單），才知道要換哪一行`;

test('指南裡沒有 scripts/ 那一行：丟錯，訊息寫出實際的行數 0', () => {
  assert.throws(() => withScriptsLine('# 部署指南\n```\nindex.html  單頁應用程式殼\n```\n', [mod('a.mjs', 'A')]),
    { message: notExactlyOne(0) });
});

test('指南裡有兩行以 scripts/ 開頭：丟錯，訊息寫出實際的行數 2（不只換第一行）', () => {
  assert.throws(() => withScriptsLine('scripts/ 一\nscripts/ 二\n', [mod('a.mjs', 'A')]), { message: notExactlyOne(2) });
});

test('只換掉 scripts/ 那一行，前後文一字不變；回傳的是整份指南', () => {
  const guide = '# 1. 網站架構\n\n```\nindex.html            單頁應用程式殼\nscripts/              舊的清單\nskills/               技能包\n```\n\n## 2. 本機預覽\n';
  assert.equal(withScriptsLine(guide, [mod('a.mjs', 'A')]),
    '# 1. 網站架構\n\n```\nindex.html            單頁應用程式殼\nscripts/              a.mjs（A）\nskills/               技能包\n```\n\n## 2. 本機預覽\n');
});

test('重複改寫結果相同：改寫過的指南再改寫一次不變', () => {
  const files = [mod('a.mjs', 'A'), spec('a.test.mjs', 'AT'), spec('b.test.mjs', 'B')];
  const once = withScriptsLine('前文\nscripts/ 舊的\n後文\n', files);
  assert.equal(withScriptsLine(once, files), once);
});

test('scriptFilesFrom 只讀 scripts/ 第一層的 .mjs：子目錄裡的與非 .mjs 的都不算；name 是檔名，換行正規化成 LF', () => {
  const root = mkdtempSync(join(tmpdir(), 'pea-guide-'));
  try {
    mkdirSync(join(root, 'scripts', 'lib'), { recursive: true });
    writeFileSync(join(root, 'scripts', 'a.mjs'), '// a.mjs — A\r\nexport const a = 1;\r\n');
    writeFileSync(join(root, 'scripts', 'notes.txt'), '不是 .mjs\n');
    writeFileSync(join(root, 'scripts', 'lib', 'b.mjs'), '// b.mjs — 子目錄裡的\n');
    assert.deepEqual(scriptFilesFrom(root), [{ name: 'a.mjs', content: '// a.mjs — A\nexport const a = 1;\n' }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
