/* 案例互動展示引擎。
   重要：這裡的評分規則是本專案為了「示範輸入如何影響輸出」而設計的簡化規則，
   不是 Gartner 的官方公式，也不代表任何真實風險模型。所有數值皆基於合成資料。 */
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** 預設參數（可由 UI 調整） */
  const DEFAULTS = {
    inputs: { threatIntel: true, identities: true, controls: true, misconfig: true, epss: true, topology: true, exposures: true },
    weights: { exposure: 1.0, exploit: 1.0, identity: 0.8, control: 0.8, intel: 1.0, impact: 1.0 },
    inventoryCompleteness: 100, // 0-100：模擬資產清冊完整度
    riskAppetite: 'balanced'     // 'strict' | 'balanced' | 'tolerant'
  };

  function analyze(data, params = DEFAULTS) {
    const P = { ...DEFAULTS, ...params, inputs: { ...DEFAULTS.inputs, ...(params.inputs || {}) }, weights: { ...DEFAULTS.weights, ...(params.weights || {}) } };
    const assets = new Map(data.assets.map(a => [a.asset_id, a]));
    const controlsOf = (id) => P.inputs.controls ? data.controls.controls.filter(c => c.coverage_assets.includes(id)).map(c => c.name) : [];
    const gapsOf = (id) => P.inputs.controls ? data.controls.controls.filter(c => c.gaps.includes(id)).map(c => c.name) : [];
    const identityIssues = (id) => P.inputs.identities ? data.identities.filter(i => String(i.linked_assets).split(';').includes(id) && (i.mfa_enabled === false || i.mfa_enabled === 'partial' || Number(i.last_login_days) > 90)) : [];
    const intelHits = (vulnIds) => P.inputs.threatIntel ? data.threatIntel.actors.filter(a => a.exploits_vuln_ids.some(v => vulnIds.includes(v))) : [];
    const intelWeight = (a) => ({ high: 2, medium: 1.5, low: 1 })[a.confidence] ?? 1;
    // 可達 crown jewel 的入口節點（blast radius 因子）
    const entryNodes = new Set();
    if (P.inputs.topology) {
      const byFrom0 = {};
      for (const e of data.topology.edges) (byFrom0[e.from] ||= []).push(e);
      const reach = (node, seen) => {
        if (data.topology.crown_jewels.includes(node)) return true;
        for (const e of byFrom0[node] || []) if (!seen.has(e.to) && reach(e.to, new Set([...seen, e.to]))) return true;
        return false;
      };
      for (const e of byFrom0['internet'] || []) if (reach(e.to, new Set([e.to]))) entryNodes.add(e.to);
    }
    const misconfigs = (id) => P.inputs.misconfig ? data.misconfigurations.filter(m => m.asset_id === id && m.status === 'fail') : [];
    const exposureOf = (id) => P.inputs.exposures ? data.exposures.exposures.find(e => e.asset_id === id) : null;

    // 模擬資產清冊不完整：依完整度隱藏排序靠後的資產（示範用）
    const visibleIds = data.assets.map(a => a.asset_id).filter((_, idx, arr) => idx < Math.round(arr.length * P.inventoryCompleteness / 100));
    const hidden = data.assets.filter(a => !visibleIds.includes(a.asset_id));

    const findings = data.vulnerabilities.filter(v => visibleIds.includes(v.asset_id)).map(v => {
      const a = assets.get(v.asset_id);
      const f = { ...v, asset: a, factors: [], missing: [] };
      let likelihood = 0;
      // 1. 外部曝露
      const exposed = a.internet_exposed === true;
      if (exposed) { likelihood += 3 * P.weights.exposure; f.factors.push('對外曝露'); }
      const ex = exposureOf(v.asset_id);
      if (ex && ex.issues.length) { likelihood += 0.5 * P.weights.exposure; f.factors.push(`EASM 議題：${ex.issues.join('、')}`); }
      if (!P.inputs.exposures) f.missing.push('外部曝險資料');
      // 2. 利用可能性
      if (v.exploit_public === true) { likelihood += 2 * P.weights.exploit; f.factors.push('公開利用程式'); }
      if (P.inputs.epss) {
        likelihood += 3 * Number(v.epss_sim) * P.weights.exploit;
        if (Number(v.epss_sim) >= 0.5) f.factors.push(`模擬 EPSS ${v.epss_sim}`);
        if (v.kev_sim === true) { likelihood += 3 * P.weights.exploit; f.factors.push('模擬 KEV（已知遭利用）'); }
      } else { likelihood += (Number(v.cvss_base) / 10) * 1.5 * P.weights.exploit; f.missing.push('EPSS/KEV（改用 CVSS 近似）'); }
      // 3. 身分弱點
      const idIss = identityIssues(v.asset_id);
      if (idIss.length) { likelihood += Math.min(2, idIss.length) * P.weights.identity; f.factors.push(`身分弱點 ×${idIss.length}`); }
      if (!P.inputs.identities) f.missing.push('身分與權限資料');
      // 4. 設定偏差
      const mc = misconfigs(v.asset_id);
      if (mc.length) { likelihood += Math.min(1.5, mc.length * 0.75) * P.weights.control; f.factors.push(`設定偏差 ×${mc.length}`); }
      if (!P.inputs.misconfig) f.missing.push('設定基準資料');
      // 5. 既有控制（降低）與缺口（提高）
      const ctl = controlsOf(v.asset_id), gaps = gapsOf(v.asset_id);
      if (ctl.length) { likelihood -= Math.min(2, ctl.length * 0.6) * P.weights.control; f.factors.push(`既有控制：${ctl.join('、')}`); }
      if (gaps.length) { likelihood += Math.min(1.5, gaps.length * 0.4) * P.weights.control; f.factors.push(`控制缺口：${gaps.join('、')}`); }
      if (!P.inputs.controls) f.missing.push('既有控制措施');
      // 6. 威脅情資
      const hits = intelHits([v.vuln_id]);
      if (hits.length) { likelihood += Math.max(...hits.map(intelWeight)) * P.weights.intel; f.factors.push(`威脅情資命中：${hits.map(h => `${h.name}（${h.confidence}）`).join('、')}`); }
      if (!P.inputs.threatIntel) f.missing.push('威脅情資');
      f.likelihood = clamp(likelihood, 0, 10);
      // 影響
      const dataW = { Restricted: 3, Confidential: 2, Internal: 1 }[a.data_classification] || 1;
      let impact = (Number(a.business_criticality) * 1.4 + dataW) * P.weights.impact;
      const cj = data.topology.crown_jewels.includes(v.asset_id);
      if (cj) { impact += 2 * P.weights.impact; f.factors.push('crown jewel'); }
      if (entryNodes.has(v.asset_id)) { impact += 2 * P.weights.impact; f.factors.push('可達 crown jewel 之入口（blast radius）'); }
      f.impact = clamp(impact, 0, 10);
      f.score = Math.round(f.likelihood * f.impact * 10) / 10; // 0-100
      f.confidence = f.missing.length === 0 ? '高' : f.missing.length <= 2 ? '中' : '低';
      return f;
    });
    const th = { strict: [50, 30, 15], balanced: [60, 40, 20], tolerant: [70, 50, 25] }[P.riskAppetite] || [60, 40, 20];
    for (const f of findings) f.priority = f.score >= th[0] ? 'P1' : f.score >= th[1] ? 'P2' : f.score >= th[2] ? 'P3' : 'P4';
    findings.sort((a, b) => b.score - a.score);

    // 攻擊路徑假設：從 internet 出發，走 topology edges 到 crown jewels（簡單 DFS，最長 5 跳）
    const paths = [];
    if (P.inputs.topology) {
      const edges = data.topology.edges.filter(e => (e.from === 'internet' || visibleIds.includes(e.from)) && visibleIds.includes(e.to));
      const byFrom = {};
      for (const e of edges) (byFrom[e.from] ||= []).push(e);
      const dfs = (node, trail, seen) => {
        if (trail.length > 5) return;
        for (const e of byFrom[node] || []) {
          if (seen.has(e.to)) continue;
          const t = [...trail, e];
          if (data.topology.crown_jewels.includes(e.to)) paths.push(t);
          else dfs(e.to, t, new Set([...seen, e.to]));
        }
      };
      dfs('internet', [], new Set(['internet']));
    }
    const scoreOfAsset = (id) => Math.max(0, ...findings.filter(f => f.asset_id === id).map(f => f.likelihood));
    const hypotheses = paths.map(p => {
      const nodes = p.map(e => e.to);
      const entry = nodes[0];
      const entryFinding = findings.filter(f => f.asset_id === entry)[0];
      const weakest = Math.min(...nodes.map(n => scoreOfAsset(n) || 3));
      const hops = p.length;
      const identityEdges = p.filter(e => e.trust === 'identity' || e.trust === 'misconfig').length;
      const feasibility = clamp(((entryFinding ? entryFinding.likelihood : 2) * 0.5 + weakest * 0.3 + identityEdges * 1.0) - (hops - 1) * 0.6, 0, 10);
      const target = nodes[nodes.length - 1];
      return { nodes, edges: p, entry, target, hops, feasibility: Math.round(feasibility * 10) / 10, targetName: assets.get(target)?.name, entryName: assets.get(entry)?.name };
    }).sort((a, b) => b.feasibility - a.feasibility);

    // 改善建議（規則對映）
    const recs = [];
    for (const f of findings.filter(x => x.priority === 'P1' || x.priority === 'P2')) {
      const isConfig = /設定|policy|MFA|signing|logs|exposed/i.test(f.notes + f.title);
      recs.push({
        finding_id: f.finding_id, asset: f.asset.name, priority: f.priority,
        action: f.patch_available === true && !isConfig ? `套用修補（${f.vuln_id}）並驗證版本` : isConfig ? `修正設定：${f.title}` : `無修補可用：套用廠商緩解措施、限制存取來源、加強監控`,
        owner: f.asset.owner, effort: isConfig ? '低' : f.asset.type.includes('OT') || f.asset.environment === 'OT-DMZ' ? '高（需維護窗口／OT 變更審查）' : '中',
        verify: f.asset.internet_exposed ? '修補後以授權的外部驗證確認服務版本／不可利用' : '修補後以內部弱掃或設定檢查確認',
        approval: (f.asset.environment === 'OT-DMZ' || Number(f.asset.business_criticality) >= 5) ? '需變更委員會／系統擁有者核准' : '一般變更流程'
      });
    }
    const compensating = [];
    if (P.inputs.controls) {
      for (const c of data.controls.controls.filter(c => c.maturity === 'none' || c.maturity === 'partial')) {
        compensating.push({ control: c.name, gaps: c.gaps.map(g => assets.get(g)?.name || g).join('、'), note: c.notes });
      }
    }

    // 安全驗證計畫（僅為提案；執行需授權）
    const validation = hypotheses.slice(0, 3).map((h, i) => ({
      id: `V${i + 1}`, hypothesis: `${h.entryName} → ${h.targetName}（${h.hops} 跳）`,
      method: h.entry === 'A01' || h.entry === 'A02' || h.entry === 'A03' ? '授權下的外部驗證（版本確認／安全 PoC）+ 內部 BAS 模擬橫向移動' : '內部桌面演練 + 設定檢視 + 讀取式驗證',
      requires: data.scope.authorized_scope.active_testing_authorized ? '已授權主動測試' : '尚未授權主動測試：需 CISO 另行核准並排除 OT',
      success: '證明路徑不可行，或確認阻斷點（控制）有效'
    }));

    // 追蹤指標
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
    return { params: P, findings, hypotheses, recs, compensating, validation, metrics, reviewPoints, missingSummary, hidden, thresholds: th };
  }
  window.DEMO = { analyze, DEFAULTS };
})();
