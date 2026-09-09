---
title: GLM 平台說明
role: readme
---

# GLM（Zhipu AI / Z.ai）平台說明：先制型曝險分析（PEA）

任務定義、證據要求、評分規則與人工核准邊界一律以 `../shared/task-spec.md` 與 `../shared/core-prompt.md` 為準；本目錄只處理「怎麼把核心指令放進 GLM 的各種承載方式」。

## 1. 模型 vs. 承載應用（查證日期 2026-09-09）

| 層 | 名稱 | 說明 | 查證狀態 |
|---|---|---|---|
| 模型 | GLM-5、5.1、5.2、5.3（744B-A40B）、GLM-5.3-Flash（320B-A18B） | 官方 `zai-org/GLM-5` README；GLM-5.2 具 1M context | **已查證**（GitHub） |
| 模型 | GLM-4.6／4.7 | 只在第三方設定範例出現 | 待驗證 |
| 應用 | **Z.ai API Platform**（docs.z.ai）／**BigModel**（open.bigmodel.cn） | OpenAI 相容端點；function calling 官方頁面未能開啟 | 部分查證 |
| 應用 | **GLM Coding Plan + Claude Code** | Z.ai 官方維護 Claude Code 外掛市集 `zai-org/zai-coding-plugins`；Anthropic 相容端點 `https://api.z.ai/api/anthropic`（第三方引述 docs.z.ai） | 外掛市集**已查證**；端點**部分查證** |
| 應用 | chat.z.ai／智谱清言（chatglm.cn） | 智能体、知識庫、檔案上傳 | **待驗證**（官方站台在研究環境內無法開啟） |
| 應用 | ZCode | 第三方報導的桌面 agentic IDE | 待驗證 |
| 技能格式 | SKILL.md（Agent Skills 開放標準） | Z.ai 在 `zai-org/GLM-5` 內發布 `skills/glm-master-skill/SKILL.md`，使用 `name`、`description`、`metadata` 欄位 → Z.ai 是 skill **發布者**，但未查證其聊天應用能**載入** SKILL.md | 已查證（發布者角色） |

## 2. 本專案採用的等效方案

| 情境 | 檔案 | 做法 |
|---|---|---|
| 在 Claude Code（或 OpenCode／OpenClaw）內以 GLM 為後端 | `claude-code-skill/SKILL.md` + `claude-code-settings.example.json` | 與 Claude 版相同的標準 skill；透過 `ANTHROPIC_BASE_URL` 指向 Z.ai 的 Anthropic 相容端點（部分查證） |
| 以 API 自動化 | `api-workflow.py` + `requirements.txt` | OpenAI 相容端點（預設）或 `--anthropic-compatible`；兩段式呼叫 |
| 在 chat.z.ai／智谱清言 對話中使用 | `system-prompt.md` | 貼入智能体指令（若存在，待驗證）或新對話第一則訊息 |

## 3. 能力限制與治理考量

- GLM 聊天應用是否支援自訂指令、知識庫檔案上限、function calling 細節皆待驗證。
- Z.ai 與 BigModel 的 API 由中國大陸公司營運；企業使用者需依組織的資料出境／資料分類政策評估是否可將資產清冊、弱點與身分資料送出。本目錄的腳本不會傳送 `scope.json` 以外的敏感欄位遮罩，請自行前處理。
- 語言模型不能驗證實際曝險、不執行掃描、不保證防止攻擊。

## 4. 目錄內容

```
skills/glm/
├── README.md                          本檔
├── system-prompt.md                   可直接複製的系統提示詞
├── claude-code-skill/SKILL.md         Agent Skills 標準 skill（GLM 後端標記）
├── claude-code-settings.example.json  Claude Code 使用 GLM 後端的環境變數範例（勿填入真實 token）
├── api-workflow.py                    OpenAI 相容／Anthropic 相容端點腳本（含 --dry-run）
└── requirements.txt                   openai、anthropic
```

安裝與使用教學見 `docs/guides/glm.md`。
