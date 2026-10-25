/**
 * frontmatter.mjs — Markdown frontmatter 的判斷規則，建置讀標題與 Skills 專區渲染檢視共用
 * Markdown 檔首 frontmatter 的唯一判斷規則：檔案以 `---` 開頭、且之後有一行 `---` 閉合，兩者之間就是 frontmatter。
 * 建置（build-outputs.mjs）用它讀研究文件、指南、Skills 檔案的標題，也用 bodyStart 告訴網站 Skills 專區的渲染檢視從哪裡開始
 * （原始碼檢視、複製、下載仍用含 frontmatter 的原文）。接受 CRLF；欄位只解析單行的 `key: value`。
 */
export function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return { meta: {}, body: md, bodyStart: 0 };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return { meta, body: md.slice(m[0].length), bodyStart: m[0].length };
}
