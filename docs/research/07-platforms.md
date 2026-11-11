---
title: 7. 六個平臺的查證摘要與等效方案
order: 7
summary: 區分「模型」與「承載模型的應用程式或執行框架」，說明各平臺現況、自訂機制、查證狀態與本專案採用的等效方案。
---

> 查證日期 2026-09-09。完整證據檔：`docs/evidence/ai-platform-skills-evidence.md`。ChatGPT 的模型在 2026-10-21 更新，證據檔為 `docs/evidence/openai-gpt-6-models-evidence.md`（當時 developers.openai.com 已可開啟）。Gemini 在 2026-10-22 新增，官方頁面都能開啟，來源見證據檔第 6 節與 `skills/gemini/README.md`。2026-09-09 時研究環境可直接開啟的官方站台僅 platform.claude.com、code.claude.com 與 GitHub；其餘以官方 URL 的搜尋摘錄為「部分查證」，只有第三方資訊者為「待驗證」。2026-11-11 重新查證六個平臺的模型與公開 API 文件（#289）：除了 help.openai.com 與 x.ai 首頁仍回應 403，其餘官方文件都能開啟，下文已依讀到的內容更新。

## 7.1 Agent Skills 開放標準

- 規格（已查證，`agentskills/agentskills` GitHub）：`SKILL.md` + 選用 `scripts/`、`references/`、`assets/`；frontmatter `name`（1–64 字元、小寫與連字號）、`description`（≤ 1024）、選用 `license`、`compatibility`、`metadata`、`allowed-tools`；建議主檔 < 500 行；漸進式載入（啟動只載名稱與描述）。
- 採用清單（**已查證**，2026-11-11：agentskills.io 的 Client Showcase 由 GitHub 的 `docs/snippets/clients.jsx` 產生，共 46 項；先前寫的「宣告 50 項」與這個檔不符）：含 Claude、Claude Code、「ChatGPT & Codex」、Gemini CLI、Cursor、GitHub Copilot、VS Code、OpenClaw、Deep Code 等；**沒有** xAI、Zhipu/Z.ai 的產品，DeepSeek 只有第三方 host。

## 7.2 平臺總表

| 平臺 | 模型（查證時） | 承載應用 | 原生技能機制 | 本專案等效方案 | 狀態 |
|---|---|---|---|---|---|
| ChatGPT（OpenAI） | GPT-6 家族（官方建議從 `gpt-6-astra` 開始，兼顧能力與成本選 `gpt-6.1-sol`，成本敏感選 `gpt-6-luna`；已查證，2026-11-11） | ChatGPT 應用（Custom Instructions／Projects／Custom GPTs）、Codex、Responses API | Codex 支援 Agent Skills（`.agents/skills`）；ChatGPT 應用無 SKILL.md 證據 | Custom GPT 指令 + Knowledge；Project 指令；Codex SKILL.md；API 腳本 | Codex 已查證；應用部分／待驗證 |
| Claude（Anthropic） | Fable 5.2、Opus 5.5、Sonnet 5.5、Haiku 5.5（已查證，2026-11-11；Fable 5.1、Opus 5、Sonnet 5、Haiku 4.5 等列為舊版） | claude.ai、Claude Code、Developer Platform（Skills API）、Agent SDK | **原生 Agent Skills**；六個跨介面欄位 | SKILL.md（單一來源） | 已查證 |
| Grok（xAI） | Grok 4.x（官方建議一般用途用 `grok-4.7`，`grok-4.6` 仍列在模型頁；SDK 範例 `grok-4.6`、`grok-4.20`，模型頁沒有單獨的 `grok-4.20`；已查證，2026-11-11） | xAI API（function calling、structured outputs、伺服器端工具）；grok.com | 無 | system prompt + function calling 工具定義 + API 腳本 | API 已查證；應用待驗證 |
| GLM（Zhipu／Z.ai） | GLM-5／5.1／5.2／5.3、5.3-Flash、5.3-FlashX；另列 GLM-4.6／4.7（已查證，2026-11-11） | Z.ai API Platform／BigModel；chat.z.ai／智譜清言（原文「智谱清言」）；GLM Coding Plan + Claude Code | Z.ai 以 SKILL.md 發布 skill（發布者）；官方 Claude Code 外掛市集 | Claude Code + GLM 後端的 SKILL.md；system prompt；API 腳本 | 模型、API 與 Claude Code 整合已查證；應用待驗證 |
| DeepSeek | `deepseek-v4-pro`、`deepseek-flash`（DeepSeek-V4.1-Flash-1017；已查證，2026-11-11） | DeepSeek API（OpenAI／Anthropic 相容）；chat.deepseek.com；`deepseek-harness` | 無第一方；plugin 架構 | 版本無關的 API 腳本；skills-capable host 的 SKILL.md；system prompt | V4 已查證；應用待驗證 |
| Gemini（Google） | `gemini-3.8-flash`（官方建議新專案使用）、旗艦推理模型 `gemini-4-argon`（已查證，2026-10-22） | Antigravity（App、CLI、IDE）、Gemini CLI、Gemini API（google-genai 的 Interactions API；OpenAI 相容端點 beta）；Gemini 應用待驗證 | **Agent Skills**：Antigravity 與 Gemini CLI 讀工作區的 `.agents/skills/`；Gemini API 沒有 Skills 功能（文件只列給程式助理用的技能 repo）；Gemini 應用的 Skills 未見官方文件 | SKILL.md（附 `validate_inputs.py`）＋ API 腳本 | Antigravity、Gemini CLI、模型與 API 已查證；應用待驗證 |

