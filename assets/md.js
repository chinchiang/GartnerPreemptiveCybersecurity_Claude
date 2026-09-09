/* 極簡 Markdown 轉 HTML（無外部相依）。支援：標題、段落、粗體/斜體/行內碼、連結、清單（含巢狀兩層）、
   有序清單、表格、程式碼區塊、引用、水平線、HTML 註解略過。輸出會做 HTML escape 以避免注入。 */
(function () {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function inline(s) {
    let t = esc(s);
    // 程式碼先保護
    const codes = [];
    t = t.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, a, b) => {
      const ext = /^https?:\/\//i.test(b) ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${b}"${ext}>${a}</a>`;
    });
    t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
    return t;
  }
  const slug = (s, used) => {
    let base = s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'h';
    let id = base, n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };
  function render(md, opts = {}) {
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    const toc = [];
    const used = new Set();
    let i = 0;
    const listStack = [];
    const closeLists = (toDepth = 0) => { while (listStack.length > toDepth) out.push(`</${listStack.pop()}>`); };
    let para = [];
    const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
    while (i < lines.length) {
      let line = lines[i];
      if (/^\s*<!--/.test(line)) { while (i < lines.length && !/-->\s*$/.test(lines[i])) i++; i++; continue; }
      if (/^```/.test(line)) {
        flushPara(); closeLists();
        const lang = line.slice(3).trim();
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre data-lang="${esc(lang)}"><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        flushPara(); closeLists();
        const level = h[1].length + (opts.shift || 0);
        const text = inline(h[2].trim());
        const id = slug(h[2].trim(), used);
        if (level <= 3) toc.push({ level, text: h[2].trim(), id });
        out.push(`<h${Math.min(level, 6)} id="${id}">${text}</h${Math.min(level, 6)}>`);
        i++; continue;
      }
      if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushPara(); closeLists(); out.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(line)) {
        flushPara(); closeLists();
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push(`<blockquote>${render(buf.join('\n'), opts).html}</blockquote>`);
        continue;
      }
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        flushPara(); closeLists();
        const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push(`<div class="table-wrap"><table><thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (li) {
        flushPara();
        const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2) + 1;
        const type = /\d/.test(li[2]) ? 'ol' : 'ul';
        while (listStack.length > depth) out.push(`</${listStack.pop()}>`);
        while (listStack.length < depth) { listStack.push(type); out.push(`<${type}>`); }
        let text = li[3];
        // 續行（縮排且非清單）
        while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i + 1])) text += ' ' + lines[++i].trim();
        const task = text.match(/^\[( |x)\]\s+(.*)$/i);
        out.push(task ? `<li><input type="checkbox" disabled ${task[1].toLowerCase() === 'x' ? 'checked' : ''}> ${inline(task[2])}</li>` : `<li>${inline(text)}</li>`);
        i++; continue;
      }
      if (!line.trim()) { flushPara(); closeLists(); i++; continue; }
      if (listStack.length && /^\s{2,}/.test(line)) { i++; continue; }
      closeLists();
      para.push(line.trim());
      i++;
    }
    flushPara(); closeLists();
    return { html: out.join('\n'), toc };
  }
  window.MD = { render, esc, inline };
})();
