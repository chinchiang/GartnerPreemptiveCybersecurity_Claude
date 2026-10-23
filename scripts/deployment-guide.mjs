/**
 * deployment-guide.mjs — 由各支 .mjs 的檔頭第一行產生部署指南第 1 節的 scripts/ 清單
 * 純函式：輸入 scripts/ 底下每支 .mjs 的檔名與內容，回傳第 1 節以 scripts/ 開頭的整行；讀檔與寫回 docs/guides/deployment.md
 * 交給呼叫端（build-data.mjs），不碰磁碟就能測試（scripts/deployment-guide.test.mjs）。所有輸入只認 LF 換行。
 */

// 第 1 節程式碼區塊的說明從第 23 個字元開始：檔名補空格到 22 個字元（只有檔名太長的那幾行例外），scripts/ 那一行也照這個寬度
const COLUMN = 22;

// 第 1 節的 scripts/ 清單：整份部署指南只有這一行以「scripts/ 」開頭。建置（replaceExactlyOnce）與整合檢查（String#match）共用；
// 帶 g 是 replaceExactlyOnce 的要求，所以不要拿它呼叫 test()，g 會記住 lastIndex
export const SCRIPTS_LINE = /^scripts\/ .*$/gm;

// 檔頭第一行「檔名 — 一句說明」的說明；結尾的「。」只拿掉一個，在清單裡由「）」收尾
function headerDesc({ name, content }) {
  let lines = content.split('\n');
  if (lines[0].startsWith('#!')) lines = lines.slice(1);
  // /** 開頭的取下一行，// 開頭的取這一行本身
  let line, lead;
  if (lines[0] === '/**') [line, lead] = [lines[1] ?? '', ' * '];
  else if (lines[0].startsWith('//')) [line, lead] = [lines[0], '// '];
  else throw new Error(`scripts/${name}：略過 shebang 後，檔頭要從單獨一行的「/**」或「//」開始`);
  // 「—」後面整個沒有字也算（行尾空白常被編輯器刪掉），由下面的空白檢查擋下
  const m = line.startsWith(lead) && line.slice(lead.length).match(/^(\S+) —(?: (.*))?$/);
  if (!m) throw new Error(`scripts/${name}：檔頭第一行要寫成「${lead}${name} — 一句說明」`);
  const [, written, desc = ''] = m;
  if (written !== name) throw new Error(`scripts/${name}：檔頭第一行的檔名是 ${written}，要跟實際的檔名 ${name} 相同`);
  // 先拿掉結尾的「。」再檢查：說明只寫「。」也算空白，不產生空括號
  const text = desc.replace(/。$/, '');
  if (!text.trim()) throw new Error(`scripts/${name}：檔頭第一行「 — 」後面的說明是空白`);
  return text;
}

// files：[{ name, content }]，順序不限
export function scriptsLine(files) {
  // 每支都先檢查檔頭第一行，成對的測試檔不進清單也一樣
  const desc = new Map(files.map(f => [f.name, headerDesc(f)]));
  const segments = [];
  // 依檔名的字母順序（JS 預設排序，- 排在 . 前面）；成對的測試檔不自成一段，所以那段的位置由 module 的檔名決定
  for (const name of [...desc.keys()].sort()) {
    if (name.endsWith('.test.mjs')) {
      // 有同名 module 的測試檔併進 module 那一段
      if (!desc.has(name.replace(/\.test\.mjs$/, '.mjs'))) segments.push(`${name}（${desc.get(name)}）`);
      continue;
    }
    const test = name.replace(/\.mjs$/, '.test.mjs');
    segments.push(desc.has(test) ? `${name}（${desc.get(name)}；單元測試在 ${test}）` : `${name}（${desc.get(name)}）`);
  }
  return 'scripts/'.padEnd(COLUMN) + segments.join('、');
}
