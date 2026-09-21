---
title: DeepSeek 平台說明
role: readme
---

# DeepSeek（V4）平台說明：先制型曝險分析（PEA）

任務定義、證據要求、評分規則與人工核准邊界一律以 `../shared/task-spec.md` 與 `../shared/core-prompt.md` 為準；本目錄只處理「怎麼把核心指令放進 DeepSeek 的承載方式」，並刻意做到**不依賴特定模型版本**。

## 1. DeepSeek V4 的查證狀態（2026-09-09）

| 項目 | 內容 | 狀態 |
|---|---|---|
| V4 Preview | 官方 API 公告頁 `api-docs.deepseek.com/news/news260424/`（2026-04-24）：模型 `deepseek-v4-pro`、`deepseek-v4-flash`；同時提供 OpenAI ChatCompletions 與 Anthropic 介面 | **部分查證**（官方 URL 與搜尋摘要；頁面在研究環境內無法開啟） |
| V4-Pro GA | `api-docs.deepseek.com/news/news260813/`（2026-08-13）：模型 ID 不變；1M context、最大輸出 384K；支援 JSON Output、Tool Calls、Chat Prefix Completion（Beta）、FIM（Beta） | 部分查證 |
| 舊模型名稱 | `deepseek-chat`、`deepseek-reasoner` 於 2026-07-24 退役（官方 change log 摘要） | 部分查證 |
| GitHub 佐證 | `deepseek-ai/awesome-deepseek-agent` 以 "DeepSeek-V4-Pro or DeepSeek-V4-Flash" 為主要模型；`deepseek-ai` 組織**沒有** V4 程式碼 repo（最新為 DeepSeek-V3.2-Exp） | **已查證** |
| Hugging Face 模型卡 | `deepseek-ai/DeepSeek-V4-Pro-0813`（1.6T 總參數、49B 啟用、1M context） | 部分查證；**授權條款待驗證** |
| 嚴格工具呼叫（strict）| 無證據 | 待驗證 |
| 聊天應用自訂指令／專案 | chat.deepseek.com 未查證到原生功能 | 待驗證 |
| 技能機制 | 沒有第一方 skills；`deepseek-harness`（dsh）為 plugin 架構、developer preview | 已查證 |

## 2. 版本無關的設計

本目錄所有檔案只依賴三件事：**OpenAI 相容 chat completions 端點、system prompt、JSON 輸出**。模型 ID 由環境變數 `DEEPSEEK_MODEL` 指定；若日後模型名稱變動，只需改環境變數，不需改程式碼或提示詞。

## 3. 本專案採用的等效方案

| 情境 | 檔案 | 做法 |
|---|---|---|
| 以 API 自動化 | `api-workflow.py` + `requirements.txt` | 兩段式：Markdown 報告 → `response_format={"type":"json_object"}` 的 JSON |
| 在 skills-capable host 內 | `preemptive-exposure-analysis/SKILL.md` | 放入 OpenClaw、Deep Code（皆列於 agentskills.io 支援清單）或 Claude Code（透過 Anthropic 相容介面，設定方式待驗證） |
| 在 chat.deepseek.com 對話中 | `system-prompt.md` | 貼在新對話第一則訊息（無原生自訂指令可用） |

## 4. 能力限制與治理考量

- DeepSeek API 由中國大陸公司營運；企業使用者需依資料出境與資料分類政策評估是否可送出資產、弱點與身分資料。
- 授權條款、strict tool calling、聊天應用功能皆待驗證；請以 api-docs.deepseek.com 為準。
- 語言模型不能驗證實際曝險、不執行掃描、不保證防止攻擊。

## 5. 目錄內容

```
skills/deepseek/
├── README.md              本檔
├── system-prompt.md       可直接複製的系統提示詞
├── preemptive-exposure-analysis/SKILL.md    Agent Skills 標準 skill（供 skills-capable host）
├── api-workflow.py        OpenAI 相容端點腳本（含 --dry-run；版本無關）
└── requirements.txt       openai
```

安裝與使用教學見 `docs/guides/deepseek.md`。
