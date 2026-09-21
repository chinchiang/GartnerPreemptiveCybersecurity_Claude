---
title: ChatGPT 安裝與使用教學
order: 20
platform: chatgpt
---

## 1. 用途、適用情境及能力限制

**用途**：在 OpenAI 的三種承載層上執行「先制型曝險分析」：ChatGPT 應用（Custom GPT／Projects）、Codex（Agent Skills 開放標準）、OpenAI API（Responses API）。

**模型與承載應用**（查證日期 2026-09-09；來源見 `docs/evidence/ai-platform-skills-evidence.md`）：

| 項目 | 狀態 |
|---|---|
| 模型：GPT-5.x（官方 SDK README 範例為 `gpt-5.5`） | 已查證（GitHub）；ChatGPT 選單顯示名稱待驗證 |
| ChatGPT Custom Instructions／Projects／Custom GPTs 存在 | 部分查證（官方說明頁存在，沙箱內無法開啟） |
| Custom GPT Knowledge：每個 GPT 20 個檔案、單檔 512 MB／2M tokens | 部分查證（搜尋摘要） |
| Projects 檔案數與指令字數上限 | 待驗證 |
| Codex 支援 Agent Skills（`.agents/skills`、`$HOME/.agents/skills`） | 標準與 `openai/skills`→`openai/plugins` 已查證；路徑部分查證 |
| Responses API `client.responses.create` | 已查證（SDK README） |

**能力限制**：ChatGPT 聊天應用沒有證據能直接載入 SKILL.md，因此以「貼入指令 + 上傳 Knowledge」承載；Custom GPT 的 Actions 預設不啟用；模型不能驗證實際曝險、不執行掃描、不保證防止攻擊。

## 2. 完整檔案清單與取得方式

| 檔案 | 用途 |
|---|---|
| `skills/chatgpt/README.md` | 平台說明與查證狀態 |
| `skills/chatgpt/custom-gpt-instructions.md` | Custom GPT 的 Instructions 全文、名稱、描述、開場提示、Knowledge 清單 |
| `skills/chatgpt/project-instructions.md` | ChatGPT Projects 的短版指令與附檔方式 |
| `skills/chatgpt/preemptive-exposure-analysis/SKILL.md` | Agent Skills 標準格式的 Codex skill |
| `skills/chatgpt/api-workflow.py`、`requirements.txt` | Responses API 腳本（含 `--dry-run`） |
| `skills/shared/*` | 共用規格、核心提示詞、輸入／輸出 schema |
| `examples/synthetic-org/*` | 合成範例資料（9 檔） |

取得：網站「Skills 專區 → ChatGPT」逐檔複製或下載 `downloads/skills-chatgpt.zip`；或 `git clone` 儲存庫。

## 3. 輸入格式、必填欄位與範例資料

同共用規格：`scope.json`（必要）、`assets.csv`（必要）、`vulnerabilities.csv`（必要）；`exposures.json`、`identities.csv`、`misconfigurations.csv`、`controls.json`、`threat-intel.json`、`topology.json`（建議）。欄位定義見 `skills/shared/input-schema.json`。

在 ChatGPT 中：把檔案拖入對話或加入 Project／GPT Knowledge。在 Codex 中：給資料夾路徑。在 API 中：腳本自動讀取 `examples/synthetic-org/` 或 `--input-dir`。

## 4. 執行步驟、證據要求及缺少資料時的處理方式

八步流程 S1–S8（範圍確認 → 資料品質 → 評分 → 路徑假設 → 改善 → 驗證計畫 → 管理摘要 → 指標）。每項輸出需 `confidence`、`basis`、`missing_inputs`、`requires_human`。缺 scope 停止；缺 assets／vulnerabilities 只產出曝險面清單；缺 topology 跳過 S4；其他依替代規則並標示。

## 5. 輸出格式與完整範例

Markdown 報告 + JSON（符合 `skills/shared/output-schema.json`）。以下為以合成資料執行的縮短版範例（**合成，非真實**）：

```markdown
## 資料品質
9 檔讀入：assets 12、vulnerabilities 14、identities 8、misconfigurations 9、controls 8、actors 3、edges 19、exposures 7。
異常：EASM 有 1 個未納入清冊的對外資產。信心：高。

## 曝險優先序（節錄）
| 優先 | 資產 | 發現 | 分數 | 依據 |
|---|---|---|---|---|
| P1 | vpn-gw-01 | SYN-2026-0101 | 86.0 | 對外曝露；公開利用程式；EPSS 0.91；KEV；身分弱點；控制缺口 ×3；情資命中；可達 crown jewel 之入口 |
| P1 | web-portal-01 | SYN-2026-0210 | 68.7 | 對外曝露；公開利用程式；EPSS 0.62；設定偏差；既有控制 EDR、WAF；入口 |

## 攻擊路徑假設（未驗證）
1. internet → vpn-gw-01 → ad-dc-01 → erp-db-01（可行性 6.4/10）

## 安全驗證計畫（提案）
V1：授權下外部版本確認 + 內部 BAS；**尚未授權主動測試**。

## 管理摘要（≤300 字，識別資訊已遮罩）
……決策請求：核准 7 天內修補 VPN；決定是否授權外部驗證（排除 OT）。限制：所有路徑為假設。

> 本分析由語言模型依使用者提供的資料整理，未驗證實際曝險；所有攻擊路徑為假設；任何主動測試與變更需人工授權。
```

