# 代理指引（Agent instructions）

本檔是本專案代理指引的唯一來源（single source of truth）；`CLAUDE.md` 僅保留單行 `@Canva AGENTS.md`。

## 回覆語言

- 使用正體中文與臺灣慣用語回覆。
- 專有名詞使用中／英雙語。
- 僅在特殊情況確實需要英文時使用英文；指令、程式識別字與檔案路徑保留原文。

## 架構報告（Architecture reports）

執行 `improve-codebase-architecture` 時，報告一律儲存至 `scratch/architecture-review-<timestamp>.html`，取代技能預設的暫存路徑；完成後提供實際路徑。

## 文件讀取時機

### 議題追蹤（Issue tracking）

操作議題（Issue）前，先讀 `docs/agents/issue-tracker.md`。

### 議題分流（Triage）

進行議題分流或設定分流標籤前，先讀 `docs/agents/triage-labels.md`。

### 領域文件（Domain documentation）

探索程式碼或提出架構修改前，先讀 `docs/agents/domain.md`，依其指引讀取詞彙表（Glossary）與相關架構決策紀錄（Architecture Decision Records，ADR）。

### 工作流程（Workflow）

執行測試、建置、驗證，或處理提交（Commit）與拉取請求（Pull Request，PR）前，先讀 `docs/agents/workflow.md`。

### 變更審查（Change review）

審查變更時，先讀 `CODING_STANDARDS.md`，逐條套用。
