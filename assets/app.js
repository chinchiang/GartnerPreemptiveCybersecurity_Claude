/* Preemptive Cybersecurity Playbook — 單頁應用程式（hash 路由，無框架、無外部相依） */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const md = (s, opts) => window.MD.render(s || '', opts).html;
  const inline = (s) => window.MD.inline(s || '');
  const D = {
    research: window.RESEARCH_DOCS || [], guides: window.GUIDE_DOCS || [], skills: window.SKILL_FILES || [], caseData: window.CASE_DATA,
    stages: window.PROCESS_STAGES || [], io: window.IO_ITEMS || [], platforms: window.PLATFORMS || [], sources: window.SOURCES || [], todo: window.TODO_ITEMS || [],
    manifest: window.BUILD_MANIFEST || {}
  };
  const PLATFORM_META = { claude: 'Claude', chatgpt: 'ChatGPT', grok: 'Grok', glm: 'GLM', deepseek: 'DeepSeek', shared: '共用規格' };
  const PLATFORM_ORDER = ['shared', 'chatgpt', 'claude', 'grok', 'glm', 'deepseek'];
  const TAG = { fact: '<span class="pill fact">Gartner 明確陳述</span>', third: '<span class="pill">其他來源</span>', infer: '<span class="pill infer">本專案推論</span>', rec: '<span class="pill rec">建議</span>', todo: '<span class="pill todo">待驗證</span>' };

  // ---------- 工具 ----------
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('已複製到剪貼簿'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('已複製到剪貼簿'); } catch { toast('複製失敗，請手動選取'); }
      ta.remove();
    }
  }
  function download(name, text, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`已開始下載 ${name}`);
  }
  const srcLink = (id) => {
    const s = D.sources.find(x => x.id === id);
    return s ? `<a href="#/sources?focus=${encodeURIComponent(id)}" title="${esc(s.title)}">[${esc(id)}]</a>` : `[${esc(id)}]`;
  };
  const srcLinks = (ids = []) => ids.map(srcLink).join(' ');
  const parseQuery = (hash) => {
    const q = {}; const i = hash.indexOf('?');
    if (i >= 0) for (const [k, v] of new URLSearchParams(hash.slice(i + 1))) q[k] = v;
    return q;
  };

  // ---------- 路由 ----------
  const routes = {
    '/': viewHome, '/methodology': viewMethodology, '/process': viewProcess, '/io': viewIO, '/platforms': viewPlatforms,
    '/skills': viewSkills, '/guides': viewGuides, '/case': viewCase, '/sources': viewSources, '/deploy': viewDeploy
  };
  const NAV = [
    ['總覽', [['/', '首頁'], ['/methodology', '方法論導覽'], ['/process', '可執行流程'], ['/io', 'Inputs／Outputs 對照']]],
    ['實作', [['/platforms', '平台比較'], ['/skills', 'Skills 專區'], ['/guides', '安裝與使用教學'], ['/case', '案例互動展示']]],
    ['證據', [['/sources', '證據與來源'], ['/deploy', '部署與維護']]]
  ];
  function render() {
    const hash = location.hash || '#/';
    const path = hash.slice(1).split('?')[0].split('#')[0] || '/';
    const view = routes[path] || viewNotFound;
    const main = $('#main');
    main.innerHTML = '';
    document.title = `${(NAV.flatMap(g => g[1]).find(r => r[0] === path) || ['', 'Preemptive Cybersecurity'])[1]} · 先制型資安 Playbook`;
    $$('.sidebar nav a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === `#${path}` ? 'page' : 'false'));
    $('.sidebar').classList.remove('open');
    try { view(main, parseQuery(hash)); } catch (e) { main.innerHTML = `<div class="callout danger"><strong>頁面渲染錯誤：</strong>${esc(e.message)}</div>`; console.error(e); }
    const anchor = hash.split('#')[2];
    if (anchor) { const el = document.getElementById(anchor); if (el) el.scrollIntoView(); } else window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  }

  // ---------- 首頁 ----------
  function viewHome(el) {
    const gartnerCount = D.sources.filter(s => s.type === 'gartner').length;
    el.innerHTML = `
      <div class="hero">
        <h1>Gartner「Preemptive Cybersecurity（先制型資安）」研究與五平台 Skills Playbook</h1>
        <p class="lead">從 Gartner 公開資料出發，拆解先制型資安的必要輸入、處理流程與可能輸出；再將可驗證的概念轉為可在 ChatGPT、Claude、Grok、GLM、DeepSeek 上執行的 skills 或等效工作流程，並以合成資料示範。</p>
        <div class="btn-row">
          <a class="btn" href="#/methodology">閱讀方法論研究</a>
          <a class="btn secondary" href="#/skills">取得五平台 Skills</a>
          <a class="btn secondary" href="#/case">互動案例</a>
        </div>
      </div>
      <div class="callout warn"><strong>誠實聲明：</strong>本站區分四種內容標記：${TAG.fact}${TAG.third}${TAG.infer}${TAG.todo}。凡標示「本專案推論」的流程、分類與評分規則，均為本專案依證據整理的實作框架，<strong>不是 Gartner 官方方法論</strong>。付費牆內的 Gartner 研究僅引用公開摘要，未宣稱讀過全文。</div>
      <div class="grid">
        <div class="card"><div class="stat"><span class="v">${D.research.length}</span><span class="l">研究文件章節</span></div></div>
        <div class="card"><div class="stat"><span class="v">${D.io.filter(i => i.kind === 'input').length} / ${D.io.filter(i => i.kind === 'output').length}</span><span class="l">Inputs / Outputs 項目</span></div></div>
        <div class="card"><div class="stat"><span class="v">${D.skills.length}</span><span class="l">Skill 與等效檔案（${PLATFORM_ORDER.filter(p => D.skills.some(s => s.platform === p)).length} 個目錄）</span></div></div>
        <div class="card"><div class="stat"><span class="v">${D.sources.length}</span><span class="l">引用來源（其中 ${gartnerCount} 筆為 Gartner 官方公開資料）</span></div></div>
      </div>
      <h2>本站導覽</h2>
      <div class="grid">
        ${[['#/methodology', '方法論導覽', '定義、目標、與傳統偵測回應的關係、與 CTEM／威脅情資／攻擊面管理等概念的關聯，每項標明來源或推論。'],
      ['#/process', '可執行流程', '八個步驟：目的、輸入、處理、輸出、限制與人工決策點。可點選步驟查看對應的 inputs/outputs。'],
      ['#/io', 'Inputs／Outputs 對照', '依流程階段、必要性、使用對象篩選；每項含來源、格式、頻率、品質、敏感度與缺漏替代方案。'],
      ['#/platforms', '平台比較', '五個平台的模型、承載應用、自訂機制、工具呼叫、檔案與限制，含查證狀態。'],
      ['#/skills', 'Skills 專區', '共用任務規格 + 各平台完整檔案，一鍵複製與下載（含 ZIP）。'],
      ['#/guides', '安裝與使用教學', '切換平台查看逐步設定、使用範例、驗收方式與常見問題。'],
      ['#/case', '案例互動展示', '以合成資料示範輸入如何影響優先序、攻擊路徑假設與輸出；可切換輸入與權重。'],
      ['#/sources', '證據與來源', '所有引用連結、發布日期、查閱日期、付費牆狀態與待驗證清單。']].map(([h, t, d]) => `<a class="card" href="${h}" style="text-decoration:none;color:inherit"><h3 style="margin-top:0">${t}</h3><p class="small">${d}</p></a>`).join('')}
      </div>
      <h2>三句話總結</h2>
      <ol>
        <li>${TAG.fact} Gartner 將 preemptive cybersecurity 描述為在攻擊發生<strong>之前</strong>就預測、阻斷或轉移攻擊者的能力組合，並以 2030 年的市場預測凸顯其重要性。細節與原文引用見 <a href="#/methodology">方法論導覽</a>。</li>
        <li>${TAG.infer} 本專案將其轉化為「授權範圍 → 資料匯集 → 曝險優先序 → 攻擊路徑假設 → 改善與驗證計畫 → 人工審查 → 追蹤」的可執行流程，並明確標示語言模型的能力邊界。</li>
        <li>${TAG.rec} 五個平台各有不同的自訂機制：Claude 有原生 Agent Skills（SKILL.md）；ChatGPT 以 Custom GPT／Projects／Codex skills 承載；Grok、GLM、DeepSeek 主要以系統提示詞與 API 工作流程實作。細節見 <a href="#/platforms">平台比較</a>。</li>
      </ol>
      <p class="small">建置時間：${esc(D.manifest.builtAt || '未知')}。所有內容以 <a href="https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude" target="_blank" rel="noopener">GitHub 儲存庫</a> 為單一來源。</p>`;
  }

  // ---------- 方法論（研究文件） ----------
  function viewMethodology(el, q) {
    const docs = D.research;
    const cur = docs.find(d => d.id === q.doc) || docs[0];
    if (!cur) { el.innerHTML = '<p>尚無研究文件。</p>'; return; }
    const r = window.MD.render(cur.body, { shift: 1 });
    el.innerHTML = `
      <h1>方法論導覽</h1>
      <p class="lead">研究文件完整呈現於本站。內容標記：${TAG.fact}${TAG.third}${TAG.infer}${TAG.rec}${TAG.todo}</p>
      <div class="tabs" role="tablist">${docs.map(d => `<button role="tab" aria-selected="${d.id === cur.id}" data-doc="${d.id}">${esc(d.title)}</button>`).join('')}</div>
      <div class="two-col">
        <article class="doc card" aria-live="polite"><h2 style="border:0;margin-top:0">${esc(cur.title)}</h2>${cur.summary ? `<p class="lead">${esc(cur.summary)}</p>` : ''}${r.html}
          <div class="btn-row"><button class="btn small secondary" id="copy-doc">複製本章 Markdown</button><button class="btn small secondary" id="dl-doc">下載 ${esc(cur.id)}.md</button></div>
        </article>
        <aside><div class="card doc-toc"><strong>本章目錄</strong>${r.toc.map(t => `<a class="${t.level >= 3 ? 'l3' : ''}" href="#/methodology?doc=${cur.id}#${t.id}">${esc(t.text)}</a>`).join('')}</div></aside>
      </div>`;
    $$('[data-doc]', el).forEach(b => b.addEventListener('click', () => { location.hash = `#/methodology?doc=${b.dataset.doc}`; }));
    $('#copy-doc', el).addEventListener('click', () => copyText(cur.body));
    $('#dl-doc', el).addEventListener('click', () => download(`${cur.id}.md`, cur.body, 'text/markdown;charset=utf-8'));
  }

  // ---------- 可執行流程 ----------
  function viewProcess(el, q) {
    const stages = D.stages;
    const cur = stages.find(s => s.id === q.stage) || stages[0];
    const ioById = (id) => D.io.find(i => i.id === id);
    el.innerHTML = `
      <h1>可執行流程（本專案推論框架）</h1>
      <p class="lead">${TAG.infer} 以下八個步驟是本專案依 Gartner 公開描述與 CTEM 五階段整理出的實作框架，並非 Gartner 官方流程。每步標示目的、輸入、處理、輸出、限制與人工決策點。</p>
      <div class="flow" role="group" aria-label="流程步驟">${stages.map(s => `<button class="stage" aria-pressed="${s.id === cur.id}" data-stage="${s.id}"><div class="n">步驟 ${s.n}</div><div class="t">${esc(s.name)}</div><div class="small">${esc(s.en)}</div></button>`).join('')}</div>
      ${cur ? `<div class="card">
        <h2 style="border:0;margin-top:0">步驟 ${cur.n}：${esc(cur.name)} <span class="small">${esc(cur.en)}</span> ${cur.basis === 'gartner' ? TAG.fact : cur.basis === 'ctem' ? '<span class="pill fact">對應 Gartner CTEM 階段</span>' : TAG.infer}</h2>
        <dl class="kv">
          <dt>目的</dt><dd>${inline(cur.purpose)}</dd>
          <dt>輸入</dt><dd>${cur.inputs.map(id => { const i = ioById(id); return i ? `<a href="#/io?focus=${id}" class="pill ${i.necessity === 'required' ? 'req' : 'opt'}">${esc(i.name)}</a>` : esc(id); }).join(' ')}</dd>
          <dt>處理方式</dt><dd>${md(cur.processing)}</dd>
          <dt>輸出</dt><dd>${cur.outputs.map(id => { const i = ioById(id); return i ? `<a href="#/io?focus=${id}" class="pill rec">${esc(i.name)}</a>` : esc(id); }).join(' ')}</dd>
          <dt>限制</dt><dd>${md(cur.limits)}</dd>
          <dt>人工決策點</dt><dd>${md(cur.humanDecision)}</dd>
          <dt>語言模型角色</dt><dd>${inline(cur.llmRole)}</dd>
          <dt>依據</dt><dd>${inline(cur.basisNote)} ${srcLinks(cur.sources)}</dd>
        </dl></div>` : ''}
      <h2>整體流程圖</h2>
      <div class="card"><pre>${esc(stages.map(s => `[${s.n}] ${s.name}`).join('  →  '))}
       ↑                                                                        │
       └──────────────── 追蹤指標回饋、範圍再確認（每週／每次重大變更）──────────┘</pre>
      <p class="small">流程刻意設計為迴圈：追蹤結果回饋到範圍與資料匯集。這與 Gartner CTEM「持續（continuous）」的精神一致，但迴圈設計本身為本專案推論。</p></div>`;
    $$('[data-stage]', el).forEach(b => b.addEventListener('click', () => { location.hash = `#/process?stage=${b.dataset.stage}`; }));
  }

  // ---------- Inputs / Outputs ----------
  function viewIO(el, q) {
    const state = { kind: q.kind || 'all', stage: q.stage || 'all', necessity: q.necessity || 'all', audience: q.audience || 'all', text: q.text || '' };
    const audiences = [...new Set(D.io.flatMap(i => i.audience || []))];
    el.innerHTML = `
      <h1>Inputs／Outputs 對照</h1>
      <p class="lead">${TAG.infer} 輸入與輸出的分類、必要性與品質要求由本專案整理。可依流程階段、必要性、使用對象篩選。點選項目展開細節。</p>
      <div class="filters" role="search">
        <label>類型 <select id="f-kind"><option value="all">全部</option><option value="input">Inputs</option><option value="output">Outputs</option></select></label>
        <label>流程階段 <select id="f-stage"><option value="all">全部</option>${D.stages.map(s => `<option value="${s.id}">${s.n}. ${esc(s.name)}</option>`).join('')}</select></label>
        <label>必要性 <select id="f-nec"><option value="all">全部</option><option value="required">必要</option><option value="recommended">建議</option><option value="optional">選用</option></select></label>
        <label>使用對象 <select id="f-aud"><option value="all">全部</option>${audiences.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}</select></label>
        <label>關鍵字 <input type="text" id="f-text" placeholder="例如 EPSS、資產"></label>
        <span class="small" id="f-count"></span>
      </div>
      <div id="io-list"></div>`;
    const NEC = { required: '<span class="pill req">必要</span>', recommended: '<span class="pill rec">建議</span>', optional: '<span class="pill opt">選用</span>' };
    const stageName = (id) => { const s = D.stages.find(x => x.id === id); return s ? `${s.n}.${s.name}` : id; };
    function draw() {
      const list = D.io.filter(i => (state.kind === 'all' || i.kind === state.kind) && (state.stage === 'all' || i.stages.includes(state.stage)) && (state.necessity === 'all' || i.necessity === state.necessity)
        && (state.audience === 'all' || (i.audience || []).includes(state.audience)) && (!state.text || JSON.stringify(i).toLowerCase().includes(state.text.toLowerCase())));
      $('#f-count').textContent = `顯示 ${list.length} / ${D.io.length} 項`;
      $('#io-list').innerHTML = list.map(i => `
        <details id="io-${i.id}" ${q.focus === i.id ? 'open' : ''}>
          <summary>${i.kind === 'input' ? '⬇ 輸入' : '⬆ 輸出'}：${esc(i.name)} <span class="small">${esc(i.en)}</span> ${NEC[i.necessity] || ''} ${i.stages.map(s => `<span class="pill">${esc(stageName(s))}</span>`).join('')}</summary>
          <dl class="kv" style="margin-top:10px">
            <dt>用途與必要性</dt><dd>${md(i.purpose)}</dd>
            ${i.kind === 'input' ? `
            <dt>資料來源</dt><dd>${md(i.sources)}</dd>
            <dt>格式</dt><dd>${md(i.format)}</dd>
            <dt>更新頻率</dt><dd>${inline(i.frequency)}</dd>
            <dt>品質要求</dt><dd>${md(i.quality)}</dd>
            <dt>敏感程度</dt><dd>${inline(i.sensitivity)}</dd>
            <dt>缺漏時替代方案</dt><dd>${md(i.fallback)}</dd>` : `
            <dt>結構</dt><dd>${md(i.structure)}</dd>
            <dt>範例</dt><dd>${md(i.example)}</dd>
            <dt>對應輸入與判斷依據</dt><dd>${md(i.dependsOn)}</dd>
            <dt>信心水準</dt><dd>${md(i.confidence)}</dd>
            <dt>驗證方式</dt><dd>${md(i.validation)}</dd>`}
            <dt>使用對象</dt><dd>${(i.audience || []).map(a => `<span class="pill">${esc(a)}</span>`).join('')}</dd>
            ${i.sources_refs ? `<dt>依據</dt><dd>${srcLinks(i.sources_refs)}</dd>` : ''}
          </dl>
        </details>`).join('') || '<p>沒有符合的項目。</p>';
      if (q.focus) { const f = document.getElementById(`io-${q.focus}`); if (f) f.scrollIntoView({ block: 'start' }); q.focus = null; }
    }
    $('#f-kind').value = state.kind; $('#f-stage').value = state.stage; $('#f-nec').value = state.necessity; $('#f-aud').value = state.audience; $('#f-text').value = state.text;
    $('#f-kind').addEventListener('change', e => { state.kind = e.target.value; draw(); });
    $('#f-stage').addEventListener('change', e => { state.stage = e.target.value; draw(); });
    $('#f-nec').addEventListener('change', e => { state.necessity = e.target.value; draw(); });
    $('#f-aud').addEventListener('change', e => { state.audience = e.target.value; draw(); });
    $('#f-text').addEventListener('input', e => { state.text = e.target.value; draw(); });
    draw();
  }

  // ---------- 平台比較 ----------
  function viewPlatforms(el) {
    const ST = { verified: '<span class="pill fact">已查證</span>', partial: '<span class="pill infer">部分查證</span>', unverified: '<span class="pill todo">待驗證</span>' };
    const rows = [['模型（查證時）', 'models'], ['承載應用／執行框架', 'hosting'], ['原生自訂／技能機制', 'mechanism'], ['本專案採用的等效格式', 'skillFormat'], ['工具呼叫與連線', 'tools'], ['檔案與知識', 'files'], ['主要限制', 'limits'], ['查證狀態與備註', 'notes']];
    el.innerHTML = `
      <h1>平台比較</h1>
      <p class="lead">五個平台的支援方式、需求與限制。「模型」與「承載模型的應用程式／執行框架」分開描述。查證日期與來源見 <a href="#/sources">證據與來源</a>。</p>
      <div class="table-wrap"><table>
        <thead><tr><th>面向</th>${D.platforms.map(p => `<th>${esc(p.name)}<br><span class="small">${esc(p.vendor)}</span><br>${ST[p.status] || ''}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(([label, key]) => `<tr><th scope="row">${label}</th>${D.platforms.map(p => `<td>${md(p[key])}</td>`).join('')}</tr>`).join('')}
        <tr><th scope="row">來源</th>${D.platforms.map(p => `<td>${srcLinks(p.sources)}</td>`).join('')}</tr></tbody>
      </table></div>
      <h2>共通原則</h2>
      <div class="card">${md(window.PLATFORM_COMMON || '')}</div>
      <h2>各平台摘要卡</h2>
      <div class="grid">${D.platforms.map(p => `<div class="card"><h3 style="margin-top:0">${esc(p.name)} ${ST[p.status] || ''}</h3><p class="small">${md(p.summary)}</p><div class="btn-row"><a class="btn small" href="#/skills?platform=${p.id}">查看 Skill</a><a class="btn small secondary" href="#/guides?platform=${p.id}">安裝教學</a></div></div>`).join('')}</div>`;
  }

  // ---------- Skills ----------
  function viewSkills(el, q) {
    const platforms = PLATFORM_ORDER.filter(p => D.skills.some(s => s.platform === p));
    const cur = platforms.includes(q.platform) ? q.platform : platforms[0];
    const files = D.skills.filter(s => s.platform === cur);
    const curFile = files.find(f => f.path === q.file) || files.find(f => /^SKILL\.md$/i.test(f.name)) || files.find(f => /task-spec\.md$|README\.md$/i.test(f.name)) || files[0];
    const dl = (D.manifest.downloads || []);
    el.innerHTML = `
      <h1>Skills 專區</h1>
      <p class="lead">先閱讀「共用規格」，再選擇平台。所有檔案可一鍵複製或下載；ZIP 下載包由建置腳本產生。</p>
      <div class="btn-row">
        ${dl.includes('downloads/skills-all-platforms.zip') ? '<a class="btn" href="downloads/skills-all-platforms.zip" download>下載全部 Skills + 範例資料（ZIP）</a>' : ''}
        ${dl.includes('downloads/synthetic-example-data.zip') ? '<a class="btn secondary" href="downloads/synthetic-example-data.zip" download>下載合成範例資料（ZIP）</a>' : ''}
        <a class="btn secondary" href="https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude/tree/main/skills" target="_blank" rel="noopener">在 GitHub 檢視 skills/</a>
      </div>
      <div class="tabs" role="tablist">${platforms.map(p => `<button role="tab" aria-selected="${p === cur}" data-platform="${p}">${PLATFORM_META[p] || p}</button>`).join('')}</div>
      <div class="two-col">
        <div>
          <div class="card">
            <div class="btn-row"><strong style="flex:1">${esc(curFile?.path || '')}</strong>
              <button class="btn small" id="copy-file">複製內容</button>
              <button class="btn small secondary" id="dl-file">下載檔案</button>
              ${dl.includes(`downloads/skills-${cur}.zip`) ? `<a class="btn small secondary" href="downloads/skills-${cur}.zip" download>下載 ${PLATFORM_META[cur]} ZIP</a>` : ''}
              <button class="btn small secondary" id="toggle-view" aria-pressed="false">切換：原始／渲染</button>
            </div>
            <div id="file-rendered" class="doc" hidden>${curFile && curFile.ext === 'md' ? md(curFile.content, { shift: 1 }) : ''}</div>
            <pre id="file-raw"><code>${esc(curFile?.content || '')}</code></pre>
          </div>
        </div>
        <aside><div class="card"><strong>${PLATFORM_META[cur]} 檔案（${files.length}）</strong><div class="doc-toc">${files.map(f => `<a href="#/skills?platform=${cur}&file=${encodeURIComponent(f.path)}" ${f === curFile ? 'style="font-weight:700;color:var(--accent)"' : ''}>${esc(f.path.replace(`skills/${cur}/`, ''))}</a>`).join('')}</div></div></aside>
      </div>`;
    $$('[data-platform]', el).forEach(b => b.addEventListener('click', () => { location.hash = `#/skills?platform=${b.dataset.platform}`; }));
    if (curFile) {
      $('#copy-file').addEventListener('click', () => copyText(curFile.content));
      $('#dl-file').addEventListener('click', () => download(curFile.name, curFile.content, curFile.ext === 'json' ? 'application/json' : 'text/plain;charset=utf-8'));
      $('#toggle-view').addEventListener('click', (e) => {
        const raw = $('#file-raw'), ren = $('#file-rendered');
        const showRen = raw.hidden === false && curFile.ext === 'md';
        raw.hidden = showRen; ren.hidden = !showRen; e.currentTarget.setAttribute('aria-pressed', String(showRen));
        if (curFile.ext !== 'md') toast('此檔案非 Markdown，僅提供原始檢視');
      });
    }
  }

  // ---------- 安裝與使用教學 ----------
  function viewGuides(el, q) {
    const platforms = PLATFORM_ORDER.filter(p => D.guides.some(g => g.platform === p));
    const cur = platforms.includes(q.platform) ? q.platform : platforms[0];
    const g = D.guides.find(x => x.platform === cur);
    const r = g ? window.MD.render(g.body, { shift: 1 }) : { html: '<p>尚無教學。</p>', toc: [] };
    el.innerHTML = `
      <h1>安裝與使用教學</h1>
      <p class="lead">切換平台查看逐步設定、輸入格式、使用範例、預期結果、驗收方式、常見問題與機敏資料邊界。</p>
      <div class="tabs" role="tablist">${platforms.map(p => `<button role="tab" aria-selected="${p === cur}" data-platform="${p}">${PLATFORM_META[p] || p}</button>`).join('')}</div>
      <div class="two-col">
        <article class="doc card">${r.html}<div class="btn-row"><button class="btn small secondary" id="copy-guide">複製本教學 Markdown</button></div></article>
        <aside><div class="card doc-toc"><strong>目錄</strong>${r.toc.map(t => `<a class="${t.level >= 3 ? 'l3' : ''}" href="#/guides?platform=${cur}#${t.id}">${esc(t.text)}</a>`).join('')}</div></aside>
      </div>`;
    $$('[data-platform]', el).forEach(b => b.addEventListener('click', () => { location.hash = `#/guides?platform=${b.dataset.platform}`; }));
    if (g) $('#copy-guide').addEventListener('click', () => copyText(g.body));
  }

  // ---------- 案例互動展示 ----------
  function viewCase(el) {
    const data = D.caseData;
    if (!data) { el.innerHTML = '<p>缺少案例資料。</p>'; return; }
    const params = JSON.parse(JSON.stringify(window.DEMO.DEFAULTS));
    el.innerHTML = `
      <h1>案例互動展示：Northwind Precision（合成資料）</h1>
      <div class="callout danger"><strong>示範規則與限制：</strong>本頁所有資料皆為<strong>合成</strong>（公司、主機、帳號、弱點編號 <code>SYN-*</code>、威脅行為者皆虛構）。評分規則是本專案為了展示「輸入如何影響輸出」而設計的簡化規則，<strong>不是 Gartner 的公式，也不是任何真實風險模型</strong>。輸出僅為「假設」，未經任何實際驗證；真實環境必須經授權的安全驗證與人工審查。</div>
      <div class="two-col">
        <div>
          <div class="card">
            <h3 style="margin-top:0">1. 輸入資料（可切換以觀察影響）</h3>
            <div id="input-toggles">${[['exposures', '外部曝險（EASM）'], ['epss', 'EPSS／KEV 利用可能性'], ['identities', '身分與權限'], ['misconfig', '設定基準偏差'], ['controls', '既有控制措施'], ['threatIntel', '威脅情資'], ['topology', '網路拓樸／信任關係（攻擊路徑）']].map(([k, l]) => `<label class="checkbox-row"><input type="checkbox" data-input="${k}" checked> ${l}</label>`).join('')}</div>
            <div class="range-row"><label for="inv">資產清冊完整度</label><input type="range" id="inv" min="30" max="100" step="10" value="100"><span id="inv-v">100%</span></div>
            <label class="checkbox-row">風險胃納 <select id="appetite"><option value="strict">嚴格</option><option value="balanced" selected>平衡</option><option value="tolerant">寬鬆</option></select></label>
            <details><summary>權重（進階）</summary>${Object.keys(params.weights).map(k => `<div class="range-row"><label for="w-${k}">${{ exposure: '外部曝露', exploit: '利用可能性', identity: '身分弱點', control: '控制缺口', intel: '威脅情資', impact: '業務影響' }[k]}</label><input type="range" id="w-${k}" data-weight="${k}" min="0" max="2" step="0.1" value="${params.weights[k]}"><span id="w-${k}-v">${params.weights[k]}</span></div>`).join('')}</details>
            <div class="btn-row"><button class="btn small secondary" id="reset">重設</button><button class="btn small secondary" id="dl-json">下載輸出 JSON</button><button class="btn small secondary" id="copy-md">複製報告 Markdown</button></div>
          </div>
          <div id="case-output"></div>
        </div>
        <aside>
          <div class="card"><strong>輸入資料檔</strong><div class="doc-toc">${['assets.csv', 'vulnerabilities.csv', 'identities.csv', 'misconfigurations.csv', 'controls.json', 'threat-intel.json', 'topology.json', 'exposures.json', 'scope.json'].map(f => `<a href="https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude/blob/main/examples/synthetic-org/${f}" target="_blank" rel="noopener">${f}</a>`).join('')}</div>
          <p class="small">授權範圍：${esc(data.scope.authorized_scope.authorization_reference)}；主動測試授權：<strong>${data.scope.authorized_scope.active_testing_authorized ? '是' : '否'}</strong>；外部掃描授權：<strong>${data.scope.authorized_scope.external_scanning_authorized ? '是' : '否'}</strong></p></div>
          <div class="card"><strong>示範規則摘要</strong><p class="small">可能性 = 對外曝露 3 + EASM 議題 0.5 + 公開利用程式 2 + EPSS×3 + KEV 3 + 身分弱點 + 設定偏差 + 控制缺口 − 既有控制 + 情資命中（依行為者信心 2／1.5／1）（各乘權重，上限 10）<br>影響 = 業務重要性×1.4 + 資料等級（Restricted 3／Confidential 2／Internal 1）+2 若為 crown jewel +2 若為可達 crown jewel 的入口（上限 10）<br>分數 = 可能性 × 影響（0–100）；平衡胃納 P1 ≥ 60、P2 ≥ 40、P3 ≥ 20。<br>信心水準依缺少的輸入類別數下修。攻擊路徑可行性 = 入口可能性×0.5 + 最弱節點×0.3 + 身分／設定邊×1 − (跳數−1)×0.6。</p></div>
        </aside>
      </div>`;
    let last;
    function draw() {
      const R = window.DEMO.analyze(data, params); last = R;
      const A = (id) => data.assets.find(a => a.asset_id === id)?.name || id;
      $('#case-output').innerHTML = `
        ${R.missingSummary.length ? `<div class="callout warn"><strong>資料缺漏影響：</strong>${R.missingSummary.map(esc).join('；')}。信心水準已相應下修，輸出應視為「初步」。</div>` : '<div class="callout ok">所有輸入類別皆提供；仍須人工審查與授權驗證。</div>'}
        <div class="card"><h3 style="margin-top:0">2. 曝險優先序（輸出 O1）</h3>
        <div class="table-wrap"><table><thead><tr><th>優先序</th><th>資產</th><th>發現</th><th>分數</th><th>可能性</th><th>影響</th><th>信心</th><th>判斷依據</th></tr></thead>
        <tbody>${R.findings.map(f => `<tr><td><span class="score ${f.priority}">${f.priority}</span></td><td>${esc(f.asset.name)}<br><span class="small">${esc(f.asset.type)}${f.asset.internet_exposed ? ' · 對外' : ''}</span></td><td>${esc(f.title)}<br><span class="small">${esc(f.vuln_id)} · CVSS ${f.cvss_base}</span></td><td><strong>${f.score}</strong><div class="bar"><span style="width:${f.score}%"></span></div></td><td>${f.likelihood.toFixed(1)}</td><td>${f.impact.toFixed(1)}</td><td>${f.confidence}${f.missing.length ? `<br><span class="small">缺：${f.missing.map(esc).join('、')}</span>` : ''}</td><td class="small">${f.factors.map(esc).join('；')}</td></tr>`).join('')}</tbody></table></div>
        <p class="small">門檻（分數）：P1 ≥ ${R.thresholds[0]}、P2 ≥ ${R.thresholds[1]}、P3 ≥ ${R.thresholds[2]}（風險胃納：${{ strict: '嚴格', balanced: '平衡', tolerant: '寬鬆' }[R.params.riskAppetite]}）</p></div>
        <div class="card"><h3 style="margin-top:0">3. 攻擊路徑假設（輸出 O2）</h3>
        ${R.hypotheses.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>路徑（入口 → 目標）</th><th>跳數</th><th>可行性（0–10）</th><th>假設依據</th></tr></thead><tbody>${R.hypotheses.map((h, i) => `<tr><td>${i + 1}</td><td>internet → ${h.nodes.map(A).map(esc).join(' → ')}</td><td>${h.hops}</td><td><strong>${h.feasibility}</strong><div class="bar"><span style="width:${h.feasibility * 10}%"></span></div></td><td class="small">${h.edges.map(e => esc(e.via)).join(' → ')}</td></tr>`).join('')}</tbody></table></div>` : '<p>未提供拓樸資料，無法產生攻擊路徑假設（改為僅依單一資產曝險排序）。</p>'}
        <p class="small">「假設」表示依據拓樸與弱點推論的可能路徑，<strong>未經驗證</strong>；驗證需授權的安全測試。</p></div>
        <div class="card"><h3 style="margin-top:0">4. 改善建議（輸出 O3）</h3>
        <div class="table-wrap"><table><thead><tr><th>優先</th><th>資產</th><th>行動</th><th>負責</th><th>工作量</th><th>驗證方式</th><th>核准</th></tr></thead><tbody>${R.recs.map(r => `<tr><td><span class="score ${r.priority}">${r.priority}</span></td><td>${esc(r.asset)}</td><td>${esc(r.action)}</td><td>${esc(r.owner)}</td><td>${esc(r.effort)}</td><td class="small">${esc(r.verify)}</td><td class="small">${esc(r.approval)}</td></tr>`).join('')}</tbody></table></div>
        ${R.compensating.length ? `<h4>補償控制缺口</h4><ul>${R.compensating.map(c => `<li><strong>${esc(c.control)}</strong>：缺口 ${esc(c.gaps)}${c.note ? `（${esc(c.note)}）` : ''}</li>`).join('')}</ul>` : ''}</div>
        <div class="card"><h3 style="margin-top:0">5. 安全驗證計畫（輸出 O4，僅為提案）</h3>
        <div class="table-wrap"><table><thead><tr><th>#</th><th>待驗證假設</th><th>方法</th><th>授權狀態</th><th>成功準則</th></tr></thead><tbody>${R.validation.map(v => `<tr><td>${v.id}</td><td>${esc(v.hypothesis)}</td><td>${esc(v.method)}</td><td>${esc(v.requires)}</td><td>${esc(v.success)}</td></tr>`).join('') || '<tr><td colspan="5">無攻擊路徑假設，無驗證計畫。</td></tr>'}</tbody></table></div></div>
        <div class="card"><h3 style="margin-top:0">6. 人工審查點（必經）</h3><ol class="steps">${R.reviewPoints.map(p => `<li><strong>${esc(p.stage)}</strong>（${esc(p.who)}）：${esc(p.what)}</li>`).join('')}</ol></div>
        <div class="card"><h3 style="margin-top:0">7. 管理摘要（輸出 O5）</h3>${md(execSummary(R))}</div>
        <div class="card"><h3 style="margin-top:0">8. 追蹤指標（輸出 O6）</h3><div class="table-wrap"><table><thead><tr><th>指標</th><th>目前值</th><th>目標</th></tr></thead><tbody>${R.metrics.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.value)}</td><td>${esc(m.target)}</td></tr>`).join('')}</tbody></table></div>
        <h4>後續追蹤（示範時間軸）</h4><div class="timeline">${[['T+0', '產出初版優先序與假設；提交人工審查'], ['T+2 天', '系統擁有者確認 P1 排序；CISO 決定是否授權外部驗證'], ['T+7 天', '對外曝露 P1 完成修補或緩解；重新執行分析比較差異'], ['T+14 天', '完成授權驗證；更新攻擊路徑狀態（已阻斷／仍可行）'], ['每週', '追蹤指標更新；範圍與資料品質再確認']].map(([t, d]) => `<div class="ev"><strong>${t}</strong> ${d}</div>`).join('')}</div></div>`;
    }
    function execSummary(R) {
      const p1 = R.findings.filter(f => f.priority === 'P1');
      const ext = p1.filter(f => f.asset.internet_exposed);
      const top = R.hypotheses[0];
      return `**對象：** ${data.scope.reporting.audience.join('、')}｜**日期：** ${data.scope.analysis_date}｜**信心：** ${R.findings.filter(f => f.confidence === '高').length}/${R.findings.length} 項高信心

1. 本週共 ${R.findings.length} 項發現納入分析，其中 **${p1.length} 項 P1**（${ext.length} 項對外曝露）。${ext.length ? `最急迫：${ext.slice(0, 2).map(f => `${f.asset.name}（${f.title}）`).join('、')}。` : ''}
2. ${top ? `最可行的攻擊路徑假設：internet → ${top.nodes.map(id => data.assets.find(a => a.asset_id === id)?.name).join(' → ')}（可行性 ${top.feasibility}/10），關鍵阻斷點為身分與網段控制。` : '未提供拓樸資料，本週不產生攻擊路徑假設。'}
3. 建議決策：核准 P1 修補排程與補償控制；${data.scope.authorized_scope.active_testing_authorized ? '執行已授權驗證' : '**尚未授權主動驗證**，請決定是否授權（排除 OT）'}。
4. 限制：${R.missingSummary.length ? R.missingSummary.join('；') : '無重大資料缺漏'}；所有攻擊路徑為假設，未經驗證。`;
    }
    function reportMd(R) {
      return `# 先制型曝險分析報告（合成示範）\n\n${execSummary(R)}\n\n## 曝險優先序\n\n| 優先序 | 資產 | 發現 | 分數 | 信心 | 依據 |\n|---|---|---|---|---|---|\n${R.findings.map(f => `| ${f.priority} | ${f.asset.name} | ${f.title} (${f.vuln_id}) | ${f.score} | ${f.confidence} | ${f.factors.join('；')} |`).join('\n')}\n\n## 攻擊路徑假設（未驗證）\n\n${R.hypotheses.map((h, i) => `${i + 1}. internet → ${h.nodes.map(id => data.assets.find(a => a.asset_id === id)?.name).join(' → ')}（可行性 ${h.feasibility}/10）`).join('\n')}\n\n## 改善建議\n\n${R.recs.map(r => `- [${r.priority}] ${r.asset}：${r.action}（負責：${r.owner}；核准：${r.approval}）`).join('\n')}\n\n## 安全驗證計畫（提案）\n\n${R.validation.map(v => `- ${v.id} ${v.hypothesis}：${v.method}；${v.requires}`).join('\n')}\n\n## 追蹤指標\n\n${R.metrics.map(m => `- ${m.name}：${m.value}（目標 ${m.target}）`).join('\n')}\n\n> 所有資料為合成；評分規則為本專案示範用簡化規則，非 Gartner 公式。`;
    }
    $$('[data-input]', el).forEach(c => c.addEventListener('change', e => { params.inputs[e.target.dataset.input] = e.target.checked; draw(); }));
    $('#inv').addEventListener('input', e => { params.inventoryCompleteness = Number(e.target.value); $('#inv-v').textContent = `${e.target.value}%`; draw(); });
    $('#appetite').addEventListener('change', e => { params.riskAppetite = e.target.value; draw(); });
    $$('[data-weight]', el).forEach(r => r.addEventListener('input', e => { params.weights[e.target.dataset.weight] = Number(e.target.value); $(`#w-${e.target.dataset.weight}-v`).textContent = e.target.value; draw(); }));
    $('#reset').addEventListener('click', () => { location.reload(); });
    $('#dl-json').addEventListener('click', () => download('preemptive-analysis-output.json', JSON.stringify({ _note: '合成示範輸出，非真實風險評估', params: last.params, findings: last.findings.map(({ asset, ...f }) => ({ ...f, asset_name: asset.name })), hypotheses: last.hypotheses, recommendations: last.recs, validation: last.validation, metrics: last.metrics }, null, 2), 'application/json'));
    $('#copy-md').addEventListener('click', () => copyText(reportMd(last)));
    draw();
  }

  // ---------- 證據與來源 ----------
  function viewSources(el, q) {
    const TYPE = { gartner: 'Gartner 官方', 'third-party': '第三方／媒體', vendor: '廠商', 'platform-doc': '平台官方文件', standard: '標準／公部門' };
    const state = { type: q.type || 'all', text: '' };
    el.innerHTML = `
      <h1>證據與來源</h1>
      <p class="lead">所有引用之來源、發布日期（如有）、查閱日期與付費牆狀態。Gartner 付費牆內容僅引用公開摘要或新聞稿；未讀全文者一律標示。</p>
      <div class="filters"><label>類型 <select id="s-type"><option value="all">全部</option>${Object.entries(TYPE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label>關鍵字 <input type="text" id="s-text" placeholder="標題、網址、備註"></label><span class="small" id="s-count"></span></div>
      <div id="src-list"></div>
      <h2>待驗證清單</h2>
      <div class="table-wrap"><table><thead><tr><th>項目</th><th>為何待驗證</th><th>驗證方式</th></tr></thead><tbody>${D.todo.map(t => `<tr><td>${md(t.item)}</td><td>${md(t.why)}</td><td>${md(t.how)}</td></tr>`).join('')}</tbody></table></div>
      <h2>連結檢查結果</h2>
      <div class="card">${md(window.LINK_CHECK_NOTE || '尚未記錄。')}</div>`;
    function draw() {
      const list = D.sources.filter(s => (state.type === 'all' || s.type === state.type) && (!state.text || JSON.stringify(s).toLowerCase().includes(state.text.toLowerCase())));
      $('#s-count').textContent = `顯示 ${list.length} / ${D.sources.length} 筆`;
      $('#src-list').innerHTML = `<div class="table-wrap"><table><thead><tr><th>ID</th><th>標題</th><th>發布者</th><th>發布日期</th><th>查閱日期</th><th>類型</th><th>付費牆</th><th>備註／用途</th></tr></thead><tbody>${list.map(s => `<tr id="src-${esc(s.id)}" ${q.focus === s.id ? 'style="outline:2px solid var(--accent)"' : ''}><td>${esc(s.id)}</td><td><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></td><td>${esc(s.publisher)}</td><td>${esc(s.date || '未標示')}</td><td>${esc(s.accessed)}</td><td>${TYPE[s.type] || esc(s.type)}</td><td>${s.paywalled ? '<span class="pill todo">是（僅公開摘要）</span>' : '否'}</td><td class="small">${md(s.note)}</td></tr>`).join('')}</tbody></table></div>`;
      if (q.focus) { const f = document.getElementById(`src-${q.focus}`); if (f) f.scrollIntoView({ block: 'center' }); q.focus = null; }
    }
    $('#s-type').value = state.type;
    $('#s-type').addEventListener('change', e => { state.type = e.target.value; draw(); });
    $('#s-text').addEventListener('input', e => { state.text = e.target.value; draw(); });
    draw();
  }

  // ---------- 部署 ----------
  function viewDeploy(el) {
    const g = D.guides.find(x => x.id === 'deployment') || D.guides.find(x => x.platform === '' && /deploy/i.test(x.id));
    el.innerHTML = `<h1>部署與維護</h1><article class="doc card">${g ? md(g.body, { shift: 1 }) : '<p>尚無部署文件。</p>'}</article>`;
  }
  function viewNotFound(el) { el.innerHTML = '<h1>找不到頁面</h1><p><a href="#/">回首頁</a></p>'; }

  // ---------- 全站搜尋 ----------
  function buildIndex() {
    const idx = [];
    for (const d of D.research) {
      const sections = d.body.split(/\n(?=#{1,3} )/);
      for (const s of sections) {
        const t = (s.match(/^#{1,3}\s+(.*)/) || [])[1] || d.title;
        const used = new Set();
        idx.push({ kind: '研究', title: `${d.title} › ${t}`, text: s.replace(/[#*`>|]/g, ' '), href: `#/methodology?doc=${d.id}#${window.MD.render(`# ${t}`).toc[0]?.id || ''}` });
      }
    }
    for (const i of D.io) idx.push({ kind: i.kind === 'input' ? 'Input' : 'Output', title: `${i.name} ${i.en}`, text: [i.purpose, i.sources, i.format, i.fallback, i.structure, i.example].join(' '), href: `#/io?focus=${i.id}` });
    for (const s of D.stages) idx.push({ kind: '流程', title: `步驟 ${s.n} ${s.name}`, text: [s.purpose, s.processing, s.limits, s.humanDecision].join(' '), href: `#/process?stage=${s.id}` });
    for (const p of D.platforms) idx.push({ kind: '平台', title: p.name, text: [p.models, p.hosting, p.mechanism, p.limits, p.notes].join(' '), href: '#/platforms' });
    for (const f of D.skills) idx.push({ kind: 'Skill', title: f.path, text: f.content, href: `#/skills?platform=${f.platform}&file=${encodeURIComponent(f.path)}` });
    for (const g of D.guides) idx.push({ kind: '教學', title: g.title, text: g.body, href: g.platform ? `#/guides?platform=${g.platform}` : '#/deploy' });
    for (const s of D.sources) idx.push({ kind: '來源', title: s.title, text: [s.url, s.publisher, s.note].join(' '), href: `#/sources?focus=${s.id}` });
    return idx;
  }
  let INDEX;
  function search(qs) {
    INDEX ||= buildIndex();
    const terms = qs.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return INDEX.map(e => {
      const hay = (e.title + ' ' + e.text).toLowerCase();
      let score = 0;
      for (const t of terms) { if (!hay.includes(t)) return null; score += e.title.toLowerCase().includes(t) ? 5 : 1; }
      const pos = hay.indexOf(terms[0]);
      const snippet = e.text.slice(Math.max(0, pos - 40), pos + 80).replace(/\s+/g, ' ');
      return { ...e, score, snippet };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 12);
  }
  function setupSearch() {
    const input = $('#search'), box = $('#search-results');
    const hl = (s, terms) => { let t = esc(s); for (const term of terms) t = t.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`); return t; };
    input.addEventListener('input', () => {
      const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      const res = search(input.value);
      box.innerHTML = res.map(r => `<a href="${r.href}"><div class="kind">${esc(r.kind)}</div><div>${hl(r.title, terms)}</div><div class="small">…${hl(r.snippet, terms)}…</div></a>`).join('') || (input.value.trim() ? '<a href="#/">沒有結果</a>' : '');
    });
    input.addEventListener('keydown', e => { if (e.key === 'Escape') { box.innerHTML = ''; input.blur(); } if (e.key === 'ArrowDown') { box.querySelector('a')?.focus(); e.preventDefault(); } });
    box.addEventListener('click', () => { box.innerHTML = ''; input.value = ''; });
    document.addEventListener('click', e => { if (!e.target.closest('.search-box')) box.innerHTML = ''; });
  }

  // ---------- 初始化 ----------
  function init() {
    $('.sidebar nav').innerHTML = NAV.map(([g, items]) => `<div class="group">${g}</div>${items.map(([h, t]) => `<a href="#${h}">${t}</a>`).join('')}`).join('');
    $('#menu-btn').addEventListener('click', () => { const s = $('.sidebar'); s.classList.toggle('open'); $('#menu-btn').setAttribute('aria-expanded', s.classList.contains('open')); });
    const themeBtn = $('#theme-btn');
    const applyTheme = (t) => { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); themeBtn.textContent = t === 'dark' ? '☀︎ 淺色' : t === 'light' ? '☾ 深色' : '◐ 主題'; };
    let theme = null; try { theme = localStorage.getItem('theme'); } catch { }
    applyTheme(theme);
    themeBtn.addEventListener('click', () => { theme = theme === 'dark' ? 'light' : theme === 'light' ? null : 'dark'; try { theme ? localStorage.setItem('theme', theme) : localStorage.removeItem('theme'); } catch { } applyTheme(theme); });
    setupSearch();
    window.addEventListener('hashchange', render);
    render();
  }
  document.addEventListener('DOMContentLoaded', init);
  window.APP = { search, copyText, download };
})();
