// deployment-guide.test.mjs — 第 1 節 scripts/ 清單的產生規則（scriptsLine）的單元測試，與對 repo 的整合檢查
// 部署指南（docs/guides/deployment.md）第 1 節的 scripts/ 清單由 scripts/deployment-guide.mjs 從各支 .mjs 的檔頭第一行產生。
// 前半段是 scriptsLine 的單元測試（純函式，用記憶體裡的字串，不碰磁碟；預期值都是手寫的整行字面值）；
// 後半段是整合檢查，讀 scripts/ 底下實際的 .mjs 與已提交的部署指南，確認那一行是用現在的檔頭建置出來的。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { scriptsLine, SCRIPTS_LINE } from './deployment-guide.mjs';

// /** 開頭的 module 與 // 開頭的測試檔，檔頭第一行之後的內容都不進清單
const mod = (name, desc) => ({ name, content: `/**\n * ${name} — ${desc}\n * 第二行以下不進清單。\n */\nexport const x = 1;\n` });
const spec = (name, desc) => ({ name, content: `// ${name} — ${desc}\n// 第二行以下不進清單。\nimport { test } from 'node:test';\n` });

test('x.mjs 和 x.test.mjs 配成一段，說明取 module 的檔頭；說明從第 23 個字元開始', () => {
  assert.equal(scriptsLine([mod('acceptance.mjs', '驗收 module'), spec('acceptance.test.mjs', '測試檔自己的說明')]),
    'scripts/              acceptance.mjs（驗收 module；單元測試在 acceptance.test.mjs）');
});

test('沒有測試的 module、沒有同名 module 的測試檔各自一段（測試檔用自己的檔頭），段與段用「、」分隔', () => {
  assert.equal(scriptsLine([mod('build-data.mjs', '建置'), spec('scoring.test.mjs', '計算行為')]),
    'scripts/              build-data.mjs（建置）、scoring.test.mjs（計算行為）');
});

test('依檔名的字母順序排列，成對的那段以 module 的檔名為準；JS 預設排序下 - 排在 . 前面', () => {
  const files = [mod('verify.mjs', 'V'), spec('verify-report.test.mjs', 'VRT'), spec('scoring.test.mjs', 'ST'),
    mod('verify-report.mjs', 'VR'), mod('scoring-rules.mjs', 'SR'), mod('acceptance.mjs', 'A')];
  assert.equal(scriptsLine(files),
    'scripts/              acceptance.mjs（A）、scoring-rules.mjs（SR）、scoring.test.mjs（ST）、verify-report.mjs（VR；單元測試在 verify-report.test.mjs）、verify.mjs（V）');
});

test('說明結尾的「。」只拿掉一個；說明裡的全形括號與「、」照原樣，不跳脫', () => {
  assert.equal(scriptsLine([mod('a.mjs', '渲染（報告）、檢查。'), spec('b.test.mjs', '兩個句號。。')]),
    'scripts/              a.mjs（渲染（報告）、檢查）、b.test.mjs（兩個句號。）');
});

test('開頭的 shebang 行略過，從下一行開始認檔頭', () => {
  const cli = { name: 'run-demo.mjs', content: '#!/usr/bin/env node\n/**\n * run-demo.mjs — 執行示範引擎\n */\n' };
  assert.equal(scriptsLine([cli]), 'scripts/              run-demo.mjs（執行示範引擎）');
});

// 檔頭第一行寫不出來就丟錯，訊息寫出是哪支檔案、違反了哪一條；不退回比較寬鬆的寫法（同 docs/adr/0005）
test('檔頭第一行的檔名跟實際的檔名不同：丟錯', () => {
  const copied = { name: 'b.mjs', content: mod('a.mjs', '從 a.mjs 複製過來').content };
  assert.throws(() => scriptsLine([mod('verify.mjs', '網站驗證'), copied]),
    { message: 'scripts/b.mjs：檔頭第一行的檔名是 a.mjs，要跟實際的檔名 b.mjs 相同' });
});

test('「 — 」後面的說明是空白：丟錯（行尾空白被編輯器刪掉、只剩「—」也算）', () => {
  assert.throws(() => scriptsLine([{ name: 'a.mjs', content: '/**\n * a.mjs —   \n */\n' }]),
    { message: 'scripts/a.mjs：檔頭第一行「 — 」後面的說明是空白' });
  assert.throws(() => scriptsLine([{ name: 'b.test.mjs', content: '// b.test.mjs —\n' }]),
    { message: 'scripts/b.test.mjs：檔頭第一行「 — 」後面的說明是空白' });
});

test('說明只有「。」：拿掉結尾的「。」之後是空白，一樣丟錯（不產生空括號）', () => {
  assert.throws(() => scriptsLine([mod('a.mjs', '。')]), { message: 'scripts/a.mjs：檔頭第一行「 — 」後面的說明是空白' });
});

test('/** 的下一行、// 開頭的那一行不是「檔名 — 說明」：丟錯，訊息寫出該怎麼寫', () => {
  assert.throws(() => scriptsLine([{ name: 'a.mjs', content: '/**\n * a.mjs\n * 說明寫在下一行。\n */\n' }]),
    { message: 'scripts/a.mjs：檔頭第一行要寫成「 * a.mjs — 一句說明」' });
  assert.throws(() => scriptsLine([{ name: 'b.test.mjs', content: '// 只有說明、沒寫檔名。\n' }]),
    { message: 'scripts/b.test.mjs：檔頭第一行要寫成「// b.test.mjs — 一句說明」' });
});

test('略過 shebang 後的第一行不是單獨的 /**、也不是 // 開頭：丟錯（例如「/** 說明」寫在同一行、沒有檔頭）', () => {
  const message = 'scripts/run-demo.mjs：略過 shebang 後，檔頭要從單獨一行的「/**」或「//」開始';
  assert.throws(() => scriptsLine([{ name: 'run-demo.mjs', content: '#!/usr/bin/env node\n/** 執行示範引擎。\n */\n' }]), { message });
  assert.throws(() => scriptsLine([{ name: 'run-demo.mjs', content: "import { x } from './x.mjs';\n" }]), { message });
});

test('成對的測試檔不進清單，檔頭第一行照樣檢查', () => {
  assert.throws(() => scriptsLine([mod('glossary.mjs', '詞彙表'), { name: 'glossary.test.mjs', content: '// 沒寫檔名的舊寫法。\n' }]),
    { message: 'scripts/glossary.test.mjs：檔頭第一行要寫成「// glossary.test.mjs — 一句說明」' });
});

// 對 repo 的整合檢查：用 readdir 而不是 git ls-files，新檔案還沒提交時就檢查得到；換行正規化成 LF，跟建置讀檔的方式相同
const readText = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('部署指南第 1 節的 scripts/ 那一行（整份只有一行），等於由 scripts/ 底下各支 .mjs 的檔頭第一行產生的結果', () => {
  const files = readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('.mjs'))
    .map(name => ({ name, content: readText(`scripts/${name}`) }));
  // 跟建置用同一個 SCRIPTS_LINE 認那一行；整份只能有一行
  assert.deepEqual(readText('docs/guides/deployment.md').match(SCRIPTS_LINE), [scriptsLine(files)],
    '部署指南第 1 節的 scripts/ 清單跟各支 .mjs 的檔頭第一行不一致：改了檔頭請執行 node scripts/build-data.mjs，勿手動編輯那一行');
});
