---
title: Grok 安裝與使用教學
order: 40
platform: grok
---

## 1. 用途、適用情境及能力限制

**用途**：透過 xAI API 或 grok.com 對話執行「先制型曝險分析」。

**模型與承載應用**（查證日期 2026-09-09）：

| 項目 | 狀態 |
|---|---|
| 模型：Grok 4.x（SDK 範例 `grok-4.6`、`grok-4.20`） | 已查證（`xai-org/xai-sdk-python`） |
| xAI API：function calling、structured outputs、伺服器端工具（web_search、x_search、code_execution） | 已查證（SDK README 與範例） |
| grok.com：自訂指令、Workspaces、Custom Agents、Tasks | **待驗證**（官方頁面無法開啟；僅第三方描述） |
| 原生 skills／SKILL.md | **無**（agentskills.io 清單無 xAI 產品） |
| Grok 5 | 待驗證 |
| OpenAI 相容端點 | 待驗證 |

**能力限制**：沒有原生技能格式，等效方案為 system prompt + function calling。伺服器端工具預設關閉。模型不能驗證實際曝險、不執行掃描、不保證防止攻擊。

## 2. 完整檔案清單與取得方式

| 檔案 | 用途 |
|---|---|
| `skills/grok/README.md` | 平台說明與查證狀態 |
| `skills/grok/system-prompt.md` | 可直接複製的系統提示詞 |
| `skills/grok/api-workflow.py`、`requirements.txt` | `xai_sdk` 腳本（含 `--dry-run`、`--compat`） |
| `skills/grok/tool-definitions.json` | function-calling 工具定義（客戶端 harness） |
| `skills/shared/*`、`examples/synthetic-org/*` | 共用規格與合成資料 |

取得：網站「Skills 專區 → Grok」或 `downloads/skills-grok.zip`。

## 3. 輸入格式、必填欄位與範例資料

同共用規格（`scope.json`、`assets.csv`、`vulnerabilities.csv` 必要；其餘建議）。API 腳本會把 9 檔內容以文字附在使用者訊息中；grok.com 對話則以附件或貼上內容提供（附件限制待驗證）。

## 4. 執行步驟、證據要求及缺少資料時的處理方式

S1–S8；每區塊帶 `confidence`、`basis`、`missing_inputs`、`requires_human`；缺 scope 停止；缺 topology 跳過 S4；其他依替代規則標示。若使用 `tool-definitions.json`，模型會請求呼叫 `load_input_bundle` → `score_findings` → `request_human_approval`，由你的程式執行並回傳結果；`request_human_approval` 只記錄請求。

## 5. 輸出格式與完整範例

Markdown 報告 + JSON（符合 `output-schema.json`）。縮短版合成範例：

```markdown
## 資料品質
9 檔讀入；EASM 發現 1 個未納入清冊的對外資產；信心：高。

## 曝險優先序（節錄）
| P1 | vpn-gw-01 | SYN-2026-0101 | 86.0 | 對外曝露；公開利用程式；EPSS 0.91；KEV；情資命中；可達 crown jewel 之入口 |
| P1 | web-portal-01 | SYN-2026-0210 | 68.7 | 對外曝露；公開利用程式；EPSS 0.62；入口 |

## 攻擊路徑假設（未驗證）
1. internet → vpn-gw-01 → ad-dc-01 → erp-db-01（可行性 6.4/10）

## 安全驗證計畫（提案）：V1 …；尚未授權主動測試
## 管理摘要（≤300 字）：…決策請求…限制…
> 本分析由語言模型依使用者提供的資料整理，未驗證實際曝險；所有攻擊路徑為假設；任何主動測試與變更需人工授權。
```

## 6. 必要工具、連線及權限

| 承載方式 | 需要 | 資料流向 |
|---|---|---|
| xAI API | `XAI_API_KEY`（環境變數）、`pip install xai-sdk pydantic` | 資料送至 xAI API；**不啟用**伺服器端工具即不會觸發額外處理 |
| grok.com | 帳號；自訂指令／Workspace 功能待驗證 | 資料上傳至 grok.com |

## 7. 逐步安裝或設定方式

### A. 聊天應用（grok.com，介面名稱與功能待驗證）

1. 若設定頁有「自訂指令」或「Workspace／Custom Agent」指令欄：貼入 `system-prompt.md` 的提示詞區塊。
2. 若沒有：新對話第一則訊息貼入提示詞，接著貼上或附加 9 個資料檔。
3. 輸入「請逐步輸出 S1–S8，最後附 JSON」。

### B. 開發者（xAI API）

```bash
pip install -r skills/grok/requirements.txt
python3 skills/grok/api-workflow.py --dry-run       # 無金鑰離線檢查
export XAI_API_KEY=...                              # 勿寫入檔案
export XAI_MODEL=grok-4.6                           # 以 docs.x.ai 確認
python3 skills/grok/api-workflow.py                 # 輸出 output/grok-report.md、grok-output.json
```

`--compat` 改走 OpenAI 相容端點（`https://api.x.ai/v1`，相容性待驗證，需 `pip install openai`）。

若要使用 function calling：把 `tool-definitions.json` 的 `tools` 傳入 SDK 的 `tool()` 定義，並在你的程式中實作三個函式（可直接呼叫 `skills/claude/preemptive-exposure-analysis/scripts/validate_inputs.py` 的邏輯做 `load_input_bundle`）。

## 8. 使用範例、預期結果及常見問題

**範例**：`python3 skills/grok/api-workflow.py` → 終端列出 9 檔筆數 → 產生報告與 JSON。

**FAQ**

1. *`xai_sdk` 的方法名稱不同？* SDK 更新可能改變 API；以 `github.com/xai-org/xai-sdk-python` README 為準修改 `call_xai_sdk`。
2. *可以開啟 web_search 讓 Grok 查 CVE？* 不建議：本任務禁止上網補造資料，且會把內容送往額外處理流程；若組織核准，需另行標示所有外部知識「需查證」。
3. *grok.com 沒有自訂指令欄？* 直接把提示詞貼在對話第一則。
4. *JSON 解析失敗？* 原始回應會存為 `output/grok-output.raw.txt`；可再送一次「只輸出 JSON」。
5. *Structured outputs 能保證 schema？* SDK 支援 Pydantic 解析（已查證），但 `output-schema.json` 較複雜，建議先以兩段式取得 JSON 再用 schema 驗證。

## 9. 簡單、可重現的驗收方式

依 `task-spec.md` 第 7 節 7 項執行；API 腳本可用 `--input-dir` 指向刪除 `threat-intel.json` 或 `scope.json` 的複本資料夾來做第 6、7 項（缺 scope 時腳本會立即中止並列出必要欄位）。

## 10. 機敏資料處理與人工核准邊界

- 伺服器端工具預設關閉；啟用前需資料治理核准。
- 對外掃描、主動驗證、正式環境變更只產生提案；`request_human_approval` 只記錄。
- API 金鑰只放環境變數；不提交到儲存庫。
- 管理摘要預設遮罩帳號、IP、主機名稱。
