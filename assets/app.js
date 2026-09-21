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
    manifest: window.BUILD_MANIFEST || {}, extra: window.EXTRA_DOCS || {}
  };
  const PLATFORM_META = { claude: 'Claude', chatgpt: 'ChatGPT', grok: 'Grok', glm: 'GLM', deepseek: 'DeepSeek', shared: '共用規格' };
  const PLATFORM_ORDER = ['shared', 'chatgpt', 'claude', 'grok', 'glm', 'deepseek'];
  const TAG = { fact: '<span class="pill fact">Gartner 明確陳述</span>', third: '<span class="pill">其他來源</span>', infer: '<span class="pill infer">本專案推論</span>', rec: '<span class="pill rec">建議</span>', todo: '<span class="pill todo">待驗證</span>' };
  const VERIFICATION = {
    full: ['已讀全文', 'fact'], 'snippet-multi': ['多來源逐字摘錄', 'fact'], 'snippet-single': ['單一摘錄逐字', 'infer'], paraphrase: ['轉述', 'infer'],
    github: ['官方 GitHub 全文', 'fact'], blocked: ['官方 URL 存在但無法開啟', 'todo'], summary: ['僅公開摘要', 'infer'], 'user-provided': ['使用者提供', 'todo']
  };

  // ---------- 工具 ----------
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('已複製到剪貼簿'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('aria-hidden', 'true');
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
      document.body.appendChild(ta); ta.select();
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
  /** 解析 #/route?a=b#anchor 的查詢字串（先去掉段落錨點） */
  const parseQuery = (hash) => {
    const q = {}; const noAnchor = hash.split('#').slice(0, 2).join('#'); const i = noAnchor.indexOf('?');
    if (i >= 0) for (const [k, v] of new URLSearchParams(noAnchor.slice(i + 1))) q[k] = v;
    return q;
  };
  /** 依 WAI-ARIA Tabs 模式接線：方向鍵切換、roving tabindex。tabs 內每個 button 需有 data-* 屬性供 onSelect 使用。 */
  function wireTabs(tablist, onSelect) {
    const tabs = $$('[role="tab"]', tablist);
    tabs.forEach((t, i) => {
      t.setAttribute('tabindex', t.getAttribute('aria-selected') === 'true' ? '0' : '-1');
      t.addEventListener('click', () => onSelect(t));
      t.addEventListener('keydown', e => {
        const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -i, End: tabs.length - 1 - i }[e.key];
        if (dir === undefined) return;
        e.preventDefault();
        const next = tabs[(i + dir + tabs.length) % tabs.length];
        next.focus(); onSelect(next);
      });
    });
  }
  const tabButton = (id, label, selected, dataKey, panelId) => `<button role="tab" id="tab-${esc(id)}" aria-selected="${selected}" aria-controls="${panelId}" data-${dataKey}="${esc(id)}">${label}</button>`;
  /** 可展開的文件區塊（附錄、證據檔等） */
  const docDetails = (title, body, opts = {}) => `<details class="doc-details"><summary>${esc(title)}</summary><div class="doc">${md(body, { shift: opts.shift ?? 1 })}</div></details>`;

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
  let lastPath = null;
  function render() {
    const hash = location.hash || '#/';
    // 非路由 hash（例如 skip link 的 #main）：只移動焦點，不重新渲染
    if (!hash.startsWith('#/')) {
      const target = document.getElementById(hash.slice(1));
      if (target) { target.focus({ preventScroll: false }); target.scrollIntoView(); }
      if (lastPath === null) location.replace('#/');
      return;
    }
    const path = hash.slice(1).split('?')[0].split('#')[0] || '/';
    const view = routes[path] || viewNotFound;
    const main = $('#main');
    main.innerHTML = '';
    lastPath = path;
    document.title = `${(NAV.flatMap(g => g[1]).find(r => r[0] === path) || ['', 'Preemptive Cybersecurity'])[1]} · 先制型資安 Playbook`;
    $$('.sidebar nav a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === `#${path}` ? 'page' : 'false'));
    $('.sidebar').classList.remove('open'); $('#menu-btn').setAttribute('aria-expanded', 'false');
    try { view(main, parseQuery(hash)); } catch (e) { main.innerHTML = `<div class="callout danger"><strong>頁面渲染錯誤：</strong>${esc(e.message)}</div>`; console.error(e); }
    let anchor = hash.split('#')[2];
    if (anchor) { try { anchor = decodeURIComponent(anchor); } catch { } const el = document.getElementById(anchor); if (el) { el.scrollIntoView(); el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); return; } }
    window.scrollTo(0, 0);
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
      <div class="callout warn"><strong>誠實聲明：</strong>本站區分四種內容標記：${TAG.fact}${TAG.third}${TAG.infer}${TAG.todo}。凡標示「本專案推論」的流程、分類與評分規則，均為本專案依證據整理的實作框架，<strong>不是 Gartner 官方方法論</strong>。付費牆內的 Gartner 研究僅引用公開摘要，未宣稱讀過全文；唯一讀過全文的 Gartner 文件是使用者提供的授權轉載版《Emerging Tech Impact Radar: Preemptive Cybersecurity》。</div>
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
      ['#/io', 'Inputs／Outputs 對照', '依流程階段、必要性、使用對象篩選；每項含來源、格式、頻率、品質、敏感度、範例與缺漏替代方案。'],
      ['#/platforms', '平台比較', '五個平台的模型、承載應用、自訂機制、工具呼叫、檔案與限制，含查證狀態。'],
      ['#/skills', 'Skills 專區', '共用任務規格 + 各平台完整檔案，一鍵複製與下載（含 ZIP）。'],
      ['#/guides', '安裝與使用教學', '切換平台查看逐步設定、使用範例、驗收方式與常見問題。'],
      ['#/case', '案例互動展示', '以合成資料示範輸入如何影響優先序、攻擊路徑假設與輸出；可切換輸入與權重。'],
      ['#/sources', '證據與來源', '所有引用連結、發布日期、查閱日期、查證等級、付費牆狀態、原始證據檔與待驗證清單。']].map(([h, t, d]) => `<a class="card" href="${h}" style="text-decoration:none;color:inherit"><h3 style="margin-top:0">${t}</h3><p class="small">${d}</p></a>`).join('')}
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
      <div class="tabs" role="tablist" aria-label="研究章節">${docs.map(d => tabButton(d.id, esc(d.title), d.id === cur.id, 'doc', 'doc-panel')).join('')}</div>
      <div class="two-col">
        <article class="doc card" id="doc-panel" role="tabpanel" aria-labelledby="tab-${esc(cur.id)}"><h2 style="border:0;margin-top:0">${esc(cur.title)}</h2>${cur.summary ? `<p class="lead">${esc(cur.summary)}</p>` : ''}${r.html}
          <div class="btn-row"><button class="btn small secondary" id="copy-doc">複製本章 Markdown</button><button class="btn small secondary" id="dl-doc">下載 ${esc(cur.id)}.md</button></div>
        </article>
        <aside><nav class="card doc-toc" aria-label="本章目錄"><strong>本章目錄</strong>${r.toc.map(t => `<a class="${t.level >= 3 ? 'l3' : ''}" href="#/methodology?doc=${cur.id}#${encodeURIComponent(t.id)}">${esc(t.text)}</a>`).join('')}</nav></aside>
      </div>`;
    wireTabs($('[role="tablist"]', el), t => { location.hash = `#/methodology?doc=${t.dataset.doc}`; });
    $('#copy-doc', el).addEventListener('click', () => copyText(cur.body));
    $('#dl-doc', el).addEventListener('click', () => download(`${cur.id}.md`, cur.body, 'text/markdown;charset=utf-8'));
  }

  // ---------- 可執行流程 ----------
  function viewProcess(el, q) {
    const stages = D.stages;
    const cur = stages.find(s => s.id === q.stage) || stages[0];
    const ioById = (id) => D.io.find(i => i.id === id);
    const stagePill = (id) => { const s = stages.find(x => x.id === id); return s ? `<a href="#/process?stage=${id}" class="pill">S${s.n} ${esc(s.name)}</a>` : esc(id); };
    el.innerHTML = `
      <h1>可執行流程（本專案推論框架）</h1>
      <p class="lead">${TAG.infer} 以下八個步驟是本專案依 Gartner 公開描述與 CTEM 五階段整理出的實作框架，並非 Gartner 官方流程。每步標示目的、輸入、處理、輸出、限制與人工決策點。</p>
      <div class="flow" role="group" aria-label="流程步驟">${stages.map(s => `<button class="stage" aria-pressed="${s.id === cur.id}" data-stage="${s.id}"><div class="n">步驟 ${s.n}</div><div class="t">${esc(s.name)}</div><div class="small">${esc(s.en)}</div></button>`).join('')}</div>
      ${cur ? `<div class="card">
        <h2 style="border:0;margin-top:0">步驟 ${cur.n}：${esc(cur.name)} <span class="small">${esc(cur.en)}</span> ${cur.basis === 'gartner' ? TAG.fact : cur.basis === 'ctem' ? '<span class="pill fact">對應 Gartner CTEM 階段</span>' : TAG.infer}</h2>
        <dl class="kv">
          <dt>目的</dt><dd>${inline(cur.purpose)}</dd>
          <dt>輸入</dt><dd>${cur.inputs.map(id => { const i = ioById(id); return i ? `<a href="#/io?focus=${id}" class="pill ${i.necessity === 'required' ? 'req' : 'opt'}">${esc(i.name)}</a>` : esc(id); }).join(' ')}${(cur.derivedFrom || []).length ? `<br><span class="small">另使用前段結果：</span>${cur.derivedFrom.map(stagePill).join(' ')}` : ''}</dd>
          <dt>處理方式</dt><dd>${md(cur.processing)}</dd>
          <dt>輸出</dt><dd>${cur.outputs.map(id => { const i = ioById(id); return i ? `<a href="#/io?focus=${id}" class="pill rec">${esc(i.name)}</a>` : esc(id); }).join(' ')}${cur.outputNote ? `<br><span class="small">${inline(cur.outputNote)}</span>` : ''}</dd>
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
      <div class="filters" role="search" aria-label="篩選 Inputs／Outputs">
        <label>類型 <select id="f-kind"><option value="all">全部</option><option value="input">Inputs</option><option value="output">Outputs</option></select></label>
        <label>流程階段 <select id="f-stage"><option value="all">全部</option>${D.stages.map(s => `<option value="${s.id}">${s.n}. ${esc(s.name)}</option>`).join('')}</select></label>
        <label>必要性 <select id="f-nec"><option value="all">全部</option><option value="required">必要</option><option value="recommended">建議</option><option value="optional">選用</option></select></label>
        <label>使用對象 <select id="f-aud"><option value="all">全部</option>${audiences.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}</select></label>
        <label>關鍵字 <input type="text" id="f-text" placeholder="例如 EPSS、資產"></label>
        <span class="small" id="f-count" role="status"></span>
      </div>
      <div id="io-list"></div>`;
    const NEC = { required: '<span class="pill req">必要</span>', recommended: '<span class="pill rec">建議</span>', optional: '<span class="pill opt">選用</span>' };
    const stageName = (id) => { const s = D.stages.find(x => x.id === id); return s ? `${s.n}.${s.name}` : id; };
    const searchable = (i) => [i.name, i.en, i.purpose, i.sources, i.format, i.frequency, i.quality, i.sensitivity, i.fallback, i.structure, i.example, i.dependsOn, i.confidence, i.validation, ...(i.audience || [])].join(' ').toLowerCase();
    function draw() {
      const list = D.io.filter(i => (state.kind === 'all' || i.kind === state.kind) && (state.stage === 'all' || i.stages.includes(state.stage)) && (state.necessity === 'all' || i.necessity === state.necessity)
        && (state.audience === 'all' || (i.audience || []).includes(state.audience)) && (!state.text || searchable(i).includes(state.text.toLowerCase())));
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
            <dt>缺漏時替代方案</dt><dd>${md(i.fallback)}</dd>
            ${i.example ? `<dt>合成範例</dt><dd>${md(i.example)}</dd>` : ''}` : `
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
      <div class="tabs" role="tablist" aria-label="平台">${platforms.map(p => tabButton(p, PLATFORM_META[p] || p, p === cur, 'platform', 'skills-panel')).join('')}</div>
      <div class="two-col">
        <div id="skills-panel" role="tabpanel" aria-labelledby="tab-${esc(cur)}">
          <div class="card">
            <div class="btn-row"><strong style="flex:1;overflow-wrap:anywhere">${esc(curFile?.path || '')}</strong>
              <button class="btn small" id="copy-file">複製內容</button>
              <button class="btn small secondary" id="dl-file">下載檔案</button>
              ${dl.includes(`downloads/skills-${cur}.zip`) ? `<a class="btn small secondary" href="downloads/skills-${cur}.zip" download>下載 ${PLATFORM_META[cur]} ZIP</a>` : ''}
              <button class="btn small secondary" id="toggle-view" aria-pressed="false">切換：原始／渲染</button>
            </div>
            <div id="file-rendered" class="doc" hidden>${curFile && curFile.ext === 'md' ? md(curFile.content, { shift: 1 }) : ''}</div>
            <pre id="file-raw"><code>${esc(curFile?.content || '')}</code></pre>
          </div>
        </div>
        <aside><nav class="card file-list" aria-label="${PLATFORM_META[cur]} 檔案清單"><strong>${PLATFORM_META[cur]} 檔案（${files.length}）</strong><div class="doc-toc">${files.map(f => `<a href="#/skills?platform=${cur}&file=${encodeURIComponent(f.path)}" aria-current="${f === curFile}">${esc(f.path.replace(`skills/${cur}/`, ''))}</a>`).join('')}</div></nav></aside>
      </div>`;
    wireTabs($('[role="tablist"]', el), t => { location.hash = `#/skills?platform=${t.dataset.platform}`; });
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
    const r = g ? window.MD.render(g.body, { shift: 0 }) : { html: '<p>尚無教學。</p>', toc: [] };
    el.innerHTML = `
      <h1>安裝與使用教學</h1>
      <p class="lead">切換平台查看逐步設定、輸入格式、使用範例、預期結果、驗收方式、常見問題與機敏資料邊界。</p>
      <div class="tabs" role="tablist" aria-label="平台">${platforms.map(p => tabButton(p, PLATFORM_META[p] || p, p === cur, 'platform', 'guide-panel')).join('')}</div>
      <div class="two-col">
        <article class="doc card" id="guide-panel" role="tabpanel" aria-labelledby="tab-${esc(cur)}">${r.html}<div class="btn-row"><button class="btn small secondary" id="copy-guide">複製本教學 Markdown</button></div></article>
        <aside><nav class="card doc-toc" aria-label="目錄"><strong>目錄</strong>${r.toc.map(t => `<a class="${t.level >= 3 ? 'l3' : ''}" href="#/guides?platform=${cur}#${encodeURIComponent(t.id)}">${esc(t.text)}</a>`).join('')}</nav></aside>
      </div>`;
    wireTabs($('[role="tablist"]', el), t => { location.hash = `#/guides?platform=${t.dataset.platform}`; });
    if (g) $('#copy-guide').addEventListener('click', () => copyText(g.body));
  }

  // ---------- 案例互動展示 ----------
  function viewCase(el) {
    const data = D.caseData;
    if (!data) { el.innerHTML = '<p>缺少案例資料。</p>'; return; }
    const params = JSON.parse(JSON.stringify(window.DEMO.DEFAULTS));
    const WEIGHT_LABEL = { exposure: '外部曝露', exploit: '利用可能性', identity: '身分弱點', control: '控制缺口', intel: '威脅情資', impact: '業務影響' };
    el.innerHTML = `
      <h1>案例互動展示：Northwind Precision（合成資料）</h1>
      <div class="callout danger"><strong>示範規則與限制：</strong>本頁所有資料皆為<strong>合成</strong>（公司、主機、帳號、弱點編號 <code>SYN-*</code>、威脅行為者皆虛構）。評分規則是本專案為了展示「輸入如何影響輸出」而設計的簡化規則，<strong>不是 Gartner 的公式，也不是任何真實風險模型</strong>。輸出僅為「假設」，未經任何實際驗證；真實環境必須經授權的安全驗證與人工審查。</div>
      <div class="two-col">
        <div>
          <div class="card">
            <h2 style="margin-top:0;border:0;padding-top:0;font-size:1.15rem">1. 輸入資料（可切換以觀察影響）</h2>
            <div id="input-toggles">${[['exposures', '外部曝險（EASM）'], ['epss', 'EPSS／KEV 利用可能性'], ['identities', '身分與權限'], ['misconfig', '設定基準偏差'], ['controls', '既有控制措施'], ['threatIntel', '威脅情資'], ['topology', '網路拓樸／信任關係（攻擊路徑）']].map(([k, l]) => `<label class="checkbox-row"><input type="checkbox" data-input="${k}" checked> ${l}</label>`).join('')}</div>
            <div class="range-row"><label for="inv">資產清冊完整度</label><input type="range" id="inv" min="30" max="100" step="10" value="100"><span id="inv-v">100%</span></div>
            <label class="checkbox-row">風險胃納 <select id="appetite"><option value="strict">嚴格</option><option value="balanced" selected>平衡</option><option value="tolerant">寬鬆</option></select></label>
            <details><summary>權重（進階）</summary>${Object.keys(params.weights).map(k => `<div class="range-row"><label for="w-${k}">${WEIGHT_LABEL[k]}</label><input type="range" id="w-${k}" data-weight="${k}" min="0" max="2" step="0.1" value="${params.weights[k]}"><span id="w-${k}-v">${params.weights[k]}</span></div>`).join('')}</details>
            <div class="btn-row"><button class="btn small secondary" id="reset">重設</button><button class="btn small secondary" id="dl-json">下載輸出 JSON（output-schema 格式）</button><button class="btn small secondary" id="copy-md">複製報告 Markdown</button></div>
          </div>
          <div id="case-output" aria-live="polite"></div>
        </div>
        <aside>
          <div class="card"><strong>輸入資料檔</strong><div class="doc-toc">${['assets.csv', 'vulnerabilities.csv', 'identities.csv', 'misconfigurations.csv', 'controls.json', 'threat-intel.json', 'topology.json', 'exposures.json', 'scope.json'].map(f => `<a href="https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude/blob/main/examples/synthetic-org/${f}" target="_blank" rel="noopener">${f}</a>`).join('')}</div>
          <p class="small">授權範圍：${esc(data.scope.authorized_scope.authorization_reference)}；主動測試授權：<strong>${data.scope.authorized_scope.active_testing_authorized ? '是' : '否'}</strong>；外部掃描授權：<strong>${data.scope.authorized_scope.external_scanning_authorized ? '是' : '否'}</strong>；管理摘要遮罩識別資訊：<strong>${data.scope.reporting?.mask_identifiers === false ? '否' : '是（預設）'}</strong></p></div>
          <div class="card"><strong>示範規則摘要</strong><p class="small">可能性 = 對外曝露 3 + EASM 議題 0.5 + 公開利用程式 2 + EPSS×3 + KEV 3 + 身分弱點 + 設定偏差 + 控制缺口 − 既有控制 + 情資命中（依行為者信心 2／1.5／1）（各乘權重，上限 10）；缺 EPSS/KEV 時以 CVSS/10×1.5 近似<br>影響 = 業務重要性×1.4 + 資料等級（Restricted 3／Confidential 2／Internal 1／Public 0）+2 若為 crown jewel +2 若為可達 crown jewel 的入口（上限 10）<br>分數 = 可能性 × 影響（0–100）；平衡胃納 P1 ≥ 60、P2 ≥ 40、P3 ≥ 20（嚴格 50/30/15；寬鬆 70/50/25）。<br>信心：缺 0 類 → 高；缺 1–2 類 → 中；缺 3 類以上或清冊完整度 &lt; 80% → 低。攻擊路徑可行性 = 入口可能性×0.5 + 最弱節點×0.3 + 身分／設定邊×1 − (跳數−1)×0.6；無任何發現的節點取 3。</p></div>
        </aside>
      </div>
      <h2>附錄</h2>
      ${data.expectedOutput ? docDetails('預期輸出（examples/expected-output.md）', data.expectedOutput, { shift: 2 }) : ''}
      ${D.extra.syntheticReadme ? docDetails('合成資料說明（examples/synthetic-org/README.md）', D.extra.syntheticReadme, { shift: 2 }) : ''}`;
    let last;
    const A = (id) => data.assets.find(a => a.asset_id === id)?.name || id;
    function draw() {
      const R = window.DEMO.analyze(data, params); last = R;
      $('#case-output').innerHTML = `
        ${R.missingSummary.length ? `<div class="callout warn"><strong>資料缺漏影響：</strong>${R.missingSummary.map(esc).join('；')}。信心水準已相應下修，輸出應視為「初步」。</div>` : '<div class="callout ok">所有輸入類別皆提供；仍須人工審查與授權驗證。</div>'}
        <div class="card"><h2 class="card-h">2. 曝險優先序（輸出 O1）</h2>
        <div class="table-wrap"><table><thead><tr><th>優先序</th><th>資產</th><th>發現</th><th>分數</th><th>可能性</th><th>影響</th><th>信心</th><th>判斷依據</th></tr></thead>
        <tbody>${R.findings.map(f => `<tr><td><span class="score ${f.priority}">${f.priority}</span></td><td>${esc(f.asset.name)}<br><span class="small">${esc(f.asset.type)}${f.asset.internet_exposed ? ' · 對外' : ''}</span></td><td>${esc(f.title)}<br><span class="small">${esc(f.vuln_id)} · CVSS ${f.cvss_base}</span></td><td><strong>${f.score}</strong><div class="bar" aria-hidden="true"><span style="width:${f.score}%"></span></div></td><td>${f.likelihood.toFixed(1)}</td><td>${f.impact.toFixed(1)}</td><td>${f.confidence}${f.missing.length ? `<br><span class="small">缺：${f.missing.map(esc).join('、')}</span>` : ''}</td><td class="small">${f.factors.map(esc).join('；')}</td></tr>`).join('')}</tbody></table></div>
        <p class="small">門檻（分數）：P1 ≥ ${R.thresholds[0]}、P2 ≥ ${R.thresholds[1]}、P3 ≥ ${R.thresholds[2]}（風險胃納：${{ strict: '嚴格', balanced: '平衡', tolerant: '寬鬆' }[R.params.riskAppetite]}）</p></div>
        <div class="card"><h2 class="card-h">3. 攻擊路徑假設（輸出 O2）</h2>
        ${R.hypotheses.length ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>路徑（入口 → 目標）</th><th>跳數</th><th>可行性（0–10）</th><th>假設依據</th><th>可能阻斷點（既有控制）</th><th>狀態</th></tr></thead><tbody>${R.hypotheses.map((h, i) => `<tr><td>${esc(h.id)}</td><td>internet → ${h.nodes.map(A).map(esc).join(' → ')}</td><td>${h.hops}</td><td><strong>${h.feasibility}</strong><div class="bar" aria-hidden="true"><span style="width:${h.feasibility * 10}%"></span></div></td><td class="small">${h.edges.map(e => esc(e.via)).join(' → ')}</td><td class="small">${h.blockingControls.map(esc).join('、') || '—'}</td><td><span class="pill">${esc(h.status)}</span></td></tr>`).join('')}</tbody></table></div>` : '<p>未提供拓樸資料，無法產生攻擊路徑假設（改為僅依單一資產曝險排序）。</p>'}
        <p class="small">「假設」表示依據拓樸與弱點推論的可能路徑，<strong>未經驗證</strong>；驗證需授權的安全測試。</p></div>
        <div class="card"><h2 class="card-h">4. 改善建議（輸出 O3）</h2>
        <div class="table-wrap"><table><thead><tr><th>優先</th><th>資產</th><th>行動</th><th>負責</th><th>工作量</th><th>驗證方式</th><th>核准</th></tr></thead><tbody>${R.recs.map(r => `<tr><td><span class="score ${r.priority}">${r.priority}</span></td><td>${esc(r.asset)}</td><td>${esc(r.action)}</td><td>${esc(r.owner)}</td><td>${esc(r.effort)}</td><td class="small">${esc(r.verify)}</td><td class="small">${esc(r.approval)}</td></tr>`).join('')}</tbody></table></div>
        ${R.compensating.length ? `<h3>補償控制缺口</h3><ul>${R.compensating.map(c => `<li><strong>${esc(c.control)}</strong>：缺口 ${esc(c.gaps)}${c.note ? `（${esc(c.note)}）` : ''}</li>`).join('')}</ul>` : ''}</div>
        <div class="card"><h2 class="card-h">5. 安全驗證計畫（輸出 O4，僅為提案）</h2>
        <div class="table-wrap"><table><thead><tr><th>#</th><th>待驗證假設</th><th>方法</th><th>授權狀態</th><th>範圍排除</th><th>成功準則</th></tr></thead><tbody>${R.validation.map(v => `<tr><td>${v.id}</td><td>${esc(v.hypothesis)}</td><td>${esc(v.method)}</td><td>${esc(v.requires)}</td><td class="small">${v.scope_exclusions.map(esc).join('；') || '—'}</td><td>${esc(v.success)}</td></tr>`).join('') || '<tr><td colspan="6">無攻擊路徑假設，無驗證計畫。</td></tr>'}</tbody></table></div></div>
        <div class="card"><h2 class="card-h">6. 人工審查點（必經）</h2><ol class="steps">${R.reviewPoints.map(p => `<li><strong>${esc(p.stage)}</strong>（${esc(p.who)}）：${esc(p.what)}</li>`).join('')}</ol></div>
        <div class="card"><h2 class="card-h">7. 管理摘要（輸出 O5）</h2>${md(R.summary.header)}${md(R.summary.text)}<p class="small">${R.summary.masked ? '依 reporting.mask_identifiers 預設值，摘要以資產類型與編號取代主機名稱。' : ''}正文 ${R.summary.length} 字（規格：≤ 300 字；對象列不計）。</p></div>
        <div class="card"><h2 class="card-h">8. 追蹤指標（輸出 O6）</h2><div class="table-wrap"><table><thead><tr><th>指標</th><th>目前值</th><th>目標</th></tr></thead><tbody>${R.metrics.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.value)}</td><td>${esc(m.target)}</td></tr>`).join('')}</tbody></table></div>
        <h3>後續追蹤（示範時間軸）</h3><div class="timeline">${[['T+0', '產出初版優先序與假設；提交人工審查'], ['T+2 天', '系統擁有者確認 P1 排序；CISO 決定是否授權外部驗證'], ['T+7 天', '對外曝露 P1 完成修補或緩解；重新執行分析比較差異'], ['T+14 天', '完成授權驗證；更新攻擊路徑狀態（已阻斷／仍可行）'], ['每週', '追蹤指標更新；範圍與資料品質再確認']].map(([t, d]) => `<div class="ev"><strong>${t}</strong> ${d}</div>`).join('')}</div></div>`;
    }
    function reportMd(R) {
      return `# 先制型曝險分析報告（合成示範）\n\n## 管理摘要\n\n${R.summary.header}\n\n${R.summary.text}\n\n## 曝險優先序\n\n| 優先序 | 資產 | 發現 | 分數 | 信心 | 依據 |\n|---|---|---|---|---|---|\n${R.findings.map(f => `| ${f.priority} | ${f.asset.name} | ${f.title} (${f.vuln_id}) | ${f.score} | ${f.confidence} | ${f.factors.join('；')} |`).join('\n')}\n\n## 攻擊路徑假設（status: hypothesis，未驗證）\n\n${R.hypotheses.map((h) => `${h.id}. internet → ${h.nodes.map(A).join(' → ')}（可行性 ${h.feasibility}/10）`).join('\n')}\n\n## 改善建議\n\n${R.recs.map(r => `- [${r.priority}] ${r.asset}：${r.action}（負責：${r.owner}；核准：${r.approval}）`).join('\n')}\n\n## 安全驗證計畫（提案）\n\n${R.validation.map(v => `- ${v.id} ${v.hypothesis}：${v.method}；${v.requires}`).join('\n')}\n\n## 人工審查點\n\n${R.reviewPoints.map(p => `- ${p.stage}（${p.who}）：${p.what}`).join('\n')}\n\n## 追蹤指標\n\n${R.metrics.map(m => `- ${m.name}：${m.value}（目標 ${m.target}）`).join('\n')}\n\n> 所有資料為合成；評分規則為本專案示範用簡化規則，非 Gartner 公式；語言模型或引擎皆未驗證實際曝險。`;
    }
    const setParamsFromUI = () => {
      $$('[data-input]', el).forEach(c => { params.inputs[c.dataset.input] = c.checked; });
      params.inventoryCompleteness = Number($('#inv').value); $('#inv-v').textContent = `${$('#inv').value}%`;
      params.riskAppetite = $('#appetite').value;
      $$('[data-weight]', el).forEach(r => { params.weights[r.dataset.weight] = Number(r.value); $(`#w-${r.dataset.weight}-v`).textContent = r.value; });
    };
    $$('[data-input]', el).forEach(c => c.addEventListener('change', () => { setParamsFromUI(); draw(); }));
    $('#inv').addEventListener('input', () => { setParamsFromUI(); draw(); });
    $('#appetite').addEventListener('change', () => { setParamsFromUI(); draw(); });
    $$('[data-weight]', el).forEach(r => r.addEventListener('input', () => { setParamsFromUI(); draw(); }));
    $('#reset').addEventListener('click', () => {
      const def = window.DEMO.DEFAULTS;
      $$('[data-input]', el).forEach(c => { c.checked = true; });
      $('#inv').value = def.inventoryCompleteness; $('#appetite').value = def.riskAppetite;
      $$('[data-weight]', el).forEach(r => { r.value = def.weights[r.dataset.weight]; });
      setParamsFromUI(); draw(); toast('已重設為預設參數');
    });
    $('#dl-json').addEventListener('click', () => download('preemptive-analysis-output.json', JSON.stringify(window.DEMO.toSchema(last, data, 'demo-engine (website) / skill 1.0.0'), null, 2), 'application/json'));
    $('#copy-md').addEventListener('click', () => copyText(reportMd(last)));
    draw();
  }

  // ---------- 證據與來源 ----------
  function viewSources(el, q) {
    const TYPE = { gartner: 'Gartner 官方', 'third-party': '第三方／媒體', vendor: '廠商', 'platform-doc': '平台官方文件', standard: '標準／公部門' };
    const state = { type: q.type || 'all', verification: q.verification || 'all', text: '' };
    const evidence = D.extra.evidence || [];
    el.innerHTML = `
      <h1>證據與來源</h1>
      <p class="lead">所有引用之來源、發布日期（如有）、查閱日期、查證等級與付費牆狀態。Gartner 付費牆內容僅引用公開摘要或新聞稿；未讀全文者一律標示。查證等級：${Object.entries(VERIFICATION).map(([k, [l, c]]) => `<span class="pill ${c}">${l}</span>`).join('')}</p>
      <div class="filters" role="search" aria-label="篩選來源"><label>類型 <select id="s-type"><option value="all">全部</option>${Object.entries(TYPE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label>查證等級 <select id="s-ver"><option value="all">全部</option>${Object.entries(VERIFICATION).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select></label><label>關鍵字 <input type="text" id="s-text" placeholder="標題、網址、備註"></label><span class="small" id="s-count" role="status"></span></div>
      <div id="src-list"></div>
      <h2>待驗證清單</h2>
      <div class="table-wrap"><table><thead><tr><th>項目</th><th>為何待驗證</th><th>驗證方式</th></tr></thead><tbody>${D.todo.map(t => `<tr><td>${md(t.item)}</td><td>${md(t.why)}</td><td>${md(t.how)}</td></tr>`).join('')}</tbody></table></div>
      <h2>連結檢查結果</h2>
      <div class="card">${md(window.LINK_CHECK_NOTE || '尚未記錄。')}${D.extra.linkCheck ? docDetails('完整連結檢查表（link-check.md）', D.extra.linkCheck, { shift: 2 }) : ''}</div>
      ${evidence.length ? `<h2>原始證據檔（研究代理的查證紀錄，英文）</h2><p class="small">這些是研究過程中逐條記錄的原始證據與查證等級，供核對「證據與來源」表使用；正體中文的整理版見 <a href="#/methodology">方法論導覽</a>。</p>${evidence.map(e => docDetails(e.title, e.body, { shift: 2 })).join('')}` : ''}`;
    const verLabel = (s) => { const v = s.verification || (s.paywalled ? 'summary' : undefined); const m = VERIFICATION[v]; return m ? `<span class="pill ${m[1]}">${m[0]}</span>` : '<span class="pill">未標示</span>'; };
    const searchable = (s) => [s.id, s.title, s.publisher, s.url, s.note, s.date].join(' ').toLowerCase();
    function draw() {
      const list = D.sources.filter(s => (state.type === 'all' || s.type === state.type) && (state.verification === 'all' || (s.verification || (s.paywalled ? 'summary' : '')) === state.verification) && (!state.text || searchable(s).includes(state.text.toLowerCase())));
      $('#s-count').textContent = `顯示 ${list.length} / ${D.sources.length} 筆`;
      $('#src-list').innerHTML = `<div class="table-wrap"><table><thead><tr><th>ID</th><th>標題</th><th>發布者</th><th>發布日期</th><th>查閱日期</th><th>類型</th><th>查證等級</th><th>付費牆</th><th>備註／用途</th></tr></thead><tbody>${list.map(s => `<tr id="src-${esc(s.id)}" ${q.focus === s.id ? 'style="outline:2px solid var(--accent)"' : ''}><td>${esc(s.id)}</td><td><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></td><td>${esc(s.publisher)}</td><td>${esc(s.date || '未標示')}</td><td>${esc(s.accessed)}</td><td>${TYPE[s.type] || esc(s.type)}</td><td>${verLabel(s)}</td><td>${s.paywalled ? (s.readFull ? '<span class="pill fact">是（已讀授權轉載全文）</span>' : '<span class="pill todo">是（僅公開摘要）</span>') : '否'}</td><td class="small">${md(s.note)}</td></tr>`).join('')}</tbody></table></div>`;
      if (q.focus) { const f = document.getElementById(`src-${q.focus}`); if (f) f.scrollIntoView({ block: 'center' }); q.focus = null; }
    }
    $('#s-type').value = state.type; $('#s-ver').value = state.verification;
    $('#s-type').addEventListener('change', e => { state.type = e.target.value; draw(); });
    $('#s-ver').addEventListener('change', e => { state.verification = e.target.value; draw(); });
    $('#s-text').addEventListener('input', e => { state.text = e.target.value; draw(); });
    draw();
  }

  // ---------- 部署 ----------
  function viewDeploy(el) {
    const g = D.guides.find(x => x.id === 'deployment') || D.guides.find(x => x.platform === '' && /deploy/i.test(x.id));
    el.innerHTML = `<h1>部署與維護</h1><article class="doc card">${g ? md(g.body, { shift: 0 }) : '<p>尚無部署文件。</p>'}</article>
      <h2>附錄</h2>
      ${D.extra.verifyReport ? docDetails('最近一次驗證報告（verify-report.md）', D.extra.verifyReport, { shift: 2 }) : ''}
      ${D.extra.backendReadme ? docDetails('選用後端：模型 API 代理（backend/README.md）', D.extra.backendReadme, { shift: 2 }) : ''}
      ${D.extra.readme ? docDetails('儲存庫 README', D.extra.readme, { shift: 2 }) : ''}`;
  }
  function viewNotFound(el) { el.innerHTML = '<h1>找不到頁面</h1><p><a href="#/">回首頁</a></p>'; }

  // ---------- 全站搜尋 ----------
  function buildIndex() {
    const idx = [];
    for (const d of D.research) {
      const sections = d.body.split(/\n(?=#{1,3} )/);
      for (const s of sections) {
        const t = (s.match(/^#{1,3}\s+(.*)/) || [])[1] || d.title;
        idx.push({ kind: '研究', title: `${d.title} › ${t}`, text: s.replace(/[#*`>|]/g, ' '), href: `#/methodology?doc=${d.id}#${encodeURIComponent(window.MD.render(`# ${t}`).toc[0]?.id || '')}` });
      }
    }
    for (const i of D.io) idx.push({ kind: i.kind === 'input' ? 'Input' : 'Output', title: `${i.name} ${i.en}`, text: [i.purpose, i.sources, i.format, i.fallback, i.structure, i.example].join(' '), href: `#/io?focus=${i.id}` });
    for (const s of D.stages) idx.push({ kind: '流程', title: `步驟 ${s.n} ${s.name}`, text: [s.purpose, s.processing, s.limits, s.humanDecision].join(' '), href: `#/process?stage=${s.id}` });
    for (const p of D.platforms) idx.push({ kind: '平台', title: p.name, text: [p.models, p.hosting, p.mechanism, p.limits, p.notes].join(' '), href: '#/platforms' });
    for (const f of D.skills) idx.push({ kind: 'Skill', title: f.path, text: f.content, href: `#/skills?platform=${f.platform}&file=${encodeURIComponent(f.path)}` });
    for (const g of D.guides) idx.push({ kind: '教學', title: g.title, text: g.body, href: g.platform ? `#/guides?platform=${g.platform}` : '#/deploy' });
    for (const s of D.sources) idx.push({ kind: '來源', title: s.title, text: [s.url, s.publisher, s.note].join(' '), href: `#/sources?focus=${s.id}` });
    for (const e of (D.extra.evidence || [])) idx.push({ kind: '證據檔', title: e.title, text: e.body, href: '#/sources' });
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
      const textLower = e.text.toLowerCase();
      const pos = Math.max(0, textLower.indexOf(terms[0]));
      const snippet = e.text.slice(Math.max(0, pos - 40), pos + 80).replace(/\s+/g, ' ');
      return { ...e, score, snippet };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 12);
  }
  function setupSearch() {
    const input = $('#search'), box = $('#search-results');
    const hl = (s, terms) => {
      // 先切割再逐段 escape，避免 <mark> 切進 HTML entity
      if (!terms.length) return esc(s);
      const re = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
      return s.split(re).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join('');
    };
    let active = -1;
    const options = () => $$('a', box);
    const setActive = (i) => { const opts = options(); if (!opts.length) return; active = (i + opts.length) % opts.length; opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === active))); input.setAttribute('aria-activedescendant', opts[active].id); opts[active].scrollIntoView({ block: 'nearest' }); };
    const close = () => { box.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    input.addEventListener('input', () => {
      const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      const res = search(input.value);
      box.innerHTML = res.map((r, i) => `<a href="${r.href}" role="option" id="search-opt-${i}" aria-selected="false"><div class="kind">${esc(r.kind)}</div><div>${hl(r.title, terms)}</div><div class="small">…${hl(r.snippet, terms)}…</div></a>`).join('') || (input.value.trim() ? '<a href="#/" role="option" id="search-opt-0" aria-selected="false">沒有結果</a>' : '');
      input.setAttribute('aria-expanded', String(box.children.length > 0)); active = -1;
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(); input.blur(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); options()[active].click(); }
    });
    box.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); options()[active].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); options()[active].focus(); }
      else if (e.key === 'Escape') { close(); input.focus(); }
    });
    box.addEventListener('click', () => { close(); input.value = ''; });
    document.addEventListener('click', e => { if (!e.target.closest('.search-box')) close(); });
  }

  // ---------- 初始化 ----------
  function init() {
    $('.sidebar nav').innerHTML = NAV.map(([g, items]) => `<div class="group">${g}</div>${items.map(([h, t]) => `<a href="#${h}">${t}</a>`).join('')}`).join('');
    $('#menu-btn').addEventListener('click', () => { const s = $('.sidebar'); s.classList.toggle('open'); $('#menu-btn').setAttribute('aria-expanded', s.classList.contains('open')); });
    const themeBtn = $('#theme-btn');
    const applyTheme = (t) => { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); themeBtn.innerHTML = t === 'dark' ? '<span aria-hidden="true">☀︎</span><span class="btn-text"> 淺色</span>' : t === 'light' ? '<span aria-hidden="true">☾</span><span class="btn-text"> 深色</span>' : '<span aria-hidden="true">◐</span><span class="btn-text"> 主題</span>'; themeBtn.setAttribute('aria-label', `切換色彩主題（目前：${t === 'dark' ? '深色' : t === 'light' ? '淺色' : '跟隨系統'}）`); };
    let theme = null; try { theme = localStorage.getItem('theme'); } catch { }
    applyTheme(theme);
    themeBtn.addEventListener('click', () => { theme = theme === 'dark' ? 'light' : theme === 'light' ? null : 'dark'; try { theme ? localStorage.setItem('theme', theme) : localStorage.removeItem('theme'); } catch { } applyTheme(theme); });
    setupSearch();
    window.addEventListener('hashchange', render);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.APP = { search, copyText, download };
})();
