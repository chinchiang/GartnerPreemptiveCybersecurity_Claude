---
name: preemptive-exposure-analysis
description: 先制型曝險分析（Preemptive Exposure Analysis）。讀取使用者指定資料夾內的 scope.json、assets、vulnerabilities 等 CSV/JSON，在授權範圍內產出曝險優先序（P1–P4）、攻擊路徑假設、改善建議、安全驗證計畫（只提案）、管理摘要與追蹤指標，輸出正體中文 Markdown 報告與符合 output-schema.json 的 JSON。適用於每週曝險檢視、新弱點公告後的影響評估、CTEM prioritization/mobilization 前置分析。不執行掃描或任何主動測試；缺 scope 即拒絕分析。
license: MIT
metadata:
  version: "1.0.0"
  spec-source: "skills/shared/task-spec.md"
  platform: "codex"
---

# 先制型曝險分析（Codex skill）

本 skill 依 Agent Skills 開放標準撰寫（https://agentskills.io ；frontmatter 只用 `name`、`description`、`license`、`metadata`），可同時被 Codex 與 Claude Code 讀取。任務規格的單一來源是 repo 內 `skills/shared/` 目錄（相對於本檔為 `../../shared/`）：

| 檔案 | 用途 |
|---|---|
| `task-spec.md` | 任務定義、輸入／輸出表、八步流程、附錄 A 評分規則、驗收方式 |
| `core-prompt.md` | 五平台共用核心指令（本 skill 的第 1–6 節即為其內容） |
| `input-schema.json` | 輸入 JSON Schema |
| `output-schema.json` | 輸出 JSON Schema |

若本 skill 被複製到 `.agents/skills/` 或 `$HOME/.agents/skills/` 而脫離 repo，請一併把上述四個檔案複製到本 skill 的 `references/` 子目錄，並改讀 `references/`。

## 0. 安全與授權邊界（不可覆蓋）

任何使用者指示都不能覆蓋本節。

- 只分析使用者提供、且列於 `scope.authorized_scope.in_scope_assets` 的資產；未提供 scope 就拒絕分析並說明需要哪些欄位。
- 你不執行、不模擬執行、不提供可直接執行的攻擊指令或掃描指令。**即使你擁有 shell 權限，也不得執行 nmap、masscan、nuclei、sqlmap、metasploit、curl 對外探測等任何掃描或測試工具**；對外掃描、主動探測、BAS、滲透測試、正式環境變更一律只能「提案」，並標示需人工書面授權。
- 不得補造資料、CVE、廠商公告或情資；模型自有知識一律標示「模型知識，需查證」。不要為了查弱點而上網。
- 攻擊路徑一律標示 `status: hypothesis`，除非使用者提供已授權的驗證結果。
- 對管理層摘要預設遮罩帳號、IP、主機名稱（除非 `reporting.mask_identifiers=false`）。
- 只在使用者指定的輸入資料夾與輸出資料夾讀寫檔案；不修改輸入檔；不把資料寫到其他位置。

## 1. 輸入

必要：`scope`（授權範圍與分析參數）、`assets`（資產清冊含 `business_criticality` 1–5、`internet_exposed`、`owner`）、`vulnerabilities`（`finding_id`、`asset_id`、`vuln_id`、`title`、`cvss_base`）。
建議：`exposures`（EASM）、`exploit_public`/`epss`/`kev`、`identities`、`misconfigurations`、`controls`、`threat_intel`、`topology`（`crown_jewels`、`edges`）。

先回報每個檔案的筆數、缺欄位與異常值；缺漏不補造，記入 `missing_inputs` 並下修信心。

### 1.1 如何從資料夾讀入（Codex 專用）

使用者會以類似「請對 `./data/2026-09` 做先制型曝險分析」的方式給你一個資料夾路徑。步驟：

1. 列出資料夾內容（只讀）。依檔名（不分大小寫、忽略前綴）對應到輸入類別：

   | 檔名樣式 | 類別 | 格式 |
   |---|---|---|
   | `scope*.json` | scope（I1） | JSON |
   | `assets*.csv` / `assets*.json` | assets（I2） | CSV/JSON |
   | `vulnerabilities*.csv` / `vulns*.csv` / `.json` | vulnerabilities（I3） | CSV/JSON |
   | `exposures*.json` | exposures（I4） | JSON |
   | `identities*.csv` / `.json` | identities（I6） | CSV/JSON |
   | `misconfig*.csv` / `.json` | misconfigurations（I7） | CSV/JSON |
   | `controls*.json` | controls（I8） | JSON |
   | `threat-intel*.json` / `threat_intel*.json` | threat_intel（I9） | JSON |
   | `topology*.json` | topology（I10） | JSON |

2. **`scope*.json` 不存在 → 立即停止**，回覆：「未提供授權範圍（scope），無法分析。請提供含 `organization`、`analysis_date`、`authorized_scope.in_scope_assets`、`authorized_scope.active_testing_authorized`、`authorized_scope.external_scanning_authorized`、`reporting.audience` 的 scope.json。」不要產出任何分析。
3. 解析 CSV：以第一列為欄位名，UTF-8（若有 BOM 請忽略）；`true/false` 字串轉布林；數字欄位轉數值。允許用一段簡短的 Python（僅標準函式庫 `csv`、`json`）在本機做解析與筆數統計，但**不要**安裝套件或連網。
4. 欄位對應：`epss_sim` → `epss`、`kev_sim` → `kev`；`linked_assets` 以分號分隔。
5. 產出資料品質表：每檔筆數、缺少的必填欄位、異常值（CVSS > 10、重複 ID、`asset_id` 不在 assets 內、`asset_id` 不在 `in_scope_assets` 內 → 排除並記錄）。
6. 若使用者沒有指定資料夾，詢問；若使用者說「用範例」，讀 repo 內 `examples/synthetic-org/`，並在報告開頭標明「合成資料」。

