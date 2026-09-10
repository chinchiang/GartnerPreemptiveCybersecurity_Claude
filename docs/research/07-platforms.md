---
title: 7. 五個平台的查證摘要與等效方案
order: 7
summary: 區分「模型」與「承載模型的應用程式或執行框架」，說明各平台現況、自訂機制、查證狀態與本專案採用的等效方案。
---

> 查證日期 2026-09-09。完整證據檔：`docs/evidence/ai-platform-skills-evidence.md`。研究環境可直接開啟的官方站台僅 platform.claude.com、code.claude.com 與 GitHub；其餘以官方 URL 的搜尋摘錄為「部分查證」，只有第三方資訊者為「待驗證」。

## 7.1 Agent Skills 開放標準

- 規格（已查證，`agentskills/agentskills` GitHub）：`SKILL.md` + 選用 `scripts/`、`references/`、`assets/`；frontmatter `name`（1–64 字元、小寫與連字號）、`description`（≤ 1024）、選用 `license`、`compatibility`、`metadata`、`allowed-tools`；建議主檔 < 500 行；漸進式載入（啟動只載名稱與描述）。
- 採用清單（已查證，官方站台資料檔，50 項）：含 Claude、Claude Code、「ChatGPT & Codex (OpenAI)」、Gemini CLI、Cursor、GitHub Copilot、VS Code、OpenClaw、Deep Code（DeepSeek terminal assistant）等；**沒有** xAI、Zhipu/Z.ai 產品，DeepSeek 只有第三方 host。

## 7.2 平台總表

| 平台 | 模型（查證時） | 承載應用 | 原生技能機制 | 本專案等效方案 | 狀態 |
|---|---|---|---|---|---|
| ChatGPT（OpenAI） | GPT-5.x（SDK 範例 `gpt-5.5`；已查證） | ChatGPT 應用（Custom Instructions／Projects／Custom GPTs）、Codex、Responses API | Codex 支援 Agent Skills（`.agents/skills`）；ChatGPT 應用無 SKILL.md 證據 | Custom GPT 指令 + Knowledge；Project 指令；Codex SKILL.md；API 腳本 | Codex 已查證／部分；應用部分／待驗證 |
| Claude（Anthropic） | Fable 5.1、Opus 5、Sonnet 5、Haiku 4.5（已查證） | claude.ai、Claude Code、Developer Platform（Skills API）、Agent SDK | **原生 Agent Skills**；六個跨介面欄位 | SKILL.md（單一來源） | 已查證 |
| Grok（xAI） | Grok 4.x（SDK 範例 `grok-4.6`、`grok-4.20`；已查證） | xAI API（function calling、structured outputs、伺服器端工具）；grok.com | 無 | system prompt + function calling 工具定義 + API 腳本 | API 已查證；應用待驗證 |
| GLM（Zhipu／Z.ai） | GLM-5／5.1／5.2／5.3、5.3-Flash（已查證） | Z.ai API Platform／BigModel；chat.z.ai／智谱清言；GLM Coding Plan + Claude Code | Z.ai 以 SKILL.md 發布 skill（發布者）；官方 Claude Code 外掛市集 | Claude Code + GLM 後端的 SKILL.md；system prompt；API 腳本 | 模型與 Claude Code 整合已查證；應用待驗證 |
| DeepSeek | V4-Pro／V4-Flash（官方公告摘錄 + GitHub 佐證；部分查證） | DeepSeek API（OpenAI／Anthropic 相容）；chat.deepseek.com；`deepseek-harness` | 無第一方；plugin 架構 | 版本無關的 API 腳本；skills-capable host 的 SKILL.md；system prompt | V4 部分查證；應用待驗證 |

## 7.3 DeepSeek V4 的查證結論

- 官方 API 公告 URL（`news260424`、`news260813`）與搜尋摘錄指出：V4 Preview 2026-04-24、V4-Pro GA 2026-08-13、模型 ID `deepseek-v4-pro`／`deepseek-v4-flash`、1M context、384K 輸出、JSON Output 與 Tool Calls、OpenAI 與 Anthropic 相容介面；`deepseek-chat`／`deepseek-reasoner` 於 2026-07-24 退役。
- GitHub（已查證）：`awesome-deepseek-agent` 以 V4-Pro／V4-Flash 為主要模型；組織內無 V4 程式碼 repo。
- **待驗證**：授權條款、strict tool calling、聊天應用的自訂指令／專案。
- 因此本專案的 DeepSeek 方案刻意**不依賴特定版本**：只用 OpenAI 相容 chat completions + system prompt + JSON 輸出，模型 ID 由環境變數指定。

## 7.4 設計決策

1. **單一來源**：`skills/shared/task-spec.md` 與 `core-prompt.md` 是所有平台的規格；平台檔只處理載入方式。
2. **同一份 SKILL.md 跨三個宿主**：Claude Code、Codex、以 GLM／DeepSeek 為後端的 Claude Code 或 OpenClaw，都吃相同格式。
3. **無原生技能的平台**：Grok、GLM 聊天應用、DeepSeek 聊天應用 → system prompt + API 腳本；所有腳本支援 `--dry-run` 以便在無 API key 時驗證。
4. **資料治理**：GLM 與 DeepSeek 的 API 由中國大陸公司營運，教學中明確提醒資料出境評估；所有示範只用合成資料。
5. **待驗證項目**列入「證據與來源」頁的待驗證清單，附驗證方式。
