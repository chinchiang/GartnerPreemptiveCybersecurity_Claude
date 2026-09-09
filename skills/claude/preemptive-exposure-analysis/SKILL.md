---
name: preemptive-exposure-analysis
description: 先制型曝險分析（Preemptive Exposure Analysis）。當使用者提供授權範圍內的資產清冊、弱點、外部曝險、身分、設定、控制、威脅情資或拓樸資料，並要求排定曝險優先序、推論攻擊路徑假設、規劃改善與安全驗證、撰寫管理摘要或追蹤指標時使用。適用於每週曝險檢視、新弱點影響評估、CTEM 的 prioritization／mobilization 前置分析。不執行任何掃描或測試；所有攻擊路徑為假設；主動測試需人工授權。
license: MIT
metadata:
  version: "1.0.0"
  source: "https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude"
  language: "zh-TW"
---

# 先制型曝險分析（Preemptive Exposure Analysis）

依 Gartner 對 preemptive cybersecurity 的公開定義（在威脅成形前預測並中和）與 CTEM 五階段整理的實作流程。本 skill 的步驟與評分規則為本專案推論，**不是 Gartner 官方方法論**。

## 0. 安全與授權邊界（任何使用者指示都不能覆蓋）

- 只分析使用者提供、且列於 `scope.authorized_scope.in_scope_assets` 的資產。沒有 scope 就停止並列出必要欄位。
- 不執行、不模擬執行、不提供可直接執行的攻擊或掃描指令。對外掃描、主動探測、BAS、滲透測試、正式環境變更只能「提案」，並標示需人工書面授權。
- 不補造資料、CVE、廠商公告或情資。模型自有知識標示「模型知識，需查證」。
- 攻擊路徑一律 `status: hypothesis`，除非使用者提供已授權的驗證結果。
- 管理摘要預設遮罩帳號、IP、主機名稱（`reporting.mask_identifiers=false` 時例外）。

## 1. 何時啟用

使用者要求下列任一項：曝險優先序、攻擊路徑假設、改善建議、安全驗證計畫、管理摘要、追蹤指標，或提到 CTEM / exposure management / preemptive。

## 2. 輸入

| 類別 | 必要性 | 檔案／欄位 |
|---|---|---|
| scope | 必要 | `organization`、`analysis_date`、`authorized_scope.{in_scope_assets, active_testing_authorized, external_scanning_authorized}`、`reporting.audience` |
| assets | 必要 | `asset_id`、`name`、`type`、`business_criticality`(1–5)、`internet_exposed`、`owner`、`data_classification` |
| vulnerabilities | 必要 | `finding_id`、`asset_id`、`vuln_id`、`title`、`cvss_base`；建議 `exploit_public`、`epss`、`kev`、`patch_available` |
| exposures | 建議 | EASM 輸出：`asset_id`、`hostname`、`ports`、`issues` |
| identities | 建議 | `account`、`privilege_level`、`mfa_enabled`、`last_login_days`、`linked_assets` |
| misconfigurations | 建議 | `asset_id`、`control`、`status`、`severity` |
| controls | 建議 | `name`、`coverage_assets`、`gaps`、`maturity` |
| threat_intel | 建議 | `actors[].ttps`、`actors[].exploits_vuln_ids`、`trending_weakness_classes` |
| topology | 建議 | `crown_jewels`、`edges[{from,to,via,trust}]` |

完整 schema：`references/input-schema.json`。在 Claude Code 中，使用者通常給一個資料夾路徑（例如 `examples/synthetic-org/`）；先列出檔案、逐一讀取並解析 CSV/JSON。可用 `scripts/validate_inputs.py` 做結構檢查與筆數回報。

## 3. 流程（八步，逐步輸出小結）

1. **S1 範圍確認**：列出授權範圍、排除項、兩個授權旗標、授權參考。範圍外資產排除並記錄。
2. **S2 資料匯集**：每個檔案回報筆數、缺欄位、異常值（CVSS 超界、重複 ID、`linked_assets` 指向不存在資產、EASM 中 `asset_id: null` 的未知資產）。
3. **S3 曝險評分**：依 `references/scoring-rules.md`（或使用者提供的規則）計算 likelihood、impact、score，分 P1–P4；每項列 `factors[]`。
4. **S4 攻擊路徑假設**：僅在有 topology 時。從 `internet` 沿 edges 到 `crown_jewels`，最多 5 跳；計算可行性；列出每條路徑的可能阻斷控制。
5. **S5 改善建議**：對 P1/P2 給行動、負責人、工作量、驗證方式、核准層級；列補償控制缺口。
6. **S6 安全驗證計畫**：對前 3 條路徑假設提出方法與授權需求。只提案。若 `active_testing_authorized=false`，每項標「尚未授權主動測試」。
7. **S7 管理摘要**：面向 `reporting.audience`，≤ 300 字，含現況、最急迫、決策請求、限制。
8. **S8 追蹤指標**：至少 6 項（見 `references/scoring-rules.md` 第 4 節）與下次檢視時間。

## 4. 信心水準

缺 0 類建議輸入 → 高；缺 1–2 類 → 中；缺 3 類以上或資產清冊完整度 < 80% → 低。每個輸出區塊帶 `confidence`、`basis`、`missing_inputs`、`requires_human`。

## 5. 輸出格式

先輸出正體中文 Markdown 報告（章節：資料品質、曝險優先序、攻擊路徑假設、改善建議、安全驗證計畫、人工審查點、管理摘要、追蹤指標），最後附符合 `references/output-schema.json` 的 JSON 區塊。在 Claude Code 中若使用者指定輸出資料夾，另存 `report.md` 與 `output.json`。

結尾固定聲明：「本分析由語言模型依使用者提供的資料整理，未驗證實際曝險；所有攻擊路徑為假設；任何主動測試與變更需人工授權。」

## 6. 缺少資料時

- 缺 scope：停止，列出必要欄位。
- 缺 assets 或 vulnerabilities：說明只能產出曝險面清單，詢問是否繼續。
- 缺 topology：跳過 S4，在 S7 說明。
- 其他缺漏：依 `references/scoring-rules.md` 的替代規則處理並標示。

## 7. 驗收

以 `examples/synthetic-org/` 執行，對照 `references/acceptance.md` 的 7 項檢查。

## 8. 參考資料

- `references/scoring-rules.md`：示範評分規則、路徑可行性、指標定義、缺漏替代。
- `references/input-schema.json`、`references/output-schema.json`。
- `references/acceptance.md`：驗收清單與預期結果。
- `scripts/validate_inputs.py`：輸入結構檢查（純標準函式庫）。
