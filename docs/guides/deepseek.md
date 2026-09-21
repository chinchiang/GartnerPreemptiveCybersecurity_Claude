---
title: DeepSeek 安裝與使用教學
order: 60
platform: deepseek
---

## 1. 用途、適用情境及能力限制

**用途**：以 DeepSeek 模型（V4 或任何後續版本）執行「先制型曝險分析」，設計上**不依賴特定模型版本**。

**模型與承載應用**（查證日期 2026-09-09）：

| 項目 | 狀態 |
|---|---|
| DeepSeek V4 Preview（2026-04-24）：`deepseek-v4-pro`、`deepseek-v4-flash`；OpenAI 與 Anthropic 相容介面 | 部分查證（官方 URL 與摘要；頁面無法開啟） |
| DeepSeek-V4-Pro GA（2026-08-13）：1M context、384K 輸出、JSON Output、Tool Calls | 部分查證 |
| `deepseek-chat`／`deepseek-reasoner` 於 2026-07-24 退役 | 部分查證 |
| `deepseek-ai` GitHub：命名 V4-Pro／V4-Flash；無 V4 程式碼 repo；`deepseek-harness` plugin 架構 | 已查證 |
| 模型授權條款、strict tool calling | 待驗證 |
| chat.deepseek.com 自訂指令／專案 | 待驗證（未查證到） |
| 第一方 skills 機制 | 無 |

**能力限制**：沒有原生技能格式；聊天應用需每次貼提示詞；模型不能驗證實際曝險、不執行掃描、不保證防止攻擊。

## 2. 完整檔案清單與取得方式

| 檔案 | 用途 |
|---|---|
| `skills/deepseek/README.md` | 平台說明、V4 查證狀態、版本無關設計 |
| `skills/deepseek/system-prompt.md` | 可直接複製的系統提示詞 |
| `skills/deepseek/preemptive-exposure-analysis/SKILL.md` | Agent Skills 標準 skill（供 OpenClaw、Deep Code 等 host） |
| `skills/deepseek/api-workflow.py`、`requirements.txt` | OpenAI 相容端點腳本（含 `--dry-run`） |
| `skills/shared/*`、`examples/synthetic-org/*` | 共用規格與合成資料 |

取得：網站「Skills 專區 → DeepSeek」或 `downloads/skills-deepseek.zip`。

## 3. 輸入格式、必填欄位與範例資料

同共用規格；欄位見 `skills/shared/input-schema.json`；範例 `examples/synthetic-org/`。

## 4. 執行步驟、證據要求及缺少資料時的處理方式

S1–S8；每區塊帶 `confidence`、`basis`、`missing_inputs`、`requires_human`；缺 scope 停止；缺 topology 跳過 S4；其他依替代規則標示。API 腳本第二段以 `response_format={"type":"json_object"}` 取得 JSON（JSON Output 支援依官方公告摘要，部分查證）。

## 5. 輸出格式與完整範例

Markdown 報告 + JSON。縮短版合成範例與 Claude 教學第 5 節相同（P1：`vpn-gw-01 / SYN-2026-0101`；路徑 `internet → vpn-gw-01 → ad-dc-01 → erp-db-01`；驗證計畫標「尚未授權主動測試」；結尾聲明）。`meta.generated_by` 填「DeepSeek <模型 ID> via <承載方式>」。

## 6. 必要工具、連線及權限

| 承載方式 | 需要 | 資料流向 |
|---|---|---|
| API 腳本 | `DEEPSEEK_API_KEY`；`pip install openai` | 資料送至 api.deepseek.com |
| skills-capable host | OpenClaw／Deep Code／Claude Code（Anthropic 相容介面設定待驗證） | 依 host 設定送至 DeepSeek API |
| chat.deepseek.com | 帳號 | 資料上傳至 DeepSeek |

**治理考量**：DeepSeek API 由中國大陸公司營運。企業使用者需依資料出境、資料分類與供應商評估政策決定是否可送出資產、弱點、身分資料；示範請只用合成資料。

## 7. 逐步安裝或設定方式

### A. 聊天應用（chat.deepseek.com）

1. 新對話第一則訊息貼入 `system-prompt.md` 的提示詞區塊。
2. 貼上或附加 9 個資料檔內容（附件格式與大小限制待驗證）。
3. 輸入「請逐步輸出 S1–S8，最後附 JSON」。若有思考模式（名稱以官方為準）可開啟。

### B. skills-capable host

1. 把 `skills/deepseek/preemptive-exposure-analysis/` 複製到 host 的 skills 目錄（OpenClaw、Deep Code 的目錄位置以各 host 官方文件為準；Claude Code 為 `.claude/skills/preemptive-exposure-analysis/`）。
2. 設定 host 使用 DeepSeek 端點與 API key（Claude Code 的 Anthropic 相容設定待驗證，以 api-docs.deepseek.com 為準）。
3. 呼叫 skill 並指定資料夾。

### C. API 腳本

```bash
pip install -r skills/deepseek/requirements.txt
python3 skills/deepseek/api-workflow.py --dry-run
export DEEPSEEK_API_KEY=...                      # 勿寫入檔案
export DEEPSEEK_BASE_URL=https://api.deepseek.com
export DEEPSEEK_MODEL=deepseek-v4-pro            # 以 api-docs.deepseek.com 確認；版本變動只需改此值
python3 skills/deepseek/api-workflow.py
```

輸出：`output/deepseek-report.md`、`output/deepseek-output.json`。

## 8. 使用範例、預期結果及常見問題

**FAQ**

1. *模型 ID 不存在？* 舊名稱已退役；以官方模型列表更新 `DEEPSEEK_MODEL`。
2. *`response_format` 被拒絕？* 表示該模型或端點不支援 JSON Output。腳本會捕捉例外、印出警告，並自動改以提示詞要求純 JSON 重試一次；仍解析失敗時存原始回應。也可一開始就加 `--no-json-mode`。
3. *chat.deepseek.com 沒有自訂指令？* 每次新對話貼提示詞；或改用 API 腳本。
4. *可以用 V4-Flash？* 可，改環境變數；重跑驗收確認分級一致。
5. *strict 工具呼叫可用嗎？* 待驗證；本流程不依賴它。

## 9. 簡單、可重現的驗收方式

依 `task-spec.md` 第 7 節 7 項。第 6、7 項用旗標模擬缺漏：

```bash
python3 skills/deepseek/api-workflow.py --dry-run --exclude threat_intel   # 第 6 項
python3 skills/deepseek/api-workflow.py --dry-run --exclude scope          # 第 7 項：立即中止並列出必填欄位
```

## 10. 機敏資料處理與人工核准邊界

- 資料出境評估為前提；示範只用合成資料。
- API key 只放環境變數。
- 對外掃描、主動驗證、正式環境變更只產生提案，執行需人工書面授權。
- 管理摘要預設遮罩識別資訊。
