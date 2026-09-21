---
title: Grok 平台說明
role: readme
---

# Grok（xAI）平台說明：先制型曝險分析（PEA）

任務定義、證據要求、評分規則與人工核准邊界一律以 `../shared/task-spec.md` 與 `../shared/core-prompt.md` 為準；本目錄只處理「怎麼把核心指令放進 Grok」。

## 1. 模型 vs. 承載應用（查證日期 2026-09-09）

| 層 | 名稱 | 說明 | 查證狀態 |
|---|---|---|---|
| 模型 | Grok 4.x（官方 SDK 範例使用 `grok-4.6`、`grok-4.20`） | 官方 `xai-org/xai-sdk-python` README 與範例檔 | **已查證**（GitHub） |
| 模型 | Grok 5 | 僅第三方報導「訓練中」 | 待驗證 |
| 應用 | **xAI API**（`api.x.ai`，`xai_sdk`） | 「Agentic Tool Calling」（伺服器端 `web_search`、`x_search`、`code_execution`）、Function Calling（客戶端工具）、Structured Outputs（Pydantic） | **已查證**（SDK README 與 `examples/sync/server_side_tools.py`） |
| 應用 | grok.com／Grok 應用程式 | 自訂指令、Workspaces、Custom Agents、Tasks 等 | **待驗證**：官方頁面在研究環境內無法開啟，僅第三方描述 |
| 應用 | Grok in X | 社群平台內建對話 | 不適用本任務（無法附檔與固定指令） |
| 技能格式 | — | **沒有查證到任何原生 skills／SKILL.md 機制**；agentskills.io 的採用清單中沒有 xAI 產品 | 部分查證（擷取到的 45/50 項中未見） |
| 命名 | 官方頁面標題出現「SpaceXAI」字樣 | 可能為公司更名 | 待驗證 |

## 2. 本專案採用的等效方案

| 情境 | 檔案 | 做法 |
|---|---|---|
| 以 API 自動化、可重現、可排程 | `api-workflow.py` + `requirements.txt` | system prompt + 兩段式呼叫（Markdown 報告 → JSON）；預設**不啟用**任何伺服器端工具 |
| 在自建 harness 中讓模型呼叫確定性評分 | `tool-definitions.json` | 三個客戶端 function-calling 工具定義：`load_input_bundle`、`score_findings`、`request_human_approval` |
| 在 grok.com 對話中使用 | `system-prompt.md` | 貼入自訂指令／Workspace 指令（若存在，待驗證），否則貼在新對話第一則訊息 |

## 3. 能力限制

- 沒有原生 skills，因此「技能」= 系統提示詞 + 工具定義，需由你的程式或對話流程承載。
- 伺服器端工具（`web_search`、`x_search`、`code_execution`）會把資料送往 xAI 端的額外處理流程；本任務不需要上網，**預設關閉**。
- 語言模型不能驗證實際曝險、不執行掃描、不保證防止攻擊（見 task-spec 第 1 節）。
- grok.com 應用的檔案上傳限制、指令字數限制皆待驗證。

## 4. 目錄內容

```
skills/grok/
├── README.md                 本檔
├── system-prompt.md          可直接複製的系統提示詞（與 shared/core-prompt.md 一致）
├── api-workflow.py           xai_sdk 腳本（含 --dry-run、--compat OpenAI 相容端點（待驗證））
├── tool-definitions.json     function-calling 工具定義（客戶端 harness 用）
└── requirements.txt          xai-sdk、pydantic
```

安裝與使用教學見 `docs/guides/grok.md`。
