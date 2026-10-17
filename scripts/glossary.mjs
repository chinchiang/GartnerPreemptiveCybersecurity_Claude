/**
 * glossary.mjs
 * 詞彙表（GLOSSARY.md）的 _Avoid_ 詞檢查：手寫的檔案不使用專指的 _Avoid_ 詞（見 docs/agents/domain.md）。
 * interface 是純函式：輸入文字、回傳結果，讀檔交給呼叫端（scripts/glossary.test.mjs），不碰磁碟就能測試。
 */

// 每個詞條的 _Avoid_ 詞：[{ entry, term }]，依詞彙表的順序
export function avoidTerms(md) {
  const terms = [];
  let entry = null;
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(/^\*\*(.+?)\*\*：$/);
    if (heading) entry = heading[1];
    const avoid = line.match(/^_Avoid_: (.+)$/);
    if (avoid && entry) for (const term of avoid[1].split('、')) terms.push({ entry, term: term.trim() });
  }
  return terms;
}

// .ignore 的小子集（本 repo 用到的寫法）：結尾斜線＝目錄底下全部；* 對應一段路徑裡的任意字元（不跨 /）；其餘是完整路徑。
// 回傳 (path) => 是否略過；path 是相對於 repo 根目錄、以 / 分隔的路徑
export function ignoreMatcher(ignoreText) {
  const escape = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const patterns = ignoreText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    .map(p => new RegExp('^' + escape(p).replace(/\*/g, '[^/]*') + (p.endsWith('/') ? '' : '$')));
  return (path) => patterns.some(re => re.test(path));
}

// 手寫檔案裡專指的 _Avoid_ 詞：回傳 [{ file, line, term, entry }]，同一行同一個詞只回報一次。
// excluded：{ 詞: 理由 }，有其他正當意思的一般詞彙，不檢查。
// allowed：[{ term, phrase, reason }]，正當的片語；只遮掉片語涵蓋的那一處，同一行另有沒被涵蓋的出現就照樣回報。
export function avoidHits(terms, files, { excluded = {}, allowed = [] } = {}) {
  const hits = [];
  for (const { path, content } of files) {
    content.replace(/\r\n/g, '\n').split('\n').forEach((text, i) => {
      for (const { entry, term } of terms) {
        if (term in excluded) continue;
        let masked = text;
        for (const a of allowed) if (a.term === term) masked = masked.split(a.phrase).join(' '.repeat(a.phrase.length));
        if (masked.includes(term)) hits.push({ file: path, line: i + 1, term, entry });
      }
    });
  }
  return hits;
}