## 7.3 DeepSeek V4 的查證結論

- 官方 API 公告（`news260424`、`news260813`）與 Models & Pricing 頁（**已查證**，2026-11-11）：V4 Preview 2026-04-24、V4-Pro GA 2026-08-13；現在的模型 ID 是 `deepseek-v4-pro`（DeepSeek-V4-Pro-0813）與 `deepseek-flash`（DeepSeek-V4.1-Flash-1017），舊名 `deepseek-v4-flash` 仍可使用，但對應的模型已退役；1M context、384K 輸出、JSON Output 與 Tool Calls、OpenAI 與 Anthropic 相容介面；`deepseek-chat`／`deepseek-reasoner` 於 2026-07-24 退役。
- GitHub（已查證）：`awesome-deepseek-agent` 以 V4-Pro／V4-Flash 為主要模型；組織內無 V4 程式碼 repo。
- 授權與工具呼叫（**已查證**，2026-11-11）：模型權重以 MIT License 授權（Hugging Face 模型卡）；strict tool calling 是 Beta，要用 `https://api.deepseek.com/beta`，每個 function 都設 `strict: true`。
- **待驗證**：聊天應用的自訂指令／專案（要登入）。
- 因此本專案的 DeepSeek 方案刻意**不依賴特定版本**：只用 OpenAI 相容 chat completions + system prompt + JSON 輸出，模型 ID 由環境變數指定。

## 7.4 設計決策

1. **單一來源**：`skills/shared/task-spec.md` 與 `core-prompt.md` 是所有平臺的規格；平臺檔只處理載入方式。
2. **同一種 SKILL.md 格式跨宿主**：Claude Code、Codex、Antigravity、Gemini CLI、以 GLM／DeepSeek 為後端的 Claude Code 或 OpenClaw，都吃相同格式。
3. **無原生技能的平臺**：Grok、GLM 聊天應用、DeepSeek 聊天應用 → system prompt + API 腳本；所有腳本支援 `--dry-run` 以便在無 API key 時驗證。
4. **資料治理**：GLM 與 DeepSeek 的 API 由中國大陸公司營運，教學中明確提醒資料出境評估；所有示範只用合成資料。
5. **待驗證項目**列入「證據與來源」頁的待驗證清單，附驗證方式。