## 6. 必要工具、連線及權限

| 承載方式 | 需要 | 資料流向 |
|---|---|---|
| Custom GPT／Project | ChatGPT 帳號（Custom GPT 建立需付費方案，方案名稱以官方為準） | 資料上傳至 OpenAI（依帳戶資料政策） |
| Codex | Codex CLI／IDE 擴充／桌面版；本機檔案讀寫 | 檔案內容送至 OpenAI API |
| API | `OPENAI_API_KEY`（環境變數）、`pip install openai` | 資料送至 OpenAI API |

不需要瀏覽、Actions 或任何掃描工具。

## 7. 逐步安裝或設定方式

### A. 聊天應用

**A1. Custom GPT**

1. ChatGPT → 探索 GPT → 建立（介面名稱以官方為準）。
2. 在「Instructions」貼入 `custom-gpt-instructions.md` 的指令區塊；名稱、描述、開場提示依同檔建議。
3. 在「Knowledge」上傳：`skills/shared/task-spec.md`、`input-schema.json`、`output-schema.json`，以及（示範用）`examples/synthetic-org/` 9 檔。
4. 「Capabilities」：關閉瀏覽與程式碼執行以外的功能；**不要**新增 Actions。
5. 儲存為「只有我」或「有連結的人」；企業請依政策。

**A2. Project**

1. 新增 Project → 指令欄貼入 `project-instructions.md` 的指令。
2. 把 9 個資料檔加入 Project 檔案。
3. 在 Project 內新對話：「請對已附加的檔案進行先制型曝險分析，逐步輸出 S1–S8。」

### B. 開發者

**B1. Codex skill**

```bash
git clone https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude.git
cd GartnerPreemptiveCybersecurity_Claude
mkdir -p .agents/skills
cp -r skills/chatgpt/preemptive-exposure-analysis .agents/skills/preemptive-exposure-analysis
# 若要脫離 repo 使用，另複製 skills/shared/* 到 .agents/skills/preemptive-exposure-analysis/references/
codex
```

在 Codex 中輸入：`$preemptive-exposure-analysis 請分析 examples/synthetic-org`。使用者層級可放 `$HOME/.agents/skills/`（路徑部分查證，請以 developers.openai.com/codex/skills 為準）。

**B2. API 腳本**

```bash
pip install -r skills/chatgpt/requirements.txt
python3 skills/chatgpt/api-workflow.py --dry-run          # 無金鑰離線檢查
export OPENAI_API_KEY=...                                 # 勿寫入檔案
export OPENAI_MODEL=gpt-5.5                               # 以 platform.openai.com 確認
python3 skills/chatgpt/api-workflow.py
```

輸出：`output/chatgpt-report.md`、`output/chatgpt-output.json`。

## 8. 使用範例、預期結果及常見問題

**範例**：在 Custom GPT 中上傳 9 檔並輸入「請進行先制型曝險分析」；預期先看到範圍與資料品質摘要，再逐步輸出八章與 JSON。

**FAQ**

1. *GPT 沒有讀 Knowledge 就開始分析？* 在訊息中明確要求「先讀取 Knowledge 內的 task-spec.md 與資料檔並回報筆數」。
2. *輸出 JSON 不合 schema？* 追問「請只輸出符合 output-schema.json 的 JSON 物件」；API 腳本已採兩段式呼叫。
3. *Codex 找不到 skill？* 確認目錄為 `.agents/skills/<name>/SKILL.md` 且 `name` 為 `preemptive-exposure-analysis`；重啟 Codex。
4. *可以讓 GPT 上網查 CVE 嗎？* 本 skill 明確禁止補造與上網查證；所有外部知識需標示「模型知識，需查證」。
5. *數值與網站示範不同？* 示範頁為確定性規則；模型推理可能有小差異，但分級與主要依據應一致。
6. *Custom GPT 可分享給全公司嗎？* 可，但 Knowledge 內若含真實資料，分享範圍等於資料分享範圍；示範請只放合成資料。

## 9. 簡單、可重現的驗收方式

依 `skills/shared/task-spec.md` 第 7 節 7 項：

1. 回報筆數（assets 12、vulnerabilities 14、identities 8、misconfigurations 9、controls 8、actors 3、edges 19、exposures 7）。
2. `vpn-gw-01 / SYN-2026-0101` 為 P1，依據含對外曝露、公開利用程式、模擬 KEV、情資命中。
3. 路徑 `internet → vpn-gw-01 → ad-dc-01 → erp-db-01` 存在且為 hypothesis。
4. 驗證計畫每項標「尚未授權主動測試」。
5. 管理摘要 ≤ 300 字，含決策請求與限制。
6. 移除 `threat-intel.json`（Knowledge／Project 中刪除；API 腳本加 `--exclude threat_intel`）重跑：信心下修並標示「未納入威脅情資」。
7. 移除 `scope.json`（API 腳本加 `--exclude scope`）重跑：拒絕分析。API 腳本會直接中止並印出必要欄位。

## 10. 機敏資料處理與人工核准邊界

- 只上傳授權範圍內、已核准的資料；Custom GPT／Project 的分享範圍即資料分享範圍。
- Actions 一律關閉；任何 Action 都等於把資料送往第三方端點。
- 對外掃描、主動驗證、正式環境變更只產生提案；執行需 `scope.json` 授權旗標為 true 且有人工書面授權。
- API 金鑰只放環境變數；不得提交到儲存庫。
