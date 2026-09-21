---
title: 共用任務規格：先制型曝險分析（Preemptive Exposure Analysis）
role: shared-spec
version: 1.0.0
---

# 共用任務規格：先制型曝險分析（Preemptive Exposure Analysis）

> 本規格是五個平台（ChatGPT、Claude、Grok、GLM、DeepSeek）skill 或等效工作流程的**單一來源**。各平台檔案只在「載入方式、工具呼叫、檔案處理」上做調整，不改變本規格的任務定義、證據要求與人工核准邊界。
>
> 依據：Gartner 對 preemptive cybersecurity 的公開定義（以 AI/ML 在威脅成形前預測並中和；能力例如 predictive threat intelligence、advanced deception、automated moving target defense）與 Gartner CTEM 五階段（scoping、discovery、prioritization、validation、mobilization）。**本規格的步驟、欄位與評分方式為本專案推論，非 Gartner 官方方法論。**

## 1. 任務定義

| 項目 | 內容 |
|---|---|
| 任務名稱 | 先制型曝險分析（Preemptive Exposure Analysis，簡稱 PEA） |
| 一句話目的 | 在攻擊者行動之前，依授權範圍內的資產、曝險、身分、控制與威脅情資，產出**曝險優先序、攻擊路徑假設、改善建議、安全驗證計畫、管理摘要與追蹤指標**，並標明每項輸出的信心水準與待人工決策點。 |
| 適用情境 | 每週／每次重大變更的曝險檢視；新弱點公告後的影響評估；CTEM 的 prioritization 與 mobilization 前置分析；向管理層彙報。 |
| 不適用情境 | 事件回應中的即時處置；未經授權的任何主動測試；對外部第三方（非授權範圍）進行分析。 |
| 語言模型的角色 | 資料整合、規則化推理、假設生成、文件撰寫。**語言模型不能驗證實際曝險、不能執行掃描、不能保證防止攻擊。** |

## 2. 輸入（Inputs）

### 2.1 必要輸入

| 編號 | 名稱 | 格式 | 必填欄位 | 缺少時 |
|---|---|---|---|---|
| I1 | 授權範圍與分析參數（scope） | JSON | `organization`、`analysis_date`、`authorized_scope.in_scope_assets`、`authorized_scope.active_testing_authorized`、`authorized_scope.external_scanning_authorized`、`reporting.audience` | **中止**：無授權範圍不得分析。要求使用者補齊。 |
| I2 | 資產清冊 + 業務重要性（assets） | CSV/JSON | `asset_id`、`name`、`type`、`business_criticality`(1–5)、`internet_exposed`、`owner` | **中止**或要求至少提供最小清冊；若無 `business_criticality`，以資料等級或使用者口述推估並標示「推估」。 |
| I3 | 弱點與發現（vulnerabilities） | CSV/JSON | `finding_id`、`asset_id`、`vuln_id`、`title`、`cvss_base` | 若無弱點資料，僅能依曝露與設定產出「曝險面清單」，並降低信心。 |

### 2.2 建議輸入

| 編號 | 名稱 | 格式 | 主要欄位 | 缺少時 |
|---|---|---|---|---|
| I4 | 外部曝險（EASM 輸出） | JSON | `asset_id`、`hostname`、`ports`、`issues` | 以 `internet_exposed` 旗標近似；標示「未經 EASM 確認」。 |
| I5 | 利用可能性訊號 | 欄位 | `exploit_public`、`epss`、`kev` | 以 CVSS 近似；信心下修。 |
| I6 | 身分與權限（identities） | CSV/JSON | `account`、`privilege_level`、`mfa_enabled`、`last_login_days`、`linked_assets` | 攻擊路徑假設中的身分邊全部標示「未知」。 |
| I7 | 設定基準偏差（misconfigurations） | CSV/JSON | `asset_id`、`control`、`status`、`severity` | 略過設定因子；信心下修。 |
| I8 | 既有控制措施（controls） | JSON | `name`、`coverage_assets`、`gaps`、`maturity` | 假設無補償控制（保守）；標示。 |
| I9 | 威脅情資（threat intel） | JSON | `actors[].ttps`、`actors[].exploits_vuln_ids`、`trending_weakness_classes` | 不做情資加權；標示「未納入情資」。 |
| I10 | 網路拓樸／信任關係（topology） | JSON | `crown_jewels`、`edges[{from,to,via,trust}]` | 不產生攻擊路徑假設；僅產出單資產排序。 |