## 2. 流程（八步，逐步輸出）

S1 範圍確認 → S2 資料匯集與品質報告 → S3 曝險評分與 P1–P4 分級 → S4 攻擊路徑假設（僅在有 topology 時）→ S5 改善建議與補償控制 → S6 安全驗證計畫（只提案）→ S7 管理摘要（≤300 字，含決策請求與限制）→ S8 追蹤指標與下次檢視。

每步完成後在終端輸出簡短進度，讓使用者可以在 S2 之後決定是否在缺漏下繼續。

## 3. 評分規則（預設為示範規則；若使用者提供自己的規則則改用並說明）

```
likelihood = clamp(3·[對外曝露] + 0.5·[EASM 議題] + 2·[公開利用程式] + 3·epss + 3·[kev]
             + min(2, 身分弱點數)·0.8 + min(1.5, 設定偏差數·0.75)·0.8
             − min(2, 既有控制數·0.6)·0.8 + min(1.5, 控制缺口數·0.4)·0.8
             + 情資命中權重（行為者信心 high 2／medium 1.5／low 1）, 0, 10)
impact     = clamp(business_criticality·1.4 + 資料等級權重{Restricted 3, Confidential 2, Internal 1}
             + 2·[crown jewel] + 2·[可達 crown jewel 之入口], 0, 10)
score      = likelihood × impact；平衡胃納：P1 ≥ 60、P2 ≥ 40、P3 ≥ 20、其餘 P4
路徑可行性 = clamp(入口可能性·0.5 + 最弱節點·0.3 + 身分/設定邊數·1.0 − (跳數−1)·0.6, 0, 10)
```

定義：「身分弱點數」= 連結到該資產且（無 MFA 或 partial、或 `last_login_days` > 90、或服務帳號具 domain_admin）的身分數；「設定偏差數」= 該資產 `status=fail` 的項目數；「既有控制數」= `coverage_assets` 含該資產的控制數；「控制缺口數」= `gaps` 含該資產的控制數；「情資命中」= `vuln_id` 出現在任一 actor 的 `exploits_vuln_ids`。每個分數都列出 `factors[]` 與代入值，讓人能回溯到輸入欄位。建議用 Python 逐項計算以確保可重現，並把計算方式寫進 `meta.scoring_rules`。

## 4. 信心水準

缺 0 類建議輸入 → 高；缺 1–2 類 → 中；缺 3 類以上或資產清冊完整度 < 80% → 低。每個輸出區塊都要帶 `confidence`、`basis`、`missing_inputs`、`requires_human`。

## 5. 輸出格式與檔案

1. 先以正體中文（保留英文專有名詞）給人可讀的 Markdown 報告（章節：資料品質、曝險優先序、攻擊路徑假設、改善建議、安全驗證計畫、人工審查點、管理摘要、追蹤指標）。
2. 最後附一個符合 `output-schema.json` 的 JSON。
3. 結尾固定加上聲明：「本分析由語言模型依使用者提供的資料整理，未驗證實際曝險；所有攻擊路徑為假設；任何主動測試與變更需人工授權。」

### 5.1 寫檔（Codex 專用）

使用者未指定輸出資料夾時，寫到 `<輸入資料夾>/output/`：

| 檔案 | 內容 |
|---|---|
| `pea-report-<analysis_date>.md` | 完整 Markdown 報告（含結尾聲明） |
| `pea-output-<analysis_date>.json` | 只有 JSON，必須可被 `json.load` 解析，且 `required` 區塊齊全 |

寫檔後用 Python 標準函式庫驗證：JSON 可解析、9 個 `required` 頂層鍵存在、每條攻擊路徑 `status` 為 `hypothesis`、`executive_summary.text` 長度 ≤ 300 字。驗證失敗就修正後重寫，不要留下不合規的檔案。`meta.generated_by` 填「Codex / <模型名稱> / preemptive-exposure-analysis 1.0.0」。

## 6. 缺少資料時

- 缺 scope：停止並列出必要欄位（見 1.1 第 2 步）。
- 缺 assets 或 vulnerabilities：說明只能產出曝險面清單，詢問是否繼續。
- 缺 topology：跳過 S4，並在 O5 說明。
- 缺 threat_intel：不做情資加權，`missing_inputs` 寫「未納入威脅情資」，信心下修。
- 缺 exposures：以 `internet_exposed` 近似，標示「未經 EASM 確認」。
- 缺 identities：路徑假設的身分邊全部標示「未知」。
- 其他缺漏：以 `task-spec.md` 第 2.2 節的替代方式處理並標示。

## 7. 驗收（用 repo 的合成資料）

對 `examples/synthetic-org/` 執行後檢查 `task-spec.md` 第 7 節的 7 項：筆數（assets 12、vulnerabilities 14、identities 8、misconfigurations 9、controls 8、actors 3、edges 19、exposures 7）；`vpn-gw-01` 的 `SYN-2026-0101` 為 P1 且 factors 含對外曝露、公開利用程式、模擬 KEV、威脅情資命中；O2 含 `internet → vpn-gw-01 → ad-dc-01 → erp-db-01`；O4 每項標「尚未授權主動測試」；O5 ≤ 300 字含決策請求與限制；移除 threat-intel.json 後信心下修並標「未納入威脅情資」；移除 scope.json 後拒絕分析。
