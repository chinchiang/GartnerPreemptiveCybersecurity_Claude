---
title: ChatGPT 平台說明
role: readme
---

# ChatGPT（OpenAI）平台說明：先制型曝險分析（PEA）

本目錄提供在 OpenAI 三種承載層上執行「先制型曝險分析」的檔案。任務定義、證據要求、評分規則與人工核准邊界一律以 `../shared/task-spec.md` 與 `../shared/core-prompt.md` 為準；本目錄的檔案只處理「怎麼把核心指令放進 ChatGPT／Codex／API」。

## 1. 先分清楚：模型 vs. 承載應用

| 層 | 名稱 | 說明 | 查證狀態（依 `docs/evidence/ai-platform-skills-evidence.md`，2026-09-09） |
|---|---|---|---|
| 模型 | GPT-5.x 系列 | 官方 `openai/openai-python` README 範例以 `gpt-5.5` 為主 | VERIFIED（GitHub README）；ChatGPT 選單內的模型顯示名稱 UNVERIFIED |
| 應用 | **ChatGPT app** | Custom Instructions（全域偏好）、Projects（指令 + 檔案的工作容器）、Custom GPTs（可分享的「指令 + Knowledge + Actions」包） | PARTIALLY VERIFIED（官方說明頁存在但無法抓取）；字數／檔案數上限 UNVERIFIED |
| 應用 | **Codex**（CLI／IDE／桌面／雲端） | 支援 Agent Skills 開放標準；從 `.agents/skills`（repo 層）與 `$HOME/.agents/skills`（使用者層）讀取 `SKILL.md`；`$skill-name` 叫用 | Agent Skills 標準與 `openai/skills`、`openai/plugins` repo：VERIFIED；路徑細節：PARTIALLY VERIFIED |
| 應用 | **OpenAI API（Responses API）** | `client.responses.create(model=..., input=...)`，官方 SDK 建議優先於 Chat Completions | VERIFIED（SDK README） |

沒有證據顯示 ChatGPT 聊天應用（非 Codex）能直接讀取 `SKILL.md`；因此聊天應用一律以「貼入指令 + 上傳 Knowledge 檔案」的方式承載本任務。

## 2. 哪個情境用哪個檔案

| 你的情境 | 使用檔案 | 做法摘要 |
|---|---|---|
| 想給團隊一個可分享、固定行為的「分析助理」 | `custom-gpt-instructions.md` | 建立 Custom GPT，貼入 Instructions，上傳 Knowledge 檔案，Actions 保持停用 |
| 自己在 ChatGPT 裡反覆做分析，且要附上組織的檔案 | `project-instructions.md` | 建立 Project，貼入較短指令，把輸入檔加入專案 |
| 在終端機／IDE 內以 Codex 針對資料夾內的 CSV/JSON 產生報告 | `codex-skill/SKILL.md` | 複製到 `.agents/skills/preemptive-exposure-analysis/`，以 `$preemptive-exposure-analysis` 叫用 |
| 要自動化、可重現、可納入排程或 CI | `api-workflow.py` + `requirements.txt` | 設定 `OPENAI_API_KEY`，執行腳本；`--dry-run` 可離線檢查提示詞 |

## 3. 能力限制（三個承載層共通）

- 語言模型只做資料整合、規則化推理、假設生成與文件撰寫；**不能驗證實際曝險、不能執行掃描、不能保證防止攻擊**（task-spec 第 1 節）。
- Custom GPT 的 Actions 預設**不啟用**；本任務不需要瀏覽網頁，也不需要對外連線。啟用任何 Action 都等於把資料送往第三方端點，需另行核准。
- Codex skill 只在本機讀寫檔案並產出報告；不呼叫掃描器、不執行任何主動測試指令，即使使用者要求也只「提案」。
- API 腳本把所有輸入檔案以文字送到 OpenAI API；資料流向與保存政策以你的 OpenAI 帳戶（企業版 DPA 或 API 資料政策）為準。

## 4. 查證狀態總覽

| 項目 | 狀態 | 依據 |
|---|---|---|
| Responses API 呼叫方式與 `gpt-5.5` 模型 ID | VERIFIED | https://github.com/openai/openai-python |
| Codex 支援 Agent Skills；`openai/skills` 已標示 deprecated 並改指向 `openai/plugins` | VERIFIED | https://github.com/openai/skills 、https://github.com/openai/plugins |
| Codex 讀取 `.agents/skills` 與 `$HOME/.agents/skills` | PARTIALLY VERIFIED | https://developers.openai.com/codex/skills（搜尋摘要） |
| Custom GPT：每個 GPT 最多 20 個檔案、單檔 512 MB／2M tokens | PARTIALLY VERIFIED | https://help.openai.com/en/articles/8555545-file-uploads-faq（搜尋摘要） |
| Projects 檔案數上限、指令字數上限 | UNVERIFIED | 僅第三方來源 |
| ChatGPT 選單內的模型名稱 | UNVERIFIED | 僅第三方來源；請以 platform.openai.com 與 ChatGPT 介面為準 |

介面名稱（按鈕、欄位標籤）以官方介面為準；本目錄若寫到 UI 名稱而未查證，會標示「待驗證」。

## 5. 目錄內容

```
skills/chatgpt/
├── README.md                     本檔
├── custom-gpt-instructions.md    Custom GPT 的 Instructions 全文 + 名稱／描述／開場提示／Knowledge 清單
├── project-instructions.md       ChatGPT Projects 的短版指令與附檔方式
├── codex-skill/
│   └── SKILL.md                  Agent Skills 標準格式的 Codex skill
├── api-workflow.py               Responses API 腳本（含 --dry-run）
└── requirements.txt              openai>=1.0
```

安裝與使用教學見 `docs/guides/chatgpt.md`。