### 2.3 輸入處理規則

1. 先驗證 I1；任何資產若不在 `in_scope_assets` 內，**排除並記錄**。
2. 解析每個檔案後回報：筆數、缺欄位、異常值（例如 CVSS > 10、重複 ID）。
3. 不得補造資料；缺漏就標示，並在輸出中列出「資料缺漏對結論的影響」。
4. 機敏欄位（帳號、IP、主機名稱）只用於分析，輸出時依 `reporting` 設定決定是否遮罩。

## 3. 處理流程（八步）

| 步驟 | 名稱 | 處理 | 產出 | 人工決策點 |
|---|---|---|---|---|
| S1 | 範圍確認 Scoping | 讀取 I1，列出範圍、排除項、授權狀態 | 範圍摘要 | 授權人確認 |
| S2 | 資料匯集 Discovery | 解析 I2–I10，產生資料品質報告 | 資料品質報告 | 決定是否在缺漏下繼續 |
| S3 | 曝險評分 Prioritization | 依「可能性 × 影響」規則（附錄 A）為每項發現評分，依風險胃納分 P1–P4 | 曝險優先序（O1） | 業務擁有者確認 P1 |
| S4 | 攻擊路徑假設 Hypothesis | 以 I10 邊 + S3 分數，從入口到 crown jewel 推論路徑與可行性 | 攻擊路徑假設（O2） | 架構師審查拓樸正確性 |
| S5 | 改善建議 Remediation | 對 P1/P2 對映行動、負責人、工作量、驗證方式、核准層級；列出補償控制缺口 | 改善建議（O3） | 變更委員會／OT 負責人核准 |
| S6 | 驗證計畫 Validation plan | 為前 N 條路徑假設提出驗證方法與授權需求（**只提案，不執行**） | 安全驗證計畫（O4） | CISO 書面授權 |
| S7 | 管理摘要 Mobilization | 面向 `reporting.audience` 的摘要與決策請求 | 管理摘要（O5） | 管理層決策 |
| S8 | 追蹤指標 Tracking | 計算指標與下次檢視時間 | 追蹤指標（O6） | 每週檢視 |

## 4. 輸出（Outputs）

所有輸出必須包含：`confidence`（高／中／低）、`basis`（判斷依據）、`missing_inputs`（影響此輸出的缺漏）、`requires_human`（是否需人工核准）。完整 JSON schema 見 `output-schema.json`。

| 編號 | 名稱 | 結構重點 | 使用對象 |
|---|---|---|---|
| O1 | 曝險優先序 | 每項：`finding_id`、`asset`、`priority`(P1–P4)、`score`、`likelihood`、`impact`、`factors[]`、`confidence` | 資安團隊、系統擁有者 |
| O2 | 攻擊路徑假設 | 每條：`entry`、`nodes[]`、`edges[]`、`feasibility`(0–10)、`blocking_controls[]`、`status: hypothesis` | 資安架構師、紅隊 |
| O3 | 改善建議 | 每項：`action`、`owner`、`effort`、`verify`、`approval_level`、`compensating_controls[]` | IT/OT 營運、變更委員會 |
| O4 | 安全驗證計畫 | 每項：`hypothesis`、`method`、`authorization_required`、`scope_exclusions`、`success_criteria` | CISO、紅隊／BAS 團隊 |
| O5 | 管理摘要 | ≤ 300 字：現況、最急迫、決策請求、限制 | CISO、管理層 |
| O6 | 追蹤指標 | `name`、`value`、`target`、`next_review` | 資安治理 |

## 5. 證據與信心規則

