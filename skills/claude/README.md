---
title: Claude 平台說明
role: readme
---

# Claude 平台說明

## 模型 vs. 承載應用

| 層級 | 內容 | 查證狀態（2026-09-09） |
|---|---|---|
| 模型 | Claude Fable 5.1（`claude-fable-5-1`）、Claude Opus 5（`claude-opus-5`）、Claude Sonnet 5（`claude-sonnet-5`）、Claude Haiku 4.5（`claude-haiku-4-5-20251001`）；5 系列 1M context | 已查證（platform.claude.com 模型總覽） |
| 承載應用 | claude.ai（網頁／桌面／行動）、Claude Code（終端、IDE、桌面、瀏覽器）、Claude Developer Platform（Messages API + Skills API `/v1/skills`）、Claude Agent SDK | 已查證 |
| 原生技能機制 | **Agent Skills**（`SKILL.md` + 選用 `scripts/`、`references/`、`assets/`），遵循 agentskills.io 開放標準 | 已查證 |
| 技能可用位置 | claude.ai：Settings > Features 上傳 zip（Pro/Max/Team/Enterprise，需啟用 code execution，技能為個人所有）；API：`/v1/skills` 上傳，搭配 code execution 工具，工作區共用；Claude Code：`~/.claude/skills/`（個人）或 `.claude/skills/`（專案）；Agent SDK：`settingSources` 載入 | 已查證 |
| 跨介面限制 | 「Custom Skills do not sync across surfaces」；上傳到 claude.ai／API 時只有 `name`、`description`、`license`、`compatibility`、`metadata`、`allowed-tools` 六個欄位有效 | 已查證 |
| 專案（Projects） | claude.ai Projects 可設定專案指令與知識檔 | 部分查證（支援文章在沙箱內無法開啟） |

## 本目錄檔案

```
skills/claude/
├── README.md                          ← 本檔
└── preemptive-exposure-analysis/      ← 可直接使用的 Agent Skill
    ├── SKILL.md                       ← 主指令（僅使用六個跨介面相容欄位）
    ├── references/
    │   ├── scoring-rules.md           ← 示範評分規則、路徑可行性、指標、缺漏替代
    │   ├── acceptance.md              ← 驗收清單
    │   ├── input-schema.json          ← 與 skills/shared 相同
    │   └── output-schema.json
    └── scripts/
        └── validate_inputs.py         ← 輸入結構檢查（純標準函式庫）
```

## 三種使用方式

1. **Claude Code**：把 `preemptive-exposure-analysis/` 複製到 `.claude/skills/`（專案）或 `~/.claude/skills/`（個人），輸入 `/preemptive-exposure-analysis examples/synthetic-org`。
2. **claude.ai**：把 `preemptive-exposure-analysis/` 壓成 zip，在 Settings > Features 上傳；在對話中附上資料檔並要求進行先制型曝險分析。
3. **API**：以 `POST /v1/skills` 上傳 zip，在 Messages API 的 `container.skills` 引用 `skill_id`，並啟用 code execution 工具。

詳細步驟、驗收與 FAQ 見網站「安裝與使用教學 → Claude」或 `docs/guides/claude.md`。

## 能力限制

- Skill 只是指令與參考檔；Claude 不會主動連到掃描器或情資平台。需要即時資料時，透過 MCP 連接器或由使用者上傳。
- 不執行任何主動測試；驗證計畫只是提案。
- 同一個 skill 目錄可同時用於 Codex（`.agents/skills/`）與以 Claude Code 為宿主的 GLM／DeepSeek 後端，因為使用相同的開放標準。
