/* 案例互動展示引擎。
   重要：這裡的評分規則是本專案為了「示範輸入如何影響輸出」而設計的簡化規則，
   不是 Gartner 的官方公式，也不代表任何真實風險模型。所有數值皆基於合成資料。
   規則數值的唯一來源是下方的 RULES；母本（core-prompt.md、task-spec.md 附錄 A、scoring-rules.md）以散文陳述同一套規則，
   由 scripts/scoring-rules.mjs 的一致性檢查比對數值（npm test）。 */
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round1 = (v) => Math.round(v * 10) / 10;

  const deepFreeze = (o) => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

  /** 示範評分規則（唯讀）。min(cap, 數量 × perItem) × 權重；權重是 weights 的預設值（UI 可調整）。 */
  const RULES = deepFreeze({
    likelihood: {
      exposed: 3, easmIssues: 0.5, exploitPublic: 2, epss: 3, kev: 3,
      cvssFallback: 1.5,                          // 缺 EPSS/KEV：cvss_base / 10 × cvssFallback
      identity: { cap: 2 },                       // × weights.identity
      misconfig: { cap: 1.5, perItem: 0.75 },     // × weights.control
      controls: { cap: 2, perItem: 0.6 },         // 降低；× weights.control
      gaps: { cap: 1.5, perItem: 0.4 },           // × weights.control
      intel: { high: 2, medium: 1.5, low: 1 },    // 依行為者信心；× weights.intel
      range: [0, 10]
    },
    identityIssue: { staleLoginDays: 90 },        // MFA 未啟用／部分啟用，或超過此天數未登入
    impact: { criticality: 1.4, dataWeight: { Restricted: 3, Confidential: 2, Internal: 1, Public: 0 }, crownJewel: 2, entry: 2, range: [0, 10] },
    thresholds: { strict: [50, 30, 15], balanced: [60, 40, 20], tolerant: [70, 50, 25] }, // P1／P2／P3
    feasibility: { entry: 0.5, weakest: 0.3, trustEdge: 1.0, perHop: 0.6, unknownNode: 3, maxHops: 5, range: [0, 10] },
    confidence: { lowMissing: 3, inventoryThreshold: 80 }, // 缺 lowMissing 類以上或清冊完整度 < inventoryThreshold% → 低
    weights: { exposure: 1.0, exploit: 1.0, identity: 0.8, control: 0.8, intel: 1.0, impact: 1.0 }
  });
  const L = RULES.likelihood, I = RULES.impact, F = RULES.feasibility;

  /** 預設參數（可由 UI 調整） */
  const DEFAULTS = {
    inputs: { threatIntel: true, identities: true, controls: true, misconfig: true, epss: true, topology: true, exposures: true },
    weights: { ...RULES.weights },
    inventoryCompleteness: 100, // 0-100：模擬資產清冊完整度
    riskAppetite: 'balanced'     // 'strict' | 'balanced' | 'tolerant'
  };
  const SCOPE_REQUIRED = ['organization', 'analysis_date', 'authorized_scope.in_scope_assets', 'authorized_scope.active_testing_authorized', 'authorized_scope.external_scanning_authorized', 'reporting.audience'];

  // 至少一個非空白字元（schema 的 pattern）：明確列出空白字元，取 Python 與 JS 兩邊 \s 的聯集，三份守門判定一致
  const NON_BLANK = /[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/;
  // RFC 3339 full-date（schema 的 format: date）：恰好 YYYY-MM-DD，而且是存在的日期。不用 Date：它會把 2026-02-30 換算成 3 月 2 日；
  // 年份從 1 起算，與 Python 的 date 一致
  const isFullDate = (s) => {
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
    if (!m) return false;
    const [y, mo, d] = m.slice(1).map(Number);
    const days = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return y >= 1 && mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo - 1];
  };
  /** 授權範圍守門：回傳缺少或不合格的必填欄位清單；空陣列表示可以分析。 */
  function scopeProblems(scope) {
    if (!scope || typeof scope !== 'object') return [...SCOPE_REQUIRED];
    const get = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
    return SCOPE_REQUIRED.filter(p => {
      const v = get(p);
      if (v === undefined || v === null || v === '') return true;
      if (p === 'organization') return typeof v !== 'string' || !NON_BLANK.test(v);
      if (p === 'analysis_date') return typeof v !== 'string' || !isFullDate(v);
      if (p === 'authorized_scope.in_scope_assets' || p === 'reporting.audience') // 非空陣列，每項都是含非空白字元的字串
        return !Array.isArray(v) || v.length === 0 || !v.every(x => typeof x === 'string' && NON_BLANK.test(x));
      if (p.endsWith('_authorized')) return typeof v !== 'boolean';
      return false;
    });
  }

  function analyze(data, params = DEFAULTS) {
    const P = { ...DEFAULTS, ...params, inputs: { ...DEFAULTS.inputs, ...(params.inputs || {}) }, weights: { ...DEFAULTS.weights, ...(params.weights || {}) } };
    const th = RULES.thresholds[P.riskAppetite] || RULES.thresholds.balanced;

    // S1 範圍確認：沒有授權範圍就拒絕分析（task-spec 驗收第 7 項）
    const problems = scopeProblems(data.scope);
    if (problems.length) {
      return {
        refused: true, reason: '缺少授權範圍（scope），或必要欄位缺少或不合格，無授權範圍不得分析。', requiredFields: SCOPE_REQUIRED, problemFields: problems,
        params: P, findings: [], hypotheses: [], recs: [], compensating: [], validation: [], metrics: [], reviewPoints: [], missingSummary: ['授權範圍（scope）'], hidden: [], outOfScope: [], thresholds: th
      };
    }
    const scope = data.scope;
    const auth = scope.authorized_scope;
    const activeOK = auth.active_testing_authorized === true;
    const externalOK = auth.external_scanning_authorized === true;
    const maskIds = !(scope.reporting && scope.reporting.mask_identifiers === false); // 預設遮罩（input-schema：mask_identifiers 預設 true）

    // 只分析授權範圍內的資產；範圍外者排除並記錄
    const inScope = new Set(auth.in_scope_assets);
    const allAssets = data.assets || [];
    const outOfScope = allAssets.filter(a => !inScope.has(a.asset_id)).map(a => a.asset_id);
    const scopedAssets = allAssets.filter(a => inScope.has(a.asset_id));
    const assets = new Map(scopedAssets.map(a => [a.asset_id, a]));
    const display = (id) => { const a = assets.get(id); if (!a) return id; return maskIds ? `${a.type}（${a.asset_id}）` : a.name; };

    const controlsOf = (id) => P.inputs.controls ? data.controls.controls.filter(c => c.coverage_assets.includes(id)).map(c => c.name) : [];
    const gapsOf = (id) => P.inputs.controls ? data.controls.controls.filter(c => c.gaps.includes(id)).map(c => c.name) : [];
    const identityIssues = (id) => P.inputs.identities ? data.identities.filter(i => String(i.linked_assets).split(';').includes(id) && (i.mfa_enabled === false || i.mfa_enabled === 'partial' || Number(i.last_login_days) > RULES.identityIssue.staleLoginDays)) : [];
    const intelHits = (vulnIds) => P.inputs.threatIntel ? data.threatIntel.actors.filter(a => a.exploits_vuln_ids.some(v => vulnIds.includes(v))) : [];
    const intelWeight = (a) => L.intel[a.confidence] ?? L.intel.low; // 未標信心時以 low 計
    const misconfigs = (id) => P.inputs.misconfig ? data.misconfigurations.filter(m => m.asset_id === id && m.status === 'fail') : [];
    const exposureOf = (id) => P.inputs.exposures ? data.exposures.exposures.find(e => e.asset_id === id) : null;
    const crownJewels = (data.topology && data.topology.crown_jewels) || [];

    // 模擬資產清冊不完整：依完整度隱藏排序靠後的資產（示範用）
    const visibleIds = scopedAssets.map(a => a.asset_id).filter((_, idx, arr) => idx < Math.round(arr.length * P.inventoryCompleteness / 100));
    const hidden = scopedAssets.filter(a => !visibleIds.includes(a.asset_id));
    const inventoryLow = P.inventoryCompleteness < RULES.confidence.inventoryThreshold;

    // S4 攻擊路徑：從 internet 出發，只走清冊看得到的節點到 crown jewels（簡單 DFS，跳數上限見 F.maxHops）。
    // 路徑本身不依賴 S3 的分數，所以先找；S3 的入口加分與 S4 的可行性都用這組路徑
    const paths = [];
    if (P.inputs.topology) {
      const edges = data.topology.edges.filter(e => (e.from === 'internet' || visibleIds.includes(e.from)) && visibleIds.includes(e.to));
      const byFrom = {};
      for (const e of edges) (byFrom[e.from] ||= []).push(e);
      const dfs = (node, trail, seen) => {
        if (trail.length >= F.maxHops) return; // trail 已有 maxHops 條邊就不再延伸
        for (const e of byFrom[node] || []) {
          if (seen.has(e.to)) continue;
          const t = [...trail, e];
          if (crownJewels.includes(e.to)) paths.push(t);
          else dfs(e.to, t, new Set([...seen, e.to]));
        }
      };
      dfs('internet', [], new Set(['internet']));
    }
    // 可達 crown jewel 的入口節點（blast radius 因子）：至少一條攻擊路徑以它為入口
    const entryNodes = new Set(paths.map(p => p[0].to));

    // S3 曝險評分
    const findings = (data.vulnerabilities || []).filter(v => visibleIds.includes(v.asset_id)).map(v => {
      const a = assets.get(v.asset_id);
      const f = { ...v, asset: a, factors: [], missing: [] };
      let likelihood = 0;
      // 1. 外部曝露
      const exposed = a.internet_exposed === true;
      if (exposed) { likelihood += L.exposed * P.weights.exposure; f.factors.push('對外曝露'); }
      const ex = exposureOf(v.asset_id);
      if (ex && ex.issues.length) { likelihood += L.easmIssues * P.weights.exposure; f.factors.push(`EASM 議題：${ex.issues.join('、')}`); }
      if (!P.inputs.exposures) f.missing.push('外部曝險資料');
      // 2. 利用可能性（範例資料欄位 epss_sim／kev_sim 視同 epss／kev，皆為模擬值）
      const epss = Number(v.epss ?? v.epss_sim ?? 0), kev = (v.kev ?? v.kev_sim) === true;
      if (v.exploit_public === true) { likelihood += L.exploitPublic * P.weights.exploit; f.factors.push('公開利用程式'); }
      if (P.inputs.epss) {
        likelihood += L.epss * epss * P.weights.exploit;
        if (epss >= 0.5) f.factors.push(`模擬 EPSS ${epss}`);
        if (kev) { likelihood += L.kev * P.weights.exploit; f.factors.push('模擬 KEV（已知遭利用）'); }
      } else { likelihood += (Number(v.cvss_base) / 10) * L.cvssFallback * P.weights.exploit; f.missing.push('EPSS/KEV（改用 CVSS 近似）'); }
      // 3. 身分弱點（MFA 未啟用／部分啟用，或超過 RULES.identityIssue.staleLoginDays 天未登入）
      const idIss = identityIssues(v.asset_id);
      if (idIss.length) { likelihood += Math.min(L.identity.cap, idIss.length) * P.weights.identity; f.factors.push(`身分弱點 ×${idIss.length}`); }
      if (!P.inputs.identities) f.missing.push('身分與權限資料');
      // 4. 設定偏差
      const mc = misconfigs(v.asset_id);
      if (mc.length) { likelihood += Math.min(L.misconfig.cap, mc.length * L.misconfig.perItem) * P.weights.control; f.factors.push(`設定偏差 ×${mc.length}`); }
      if (!P.inputs.misconfig) f.missing.push('設定基準資料');
      // 5. 既有控制（降低）與缺口（提高）
      const ctl = controlsOf(v.asset_id), gaps = gapsOf(v.asset_id);
      if (ctl.length) { likelihood -= Math.min(L.controls.cap, ctl.length * L.controls.perItem) * P.weights.control; f.factors.push(`既有控制：${ctl.join('、')}`); }
      if (gaps.length) { likelihood += Math.min(L.gaps.cap, gaps.length * L.gaps.perItem) * P.weights.control; f.factors.push(`控制缺口：${gaps.join('、')}`); }
      if (!P.inputs.controls) f.missing.push('既有控制措施');
      // 6. 威脅情資
      const hits = intelHits([v.vuln_id]);
      if (hits.length) { likelihood += Math.max(...hits.map(intelWeight)) * P.weights.intel; f.factors.push(`威脅情資命中：${hits.map(h => `${h.name}（${h.confidence}）`).join('、')}`); }
      if (!P.inputs.threatIntel) f.missing.push('威脅情資');
      if (!P.inputs.topology) f.missing.push('網路拓樸／信任關係');
      f.likelihood = clamp(likelihood, ...L.range);
      // 影響
      const dataW = I.dataWeight[a.data_classification] ?? I.dataWeight.Internal; // 未標資料等級時以 Internal 計
      let impact = (Number(a.business_criticality) * I.criticality + dataW) * P.weights.impact;
      const cj = crownJewels.includes(v.asset_id);
      if (cj) { impact += I.crownJewel * P.weights.impact; f.factors.push('crown jewel'); }
      if (entryNodes.has(v.asset_id)) { impact += I.entry * P.weights.impact; f.factors.push('可達 crown jewel 之入口（blast radius）'); }
      f.impact = clamp(impact, ...I.range);
      f.score = round1(f.likelihood * f.impact); // 0-100
      // 信心：缺 0 類 → 高；缺 RULES.confidence.lowMissing 類以上或清冊完整度 < inventoryThreshold% → 低；其餘 → 中
      f.confidence = (f.missing.length >= RULES.confidence.lowMissing || inventoryLow) ? '低' : f.missing.length === 0 ? '高' : '中';
      if (inventoryLow) f.missing.push(`資產清冊完整度 ${P.inventoryCompleteness}% < ${RULES.confidence.inventoryThreshold}%`);
      return f;
    });
    for (const f of findings) f.priority = f.score >= th[0] ? 'P1' : f.score >= th[1] ? 'P2' : f.score >= th[2] ? 'P3' : 'P4';
    findings.sort((a, b) => b.score - a.score);

    // S4 攻擊路徑假設：上面找到的路徑，配合 S3 的節點可能性計算可行性
    // 節點可能性：有發現者取最高可能性（可為 0）；完全無發現者取 F.unknownNode（未知）
    const nodeLikelihood = (id) => { const ls = findings.filter(f => f.asset_id === id).map(f => f.likelihood); return ls.length ? Math.max(...ls) : F.unknownNode; };
    const hypotheses = paths.map(p => {
      const nodes = p.map(e => e.to);
      const entry = nodes[0];
      const entryLikelihood = nodeLikelihood(entry);
      const weakest = Math.min(...nodes.map(nodeLikelihood));
      const hops = p.length;
      const identityEdges = p.filter(e => e.trust === 'identity' || e.trust === 'misconfig').length;
      const feasibility = clamp(entryLikelihood * F.entry + weakest * F.weakest + identityEdges * F.trustEdge - (hops - 1) * F.perHop, ...F.range);
      const target = nodes[nodes.length - 1];
      const blocking = P.inputs.controls ? [...new Set(nodes.flatMap(n => controlsOf(n)))] : [];
      return { nodes, edges: p, entry, target, hops, feasibility: round1(feasibility), targetName: assets.get(target)?.name, entryName: assets.get(entry)?.name, blockingControls: blocking, status: 'hypothesis' };
    }).sort((a, b) => b.feasibility - a.feasibility);
    hypotheses.forEach((h, i) => { h.id = `H${i + 1}`; });

    // S5 改善建議（規則對映）
    const recs = [];
    for (const f of findings.filter(x => x.priority === 'P1' || x.priority === 'P2')) {
      const isConfig = /設定|policy|MFA|signing|logs|exposed/i.test(f.notes + f.title);
      recs.push({
        finding_id: f.finding_id, asset: f.asset.name, asset_id: f.asset_id, priority: f.priority,
        action: f.patch_available === true && !isConfig ? `套用修補（${f.vuln_id}）並驗證版本` : isConfig ? `修正設定：${f.title}` : `無修補可用：套用廠商緩解措施、限制存取來源、加強監控`,
        owner: f.asset.owner, effort: isConfig ? '低' : f.asset.type.includes('OT') || f.asset.environment === 'OT-DMZ' ? '高（需維護窗口／OT 變更審查）' : '中',
        verify: f.asset.internet_exposed ? '修補後以授權的外部驗證確認服務版本／不可利用' : '修補後以內部弱掃或設定檢查確認',
        approval: (f.asset.environment === 'OT-DMZ' || Number(f.asset.business_criticality) >= 5) ? '需變更委員會／OT 負責人／系統擁有者核准' : '一般變更流程'
      });
    }
    const compensating = [];
    if (P.inputs.controls) {
      for (const c of data.controls.controls.filter(c => c.maturity === 'none' || c.maturity === 'partial')) {
        compensating.push({ control: c.name, gaps: c.gaps.map(g => assets.get(g)?.name || g).join('、'), note: c.notes });
      }
    }

    // S6 安全驗證計畫（僅為提案；執行需授權）。外部驗證同時需要 external_scanning_authorized 與 active_testing_authorized。
    const validation = hypotheses.slice(0, 3).map((h, i) => {
      const external = assets.get(h.entry)?.internet_exposed === true;
      const otTouched = h.nodes.some(n => assets.get(n)?.environment === 'OT-DMZ' || String(assets.get(n)?.type || '').includes('OT'));
      const authorized = external ? (externalOK && activeOK) : activeOK;
      return {
        id: `V${i + 1}`, hypothesis: `${h.entryName} → ${h.targetName}（${h.hops} 跳）`, hypothesis_id: h.id,
        method: (external ? '授權下的外部驗證（版本確認／安全 PoC）+ 內部 BAS 模擬橫向移動' : '內部桌面演練 + 設定檢視 + 讀取式驗證') + (otTouched ? '（OT 端點只做讀取式驗證）' : ''),
        requires: authorized ? '已授權主動測試（仍須依書面授權範圍執行）' : `尚未授權主動測試：需 CISO 另行核准${external && !externalOK ? '（含外部掃描授權）' : ''}並排除 OT`,
        scope_exclusions: auth.excluded || [],
        success: '證明路徑不可行，或確認阻斷點（控制）有效'
      };
    });

    // S8 追蹤指標
    const p1 = findings.filter(f => f.priority === 'P1').length, p2 = findings.filter(f => f.priority === 'P2').length;
    const exposedP1 = findings.filter(f => f.priority === 'P1' && f.asset.internet_exposed).length;
    const metrics = [
      { name: '對外曝露且 P1 的發現數', value: exposedP1, target: '0（7 天內）' },
      { name: 'P1/P2 發現總數', value: `${p1} / ${p2}`, target: '每週下降' },
      { name: '可達 crown jewel 的攻擊路徑假設數', value: hypotheses.length, target: '每條路徑至少一個已驗證阻斷點' },
      { name: '平均信心水準', value: findings.length ? (findings.filter(f => f.confidence === '高').length / findings.length * 100).toFixed(0) + '% 為高信心' : '-', target: '≥ 80%' },
      { name: '資產清冊完整度（模擬）', value: `${P.inventoryCompleteness}%`, target: '≥ 95%' },
      { name: '未納入清冊的對外資產', value: P.inputs.exposures ? data.exposures.exposures.filter(e => !e.asset_id).length : '未知', target: '0' }
    ];
    const reviewPoints = [
      { stage: '範圍確認', who: 'CISO / 系統擁有者', what: '確認授權範圍、排除項與是否允許任何主動測試' },
      { stage: '優先序核准', who: '資安主管 + 業務擁有者', what: `確認 P1（${p1} 項）的業務重要性與排序是否合理；模型只是建議` },
      { stage: '攻擊路徑假設審查', who: '資安架構師', what: '拓樸與信任邊是否正確；假設不等於已驗證' },
      { stage: '改善方案核准', who: '變更委員會 / OT 負責人', what: '正式環境變更、OT 變更與維護窗口' },
      { stage: '驗證執行授權', who: 'CISO', what: '任何外部掃描、BAS 或滲透測試須書面授權' }
    ];
    const missingSummary = [...new Set(findings.flatMap(f => f.missing))];
    if (hidden.length) missingSummary.push(`資產清冊不完整：${hidden.length} 筆資產未納入分析（${hidden.map(h => h.name).join('、')}）`);
    if (outOfScope.length) missingSummary.push(`範圍外資產已排除：${outOfScope.join('、')}`);

    // S7 管理摘要（O5）：依 reporting.mask_identifiers 決定是否遮罩主機名稱；含「決策請求」與「限制」
    const p1List = findings.filter(f => f.priority === 'P1');
    const ext = p1List.filter(f => f.asset.internet_exposed);
    const top = hypotheses[0];
    const decisions = [
      `核准 P1（${p1List.length} 項）修補排程與補償控制`,
      activeOK ? '依既有書面授權執行驗證計畫 V1–V3' : '決定是否授權主動驗證（排除 OT；外部驗證另需外部掃描授權）',
      ...(missingSummary.length ? ['補齊缺漏資料後重跑分析'] : [])
    ];
    // 摘要正文限 300 字（含標點）；對象、日期、信心放在 header，不計入
    const shortTitle = (t) => String(t).replace(/\s*\(synthetic\)\s*/i, '').slice(0, 40);
    const limitNote = missingSummary.length ? missingSummary.map(m => m.replace(/（.*?）/g, '')).join('；').slice(0, 80) : '無重大資料缺漏';
    const summaryHeader = `**對象：** ${scope.reporting.audience.join('、')}｜**日期：** ${scope.analysis_date}｜**信心：** ${findings.filter(f => f.confidence === '高').length}/${findings.length} 項高信心${maskIds ? '｜識別資訊已遮罩' : ''}`;
    const summaryText = `1. 現況：${findings.length} 項發現，${p1List.length} 項 P1（${ext.length} 項對外曝露）${ext.length ? `；最急迫：${display(ext[0].asset_id)} 之 ${shortTitle(ext[0].title)}` : ''}。
2. 最可能路徑：${top ? `internet → ${top.nodes.map(n => (maskIds ? n : display(n))).join(' → ')}（可行性 ${top.feasibility}/10，未驗證），阻斷點為身分與網段控制。` : '未提供拓樸，本週無路徑假設。'}
3. 決策請求：${decisions.map((d, i) => `（${i + 1}）${d}`).join('；')}。
4. 限制：${limitNote}；所有路徑為假設，模型未驗證實際曝險。`;
    const summary = { audience: scope.reporting.audience, header: summaryHeader, text: summaryText, decisions, masked: maskIds, length: [...summaryText].length };

    return { params: P, findings, hypotheses, recs, compensating, validation, metrics, reviewPoints, missingSummary, hidden, outOfScope, thresholds: th, summary, authorization: { active: activeOK, external: externalOK } };
  }

  /** 把引擎結果轉成 skills/shared/output-schema.json 的格式 */
  function toSchema(R, data, generatedBy = 'demo-engine (assets/demo.js) / skill 1.0.0') {
    const scope = data.scope || {};
    const missing = R.missingSummary || [];
    const conf = (R.findings.length && R.findings.every(f => f.confidence === '高')) ? '高' : R.findings.some(f => f.confidence === '低') ? '低' : R.findings.length ? '中' : '低';
    const block = (basis, requires = true) => ({ confidence: conf, basis, missing_inputs: missing, requires_human: requires });
    const nameOf = (id) => data.assets?.find(a => a.asset_id === id)?.name || id;
    if (R.refused) {
      return { meta: { organization: scope.organization || '未知', analysis_date: scope.analysis_date || '', generated_by: generatedBy, scope_reference: '', scoring_rules: '未執行', disclaimer: '缺少授權範圍，已拒絕分析。' },
        refused: true, missing_fields: R.problemFields, required_fields: R.requiredFields,
        data_quality: block('缺少 scope'), exposure_priorities: { ...block('未執行'), items: [] }, attack_path_hypotheses: { ...block('未執行'), items: [] }, remediation: { ...block('未執行'), items: [], compensating_controls: [] }, validation_plan: { ...block('未執行'), items: [] }, executive_summary: { ...block('未執行'), audience: [], text: '缺少授權範圍，無法分析。', decisions_requested: ['提供 scope（授權範圍）後重跑'] }, metrics: { ...block('未執行'), items: [] }, human_review_points: [] };
    }
    // 只列入本次實際納入分析的檔案（被切換掉的類別視同未提供，不列入，並反映在 missing_inputs）
    const unknownExposed = (data.exposures?.exposures || []).filter(e => !e.asset_id).map(e => e.hostname);
    const files = [
      { name: 'scope.json', records: 1, anomalies: [`主動測試授權 = ${scope.authorized_scope?.active_testing_authorized}；外部掃描授權 = ${scope.authorized_scope?.external_scanning_authorized}`] },
      { name: 'assets.csv', records: data.assets?.length ?? 0 }, { name: 'vulnerabilities.csv', records: data.vulnerabilities?.length ?? 0 },
      R.params.inputs.exposures && { name: 'exposures.json', records: data.exposures?.exposures?.length ?? 0, anomalies: unknownExposed.map(h => `${h}（asset_id null）未納入清冊`) },
      R.params.inputs.identities && { name: 'identities.csv', records: data.identities?.length ?? 0 },
      R.params.inputs.misconfig && { name: 'misconfigurations.csv', records: data.misconfigurations?.length ?? 0 },
      R.params.inputs.controls && { name: 'controls.json', records: data.controls?.controls?.length ?? 0 },
      R.params.inputs.threatIntel && { name: 'threat-intel.json', records: data.threatIntel?.actors?.length ?? 0 },
      R.params.inputs.topology && { name: 'topology.json', records: data.topology?.edges?.length ?? 0 }
    ].filter(Boolean).map(f => ({ missing_fields: [], anomalies: [], ...f }));
    return {
      meta: {
        organization: scope.organization, analysis_date: scope.analysis_date, generated_by: generatedBy,
        scope_reference: scope.authorized_scope?.authorization_reference || '',
        scoring_rules: `本專案示範規則（task-spec 附錄 A）；風險胃納 ${R.params.riskAppetite}，門檻 P1 ≥ ${R.thresholds[0]}、P2 ≥ ${R.thresholds[1]}、P3 ≥ ${R.thresholds[2]}；權重 ${JSON.stringify(R.params.weights)}`,
        disclaimer: '本輸出由確定性示範引擎依合成資料產生；語言模型或引擎皆未驗證實際曝險；所有攻擊路徑為假設；任何主動測試與正式環境變更需人工書面授權。'
      },
      data_quality: { ...block('各檔案筆數與可用性'), files, out_of_scope_excluded: R.outOfScope, inventory_completeness_estimate: R.params.inventoryCompleteness },
      exposure_priorities: { ...block('可能性 × 影響（附錄 A 示範規則）'), items: R.findings.map(f => ({ finding_id: f.finding_id, asset_id: f.asset_id, asset_name: f.asset.name, vuln_id: f.vuln_id, title: f.title, priority: f.priority, score: f.score, likelihood: round1(f.likelihood), impact: round1(f.impact), factors: f.factors, missing: f.missing, confidence: f.confidence })), thresholds: { P1: R.thresholds[0], P2: R.thresholds[1], P3: R.thresholds[2] } },
      attack_path_hypotheses: { ...block(`拓樸邊 + 節點可能性的 DFS 推論（最長 ${F.maxHops} 跳）`), items: R.hypotheses.map(h => ({ id: h.id, entry: nameOf(h.entry), target: nameOf(h.target), entry_id: h.entry, target_id: h.target, nodes: ['internet', ...h.nodes.map(nameOf)], node_ids: h.nodes, edges: h.edges.map(e => `${nameOf(e.from)} → ${nameOf(e.to)}（${e.via}；${e.trust}）`), feasibility: h.feasibility, blocking_controls: h.blockingControls, status: 'hypothesis' })) },
      remediation: { ...block('P1/P2 發現的規則對映'), items: R.recs.map(r => ({ finding_id: r.finding_id, asset_name: r.asset, priority: r.priority, action: r.action, owner: r.owner, effort: r.effort, verify: r.verify, approval_level: r.approval })), compensating_controls: R.compensating },
      validation_plan: { ...block('前 3 條路徑假設；僅提案'), items: R.validation.map(v => ({ id: v.id, hypothesis: `${v.hypothesis_id}：${nameOf(R.hypotheses.find(h => h.id === v.hypothesis_id)?.entry)} → ${nameOf(R.hypotheses.find(h => h.id === v.hypothesis_id)?.target)}`, method: v.method, authorization_required: v.requires, scope_exclusions: v.scope_exclusions, success_criteria: v.success })) },
      executive_summary: { ...block('面向 reporting.audience 的摘要'), audience: R.summary.audience, text: R.summary.text, decisions_requested: R.summary.decisions },
      metrics: { ...block('由優先序與路徑假設計算', false), items: R.metrics.map(m => ({ ...m, next_review: '每週' })) },
      human_review_points: R.reviewPoints.map(p => ({ ...p, status: 'pending' }))
    };
  }

  /** 網站案例頁「示範規則摘要」卡片的文字（逐行、純文字，由呼叫端跳脫與排版）；數字全部取自規則資料。
      列的是基本值，示範頁調整的權重另外相乘（卡片上寫「各乘權重」）。 */
  function rulesSummary(rules = RULES) {
    const { likelihood, impact, thresholds, feasibility, confidence } = rules;
    const dataWeight = impact.dataWeight;
    return [
      `可能性 = 對外曝露 ${likelihood.exposed} + EASM 議題 ${likelihood.easmIssues} + 公開利用程式 ${likelihood.exploitPublic} + EPSS×${likelihood.epss} + KEV ${likelihood.kev} + 身分弱點 + 設定偏差 + 控制缺口 − 既有控制 + 情資命中（依行為者信心 ${likelihood.intel.high}／${likelihood.intel.medium}／${likelihood.intel.low}）（各乘權重，上限 ${likelihood.range[1]}）；缺 EPSS/KEV 時以 CVSS/10×${likelihood.cvssFallback} 近似`,
      `影響 = 業務重要性×${impact.criticality} + 資料等級（Restricted ${dataWeight.Restricted}／Confidential ${dataWeight.Confidential}／Internal ${dataWeight.Internal}／Public ${dataWeight.Public}）+${impact.crownJewel} 若為 crown jewel +${impact.entry} 若為可達 crown jewel 的入口（上限 ${impact.range[1]}）`,
      `分數 = 可能性 × 影響（${likelihood.range[0] * impact.range[0]}–${likelihood.range[1] * impact.range[1]}）；平衡胃納 P1 ≥ ${thresholds.balanced[0]}、P2 ≥ ${thresholds.balanced[1]}、P3 ≥ ${thresholds.balanced[2]}（嚴格 ${thresholds.strict.join('/')}；寬鬆 ${thresholds.tolerant.join('/')}）。`,
      `信心：缺 0 類 → 高；缺 1–${confidence.lowMissing - 1} 類 → 中；缺 ${confidence.lowMissing} 類以上或清冊完整度 < ${confidence.inventoryThreshold}% → 低。攻擊路徑可行性 = 入口可能性×${feasibility.entry} + 最弱節點×${feasibility.weakest} + 身分／設定邊×${feasibility.trustEdge} − (跳數−1)×${feasibility.perHop}；無任何發現的節點取 ${feasibility.unknownNode}。`
    ];
  }

  const api = { analyze, toSchema, scopeProblems, rulesSummary, RULES, DEFAULTS };
  if (typeof window !== 'undefined') window.DEMO = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