- 每個分數、優先序與路徑假設都要能回溯到具體輸入欄位（`factors[]` 記錄）。
- 信心水準：缺 0 類建議輸入 → 高；缺 1–2 類 → 中；缺 3 類以上或資產清冊完整度 < 80% → 低（topology 缺漏亦計為一類）。
- 攻擊路徑一律標示 `status: hypothesis`，除非使用者提供已授權驗證結果。
- 不得引用不存在的 CVE、廠商公告或情資；所有外部知識需標示「模型知識，需查證」。

## 6. 機敏資料與人工核准邊界

| 行為 | 允許 | 條件 |
|---|---|---|
| 讀取並分析使用者提供的資料 | 是 | 僅限 I1 授權範圍 |
| 建議修補與設定變更 | 是 | 輸出為建議；執行需變更流程 |
| 產生驗證計畫 | 是 | 標示需授權；不得含可直接執行的攻擊指令 |
| 對外掃描、主動探測、BAS、滲透測試 | **否** | 語言模型不執行；需 `external_scanning_authorized` / `active_testing_authorized` 為 true 且有人工書面授權才可由人員／工具執行 |
| 正式環境變更 | **否** | 僅建議 |
| 輸出含帳號、IP、主機名稱 | 視設定 | 對管理層摘要預設遮罩 |
| 將資料送往第三方服務 | **否** | 除非使用者在平台層級已同意（例如企業版資料處理協議） |

## 7. 驗收方式（所有平台通用）

以 `examples/synthetic-org/` 的合成資料執行，檢查：

1. 讀入 9 個檔案並回報筆數（scope 1、assets 12、vulnerabilities 14、identities 8、misconfigurations 9、controls 8、actors 3、edges 19、exposures 7）。
2. O1 中 `vpn-gw-01` 的 `SYN-2026-0101` 應為 **P1**，且 factors 含「對外曝露」「公開利用程式」「模擬 KEV」「威脅情資命中」。
3. O2 至少包含一條 `internet → vpn-gw-01 → ad-dc-01 → erp-db-01` 的假設，狀態為 hypothesis。
4. O4 每項都標示「尚未授權主動測試」（因 scope.json 中兩個授權旗標皆為 false）。
5. O5 以正體中文、≤ 300 字，含「決策請求」與「限制」。
6. 移除 `threat-intel.json` 重跑：O1 信心水準應下修，且輸出明確列出「未納入威脅情資」。
7. 移除 `scope.json` 重跑：應**拒絕分析**並要求提供授權範圍。

## 附錄 A：示範評分規則（本專案推論，非 Gartner 公式）

```
likelihood = clamp(
    3·[internet_exposed] + 0.5·[EASM issues]
  + 2·[exploit_public] + 3·epss + 3·[kev]
  + min(2, identity_issues)·0.8
  + min(1.5, misconfigs·0.75)·0.8
  − min(2, controls·0.6)·0.8 + min(1.5, gaps·0.4)·0.8
  + threat_intel_hit_weight(actor confidence high 2 / medium 1.5 / low 1), 0, 10)
  # 缺 epss/kev：以 cvss_base/10·1.5 取代 3·epss + 3·[kev]，並標示「改用 CVSS 近似」
  # identity_issues = 連結到該資產且（mfa_enabled 為 false 或 partial、或 last_login_days > 90）的身分數
impact = clamp(business_criticality·1.4 + data_weight(Restricted=3, Confidential=2, Internal=1, Public=0) + 2·[crown_jewel] + 2·[entry_to_crown_jewel], 0, 10)
score = likelihood × impact  (0–100)
priority: balanced（預設）→ P1 ≥ 60, P2 ≥ 40, P3 ≥ 20, 其餘 P4；strict → 50/30/15；tolerant → 70/50/25
path_feasibility = clamp(entry_likelihood·0.5 + weakest_node·0.3 + identity_or_misconfig_edges·1.0 − (hops−1)·0.6, 0, 10)
  # 節點可能性：有發現者取其最高 likelihood（可為 0）；完全無發現的節點取 3（未知）
  # 驗證計畫：external_scanning_authorized 或 active_testing_authorized 任一為 false → 每項標「尚未授權主動測試」；對外驗證需兩者皆 true
```

使用者可以提供自己的權重或以組織既有的風險模型取代；模型必須在輸出中說明實際使用的規則。
