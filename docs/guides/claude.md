---
title: Claude 安裝與使用教學
order: 30
platform: claude
---

## 1. 用途、適用情境及能力限制

**用途**：在 Claude 上以 Agent Skill 形式執行「先制型曝險分析」：讀取授權範圍內的資產、弱點、曝險、身分、設定、控制、情資與拓樸資料，產出曝險優先序、攻擊路徑假設、改善建議、安全驗證計畫、管理摘要與追蹤指標。

**模型與承載應用**（查證日期 2026-09-09，來源：platform.claude.com、code.claude.com）：

| 項目 | 狀態 |
|---|---|
| 模型：Claude Fable 5.1、Opus 5、Sonnet 5、Haiku 4.5 | 已查證 |
| Agent Skills（SKILL.md）於 claude.ai、Claude Code、Skills API、Agent SDK | 已查證 |
| claude.ai 上傳 skill 需 Pro/Max/Team/Enterprise 且啟用 code execution | 已查證 |
| 技能不跨介面同步；只有六個 frontmatter 欄位跨介面有效 | 已查證 |
| claude.ai Projects 的指令長度與檔案上限 | 待驗證（支援文章在研究環境中無法開啟） |

**能力限制**：Claude 只依你提供的資料推理；不會執行掃描或測試；不保證防止攻擊；攻擊路徑一律為假設。

## 2. 完整檔案清單與取得方式

- `skills/claude/preemptive-exposure-analysis/SKILL.md`（主指令）
- `references/scoring-rules.md`、`references/acceptance.md`、`references/input-schema.json`、`references/output-schema.json`
- `scripts/validate_inputs.py`
- 範例資料：`examples/synthetic-org/`（9 個合成檔案）

取得方式：網站「Skills 專區 → Claude」逐檔複製或下載 `downloads/skills-claude.zip`；或 `git clone` 儲存庫。

## 3. 輸入格式、必填欄位與範例資料

| 檔案 | 必要性 | 必填欄位 |
|---|---|---|
| `scope.json` | 必要 | `organization`、`analysis_date`、`authorized_scope.in_scope_assets`、`authorized_scope.active_testing_authorized`、`authorized_scope.external_scanning_authorized`、`reporting.audience` |
| `assets.csv` | 必要 | `asset_id`、`name`、`type`、`business_criticality`、`internet_exposed`、`owner` |
| `vulnerabilities.csv` | 必要 | `finding_id`、`asset_id`、`vuln_id`、`title`、`cvss_base` |
| `exposures.json`、`identities.csv`、`misconfigurations.csv`、`controls.json`、`threat-intel.json`、`topology.json` | 建議 | 見 `input-schema.json` |

範例：`examples/synthetic-org/`（Northwind Precision，全部合成）。

## 4. 執行步驟、證據要求及缺少資料時的處理方式

1. S1 範圍確認 → 2. S2 資料品質報告 → 3. S3 曝險評分 → 4. S4 攻擊路徑假設 → 5. S5 改善建議 → 6. S6 驗證計畫（提案）→ 7. S7 管理摘要 → 8. S8 追蹤指標。

證據要求：每個分數列出 `factors[]`；每個區塊帶 `confidence`、`basis`、`missing_inputs`、`requires_human`。

缺少資料：缺 `scope.json` 停止；缺 assets／vulnerabilities 只產出曝險面清單並詢問；缺 topology 跳過 S4；其他依 `scoring-rules.md` 第 6 節替代並標示。

## 5. 輸出格式與完整範例

輸出為 Markdown 報告 + JSON（符合 `output-schema.json`）。以下為以合成資料執行的縮短版範例（**合成，非真實**）：

```markdown
## 資料品質
- 9 個檔案讀入：assets 12、vulnerabilities 14、identities 8、misconfigurations 9、controls 8、actors 3、edges 19、exposures 7
- 異常：EASM 發現 1 個未納入清冊的對外資產（old-test.northwind-synthetic.example）
- 信心：高（無缺漏類別）

## 曝險優先序（節錄）
| 優先 | 資產 | 發現 | 分數 | 依據 |
|---|---|---|---|---|
| P1 | vpn-gw-01 | SYN-2026-0101 VPN pre-auth RCE | 86.0 | 對外曝露；公開利用程式；模擬 EPSS 0.91；模擬 KEV；身分弱點 ×1；控制缺口 ×3；情資命中 SYNTHETIC-GROUP-ALPHA（medium）；可達 crown jewel 之入口 |
| P1 | web-portal-01 | SYN-2026-0210 SynthCMS upload RCE | 68.7 | 對外曝露；公開利用程式；模擬 EPSS 0.62；設定偏差 ×1；既有控制 EDR、WAF；入口 |
| P1 | mes-srv-01 | SYN-2023-0044 MES unauthenticated API | 72.5 | 公開利用程式；身分弱點；設定偏差；控制缺口 ×5；情資（low）；crown jewel |

## 攻擊路徑假設（未驗證）
1. internet → vpn-gw-01 → ad-dc-01 → erp-db-01（可行性 6.4/10）：VPN RCE → DC → svc-erp-sync 網域管理員憑證
2. internet → vpn-gw-01 → ad-dc-01 → erp-app-01 → erp-db-01（可行性 6.1/10）

## 安全驗證計畫（提案）
- V1 vpn-gw-01 → erp-db-01：授權下外部版本確認 + 內部 BAS 模擬橫向移動；**尚未授權主動測試**

## 管理摘要（≤300 字，帳號／IP 已遮罩）
本週 14 項發現，5 項 P1（4 項對外曝露）。最急迫：VPN 閘道之 pre-auth RCE（已有公開利用且情資顯示產業內活躍）。最可行路徑：VPN → 網域控制站 → ERP 資料庫，關鍵阻斷點為特權服務帳號 MFA 與網段隔離。決策請求：核准 7 天內修補 VPN 與入口網站；決定是否授權外部驗證（排除 OT）。限制：所有路徑為假設；備份儲存桶未啟用不可變設定。

> 本分析由語言模型依使用者提供的資料整理，未驗證實際曝險；所有攻擊路徑為假設；任何主動測試與變更需人工授權。
```

