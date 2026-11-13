/**
 * glossary.mjs — 詞彙表 _Avoid_ 詞的檢查
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
