---
title: GLM 安裝與使用教學
order: 50
platform: glm
---

## 1. 用途、適用情境及能力限制

**用途**：以 GLM 模型（Zhipu AI / Z.ai）執行「先制型曝險分析」，三種承載方式：Claude Code + GLM 後端、API 腳本、聊天應用。

**模型與承載應用**（查證日期 2026-09-09）：

| 項目 | 狀態 |
|---|---|
| 模型 GLM-5／5.1／5.2／5.3（744B-A40B）、GLM-5.3-Flash | 已查證（`zai-org/GLM-5` README） |
| Z.ai 官方 Claude Code 外掛市集 `zai-org/zai-coding-plugins` | 已查證 |
| Anthropic 相容端點 `https://api.z.ai/api/anthropic`（GLM Coding Plan） | 部分查證（第三方引述 docs.z.ai） |
| Z.ai 以 SKILL.md 格式發布 `glm-master-skill` | 已查證（發布者角色） |
| chat.z.ai／智譜清言 的智能體、知識庫 | **待驗證** |
| Z.ai API Platform／BigModel base URL、function calling 細節 | 部分查證／待驗證 |

**能力限制**：聊天應用能否載入 SKILL.md 未查證；API 細節需以 docs.z.ai／open.bigmodel.cn 為準；模型不能驗證實際曝險、不執行掃描、不保證防止攻擊。

## 2. 完整檔案清單與取得方式

| 檔案 | 用途 |
|---|---|
| `skills/glm/README.md` | 平台說明與查證狀態 |
| `skills/glm/preemptive-exposure-analysis/SKILL.md` | Agent Skills 標準 skill（與 Claude 版等效；結構不同：內嵌核心提示與評分規則，並附 `references/`；標記 GLM 後端） |
| `skills/glm/claude-code-settings.example.json` | Claude Code 使用 GLM 後端的環境變數範例 |
| `skills/glm/system-prompt.md` | 可直接複製的系統提示詞 |
| `skills/glm/api-workflow.py`、`requirements.txt` | OpenAI 相容／Anthropic 相容端點腳本（含 `--dry-run`） |
| `skills/shared/*`、`examples/synthetic-org/*` | 共用規格與合成資料 |

取得：網站「Skills 專區 → GLM」或 `downloads/skills-glm.zip`。

## 3. 輸入格式、必填欄位與範例資料

同共用規格；欄位定義見 `skills/shared/input-schema.json`；範例 `examples/synthetic-org/`。

## 4. 執行步驟、證據要求及缺少資料時的處理方式

S1–S8；每區塊帶 `confidence`、`basis`、`missing_inputs`、`requires_human`；缺 scope 停止；缺 topology 跳過 S4；其他依替代規則標示。

## 5. 輸出格式與完整範例

Markdown 報告 + JSON。縮短版合成範例與 Claude 教學第 5 節相同（P1：`vpn-gw-01 / SYN-2026-0101` 86.0 分；路徑 `internet → vpn-gw-01 → ad-dc-01 → erp-db-01` 可行性 6.4；驗證計畫標「尚未授權主動測試」；結尾聲明）。`meta.generated_by` 填「GLM via <承載方式>」。

## 6. 必要工具、連線及權限

| 承載方式 | 需要 | 資料流向 |
|---|---|---|
| Claude Code + GLM 後端 | Claude Code；GLM Coding Plan token（環境變數 `ANTHROPIC_AUTH_TOKEN`） | 資料送至 Z.ai（api.z.ai） |
| API 腳本 | `GLM_API_KEY`；`pip install openai`（或 `anthropic`） | 資料送至 Z.ai 或 BigModel |
| 聊天應用 | chat.z.ai／智譜清言帳號 | 資料上傳至 Z.ai／智譜 |

**治理考量**：Z.ai 與 BigModel 由中國大陸公司營運。企業使用者需依組織的資料出境、資料分類與供應商評估政策，決定是否可將資產清冊、弱點、身分資料送出；示範請只用合成資料。

## 7. 逐步安裝或設定方式

### A. 聊天應用（chat.z.ai／智譜清言，功能待驗證）

1. 若有「智能體／自訂助理」：建立一個，指令欄貼入 `system-prompt.md` 的提示詞區塊；知識庫上傳 `task-spec.md` 與資料檔。
2. 若沒有：新對話第一則貼入提示詞，再附上 9 個資料檔內容。

### B. Claude Code + GLM 後端（部分查證）

```bash
git clone https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude.git
cd GartnerPreemptiveCybersecurity_Claude
mkdir -p .claude/skills && cp -r skills/glm/preemptive-exposure-analysis .claude/skills/preemptive-exposure-analysis
export ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic   # 以 docs.z.ai 為準
export ANTHROPIC_AUTH_TOKEN=...                             # 勿寫入檔案
claude
```

或把 `claude-code-settings.example.json` 的 `env` 區段合併到 `.claude/settings.local.json`（**該檔勿提交**）。在 Claude Code 中輸入 `/preemptive-exposure-analysis examples/synthetic-org`。

### C. API 腳本

```bash
pip install -r skills/glm/requirements.txt
python3 skills/glm/api-workflow.py --dry-run
export GLM_API_KEY=...                                      # 勿寫入檔案
export GLM_BASE_URL=https://api.z.ai/api/paas/v4            # 以官方文件確認；中國大陸改 open.bigmodel.cn
export GLM_MODEL=glm-5.3                                    # 以官方模型列表確認
python3 skills/glm/api-workflow.py                          # 或 --anthropic-compatible
```

輸出：`output/glm-report.md`、`output/glm-output.json`。

## 8. 使用範例、預期結果及常見問題

**FAQ**

1. *base URL 或模型 ID 錯誤？* 以 docs.z.ai／open.bigmodel.cn 的最新列表為準，改環境變數即可。
2. *Claude Code 接 GLM 後 skill 沒觸發？* skill 與後端無關；確認目錄與 `name`；用 `/` 指令直接呼叫。
3. *GLM Coding Plan 配額只限指定工具？* 第三方引述的條款指出配額僅供 Z.ai 認可的 coding 工具使用；請以官方條款為準。
4. *JSON 不合 schema？* 腳本兩段式呼叫；若仍失敗，原始回應存於 `output/glm-output.raw.txt`。
5. *可以用 GLM-5.3-Flash 節省成本嗎？* 可，改 `GLM_MODEL`；但請重跑驗收確認分級一致。

## 9. 簡單、可重現的驗收方式

依 `task-spec.md` 第 7 節 7 項。第 6、7 項用旗標模擬缺漏：

```bash
python3 skills/glm/api-workflow.py --dry-run --exclude threat_intel   # 第 6 項
python3 skills/glm/api-workflow.py --dry-run --exclude scope          # 第 7 項：立即中止並列出必填欄位
```

## 10. 機敏資料處理與人工核准邊界

- 資料出境評估為前提；示範只用合成資料。
- token／API key 只放環境變數或未提交的 `settings.local.json`。
- 對外掃描、主動驗證、正式環境變更只產生提案，執行需人工書面授權。
- 管理摘要預設遮罩識別資訊。