實際數值會因模型推理而略有差異；分級與主要依據應一致（見第 9 節驗收）。

## 6. 必要工具、連線及權限

| 使用方式 | 需要 | 資料流向 |
|---|---|---|
| Claude Code | Claude Code CLI／IDE／桌面版；讀取本機檔案權限 | 資料送至 Anthropic API（或你設定的相容端點） |
| claude.ai | Pro/Max/Team/Enterprise、啟用 code execution、Settings > Features 上傳權限 | 資料上傳至 claude.ai |
| API | API key（環境變數 `ANTHROPIC_API_KEY`，勿寫入程式碼）、`/v1/skills` 與 code execution 工具 | 資料送至 Anthropic API |

不需要任何對外掃描工具；本 skill 不連線到情資平台。企業使用者請確認資料處理協議。

## 7. 逐步安裝或設定方式

### A. Claude Code（專案層級）

```bash
git clone https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude.git
cd GartnerPreemptiveCybersecurity_Claude
mkdir -p .claude/skills
cp -r skills/claude/preemptive-exposure-analysis .claude/skills/
claude            # 啟動 Claude Code
```

在 Claude Code 中輸入：

```
/preemptive-exposure-analysis 請分析 examples/synthetic-org，輸出到 output/
```

個人層級改放 `~/.claude/skills/`。Claude Code 會在啟動時載入 skill 的 name/description，需要時才載入完整內容。

### B. claude.ai

1. 將 `skills/claude/preemptive-exposure-analysis/` 整個資料夾壓成 zip（zip 根目錄須是該資料夾）。
2. claude.ai → Settings → Features（介面名稱以官方為準）→ 上傳 skill zip；需 Pro/Max/Team/Enterprise 且已啟用 code execution。
3. 建立一個 Project（選用），把 `task-spec.md` 與範例資料放入專案知識。
4. 新對話：附上 9 個資料檔，輸入「請以 preemptive-exposure-analysis 進行先制型曝險分析」。

### C. Claude Developer Platform（API）

```bash
cd skills/claude && zip -r preemptive-exposure-analysis.zip preemptive-exposure-analysis
curl https://api.anthropic.com/v1/skills \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" \
  -F "display_title=Preemptive Exposure Analysis" -F "files[]=@preemptive-exposure-analysis.zip"
```

回傳的 `skill_id` 放入 Messages API 請求的 `container.skills`，並加入 code execution 工具（工具版本以官方文件為準）。上限：每次請求 20 個 skill、上傳 30 MB。

## 8. 使用範例、預期結果及常見問題

**範例**：`/preemptive-exposure-analysis examples/synthetic-org` → 先看到範圍摘要與資料品質，再逐步輸出八個章節與 JSON。

**FAQ**

1. *Skill 沒有被觸發？* 確認資料夾在 `.claude/skills/` 且 `SKILL.md` 的 `name` 為 `preemptive-exposure-analysis`；或直接用 `/` 指令呼叫。
2. *claude.ai 上傳失敗？* 檢查方案是否支援、code execution 是否啟用、frontmatter 是否只含六個相容欄位。
3. *數值和網站示範不同？* 示範頁使用確定性規則；模型推理可能有小差異，但 P1/P2 分級與主要依據應一致。
4. *可以讓 Claude 直接掃描嗎？* 不行。本 skill 明確禁止；需由授權人員以合規工具執行。
5. *可以接情資平台嗎？* 可透過 MCP 連接器提供只讀資料，仍須遵守授權範圍。
6. *同一個 skill 能用在 Codex 或 GLM 嗎？* 可以，格式相同；見對應平台教學。

## 9. 簡單、可重現的驗收方式

依 `references/acceptance.md` 執行 7 項檢查：

1. 先跑 `python3 skills/claude/preemptive-exposure-analysis/scripts/validate_inputs.py examples/synthetic-org`（在儲存庫根目錄；若已安裝到 `.claude/skills/`，路徑為 `.claude/skills/preemptive-exposure-analysis/scripts/validate_inputs.py`），應顯示 9 檔筆數且「可以進行分析」。
2. 執行 skill，確認 `vpn-gw-01 / SYN-2026-0101` 為 P1 並含四個關鍵依據。
3. 確認路徑 `internet → vpn-gw-01 → ad-dc-01 → erp-db-01` 存在且為 hypothesis。
4. 驗證計畫每項標「尚未授權主動測試」。
5. 管理摘要 ≤ 300 字且含決策請求、限制。
6. 暫時移除 `threat-intel.json` 重跑，信心下修並標示。
7. 暫時移除 `scope.json` 重跑，應拒絕分析。

## 10. 機敏資料處理與人工核准邊界

- 只上傳授權範圍內、已去識別化或經核准的資料；管理摘要預設遮罩帳號、IP、主機名稱。
- 對外掃描、主動驗證、正式環境變更：skill 只產生提案；執行需 `scope.json` 兩個授權旗標為 true 且有人工書面授權。
- 不得將真實 API key 寫入 skill、專案或儲存庫；使用環境變數。
- 輸出的 JSON 含資產識別資訊，請依組織分類儲存。
