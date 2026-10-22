---
title: Gemini 平臺說明
role: readme
---

# Gemini（Google）平臺說明：先制型曝險分析（PEA）

任務定義、證據要求、評分規則與人工核准邊界一律以 `../shared/task-spec.md` 與 `../shared/core-prompt.md` 為準；本目錄只處理「怎麼把核心指令放進 Gemini 的承載方式」。

## 1. 查證狀態（2026-10-22）

| 項目 | 內容 | 狀態 |
|---|---|---|
| Antigravity 的 Agent Skills | `antigravity.google/docs/skills`（頁面沒有日期）：App、CLI、IDE 都支援 SKILL.md；工作區 `<workspace>/.agents/skills/<skill>/`（相容舊的 `.agent/skills`），全域 App／IDE `~/.gemini/config/skills/`、CLI `~/.gemini/antigravity-cli/skills/`；frontmatter `name` 選填、`description` 必填；App 可打 `/<skill-name>` 手動呼叫 | **已查證** |
| Gemini CLI 的 Agent Skills | `geminicli.com/docs/cli/skills/`（Last updated 2026-04-30）：工作區 `.gemini/skills/` 或 `.agents/skills/`（同層 `.agents/skills/` 優先），使用者 `~/.gemini/skills/` 或 `~/.agents/skills/`；`gemini skills install <git-url\|路徑> [--scope user\|workspace] [--path <子目錄>]`；模型呼叫 `activate_skill`、使用者確認後才載入 | **已查證** |
| Gemini CLI 與 Antigravity CLI | 同一頁的公告：免費方案與 Google One 使用者的 Gemini CLI 已於 2026-06-18 由 Antigravity CLI 取代；Gemini CLI 未針對 Gemini 4 Argon 最佳化 | 已查證 |
| Gemini 應用、Gemini API 的 Skills | 沒找到官方文件 | 待驗證 |
| 模型 | `ai.google.dev/gemini-api/docs/models`（Last updated 2026-10-21）：新專案建議 `gemini-3.8-flash`（或 3.5 Flash-Lite）；旗艦推理模型 `gemini-4-argon` | 已查證 |
| google-genai SDK | `ai.google.dev/gemini-api/docs/libraries`（2026-10-15）：套件 `google-genai`；舊的 `google-generativeai` 自 2025-11-30 起棄用。`docs/text-generation`（2026-10-13）：`client.interactions.create(model, input, system_instruction, generation_config)`，多輪用 `previous_interaction_id`；Gemini 4 與 3.6 以上的模型忽略自訂的 temperature。`googleapis/python-genai` README：client 自動讀 `GEMINI_API_KEY` 或 `GOOGLE_API_KEY`，兩者都有時 `GOOGLE_API_KEY` 優先 | 已查證；Interactions 從哪一版開始，SDK README 沒寫（待驗證） |
| JSON 輸出 | `docs/structured-output`（2026-10-21）：`response_format` 設 `type: "text"`、`mime_type: "application/json"`，schema 放在 `schema` 欄位；只支援 JSON Schema 子集 | 已查證；**不帶 schema 是否可以，文件沒寫（待驗證）** |
| 延續對話時的 system_instruction | 帶 `previous_interaction_id` 時會不會保留第 1 段的 `system_instruction`，文件沒寫 | 待驗證（腳本兩段都帶） |
| OpenAI 相容端點 | `docs/openai`（2026-10-14）：`https://generativelanguage.googleapis.com/v1beta/openai/`，官方標示 beta；`response_format={"type":"json_object"}` 文件沒寫 | 端點已查證；json_object 待驗證 |

## 2. 本專案採用的等效方案

| 情境 | 檔案 | 做法 |
|---|---|---|
| 在 Antigravity 或 Gemini CLI 內 | `preemptive-exposure-analysis/`（SKILL.md、`references/`、`scripts/`） | 整個資料夾放進工作區的 `.agents/skills/`，或用 `gemini skills install` 安裝；資料夾可單獨運作，`scripts/validate_inputs.py` 先檢查輸入與 scope |
| 以 API 自動化 | `api-workflow.py` + `requirements.txt` | 兩段式：Markdown 報告 → 以 `previous_interaction_id` 延續、`response_format` 只要求 JSON（被拒絕時改以提示詞要求純 JSON 重試一次）；`--compat` 改走 OpenAI 相容端點 |

`api-workflow.py` 的金鑰只認 `GEMINI_API_KEY`，並明確傳給 client：google-genai 沒拿到金鑰時會自己讀 `GOOGLE_API_KEY`，腳本不讓它默默換掉。

## 3. 能力限制與治理考量

- 原生路徑以 `previous_interaction_id` 延續對話：第 1 段的對話狀態存在 Google 的伺服器上。企業使用者要依資料分類政策評估資產、弱點與身分資料的送出與保存。
- 語言模型不能驗證實際曝險、不執行掃描、不保證防止攻擊；技能與腳本都不啟用任何工具。

## 4. 目錄內容

```
skills/gemini/
├── README.md                          本檔
├── preemptive-exposure-analysis/      Agent Skill（Antigravity、Gemini CLI）
│   ├── SKILL.md                       主指令（手寫；第 0 節的規則說明行由建置寫入）
│   ├── references/                    建置產生的複本：scoring-rules.md、acceptance.md、input-schema.json、output-schema.json
│   └── scripts/                       建置產生的複本：validate_inputs.py、analysis_workflow.py（見 docs/adr/0006）
├── api-workflow.py                    google-genai 的 Interactions API（預設）與 --compat（含 --dry-run）
└── requirements.txt                   google-genai、openai
```

安裝與使用教學見 `docs/guides/gemini.md`。
