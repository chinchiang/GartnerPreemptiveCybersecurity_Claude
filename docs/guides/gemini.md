---
title: Gemini 安裝與使用教學
order: 70
platform: gemini
---

## 1. 用途、適用情境及能力限制

**用途**：在 Google 的 Antigravity（App、CLI、IDE）或 Gemini CLI 裡，以 Agent Skill 執行「先制型曝險分析」；或以 API 腳本呼叫 Gemini 模型自動產出報告與 JSON。

**模型與承載應用**（查證日期 2026-10-22，來源與細節見 `skills/gemini/README.md` 第 1 節）：

| 項目 | 狀態 |
|---|---|
| Antigravity 支援 Agent Skills（工作區 `.agents/skills/`） | 已查證 |
| Gemini CLI 支援 Agent Skills（工作區 `.gemini/skills/` 或 `.agents/skills/`） | 已查證 |
| 免費方案與 Google One 使用者的 Gemini CLI，2026-06-18 起由 Antigravity CLI 取代 | 已查證 |
| 模型：新專案建議 `gemini-3.8-flash`；旗艦推理模型 `gemini-4-argon` | 已查證 |
| google-genai SDK 的 Interactions API、`previous_interaction_id`、JSON 輸出的 `response_format` | 已查證 |
| 不帶 schema 的 JSON 模式、延續對話時是否保留 `system_instruction` | 待驗證 |
| OpenAI 相容端點（beta）的 `json_object` | 待驗證 |
| Gemini 應用（gemini.google.com）、Gemini API 的 Skills | 待驗證（沒找到官方文件） |

**能力限制**：模型不能驗證實際曝險、不執行掃描、不保證防止攻擊。技能與腳本都不啟用任何工具。

## 2. 完整檔案清單與取得方式

| 檔案 | 用途 |
|---|---|
| `skills/gemini/README.md` | 平臺說明、查證狀態與來源 |
| `skills/gemini/preemptive-exposure-analysis/SKILL.md` | Agent Skill 主指令（Antigravity、Gemini CLI） |
| `skills/gemini/preemptive-exposure-analysis/references/` | 評分規則、驗收清單、輸入與輸出的 schema（建置產生的複本） |
| `skills/gemini/preemptive-exposure-analysis/scripts/` | `validate_inputs.py`（腳本預檢與授權範圍守門）與它使用的分析工作流程核心（建置產生的複本，見 `docs/adr/0006`） |
| `skills/gemini/api-workflow.py`、`requirements.txt` | API 腳本（含 `--dry-run`）；流程由 `skills/shared/analysis_workflow.py`（分析工作流程核心）負責，本檔只是 Gemini 的模型 adapter |
| `skills/shared/*`、`examples/synthetic-org/*` | 共用規格與合成資料 |

取得：網站「Skills 專區 → Gemini」或 `downloads/skills-gemini.zip`。

## 3. 輸入格式、必填欄位與合成資料

同共用規格；欄位見 `skills/shared/input-schema.json`；範例 `examples/synthetic-org/`。

## 4. 執行步驟、證據要求及缺少資料時的處理方式

S1–S8；每區塊帶 `confidence`、`basis`、`missing_inputs`、`requires_human`；缺 scope 停止；缺 topology 跳過 S4；其他依替代規則標示。技能在分析前先執行 `scripts/validate_inputs.py`：scope 有問題時（結束碼 3）照它印出的訊息停止。

## 5. 輸出格式與完整範例

Markdown 報告 + JSON。縮短版合成範例與 Claude 教學第 5 節相同（P1：`vpn-gw-01 / SYN-2026-0101`；路徑 `internet → vpn-gw-01 → ad-dc-01 → erp-db-01`；驗證計畫標「尚未授權主動測試」；結尾聲明）。用 API 腳本時，`meta.generated_by` 會自動填成「Gemini API（google-genai）/ <模型 ID> / skills/gemini/api-workflow.py」；`--compat` 時括號裡是「OpenAI 相容端點」。

## 6. 必要工具、連線及權限

| 承載方式 | 需要 | 資料流向 |
|---|---|---|
| Antigravity（App、CLI、IDE） | Google 帳號；技能讀檔、執行 `python3`（`validate_inputs.py` 只用標準函式庫） | 依 Antigravity 的設定送至 Gemini |
| Gemini CLI | Google 帳號或 API 金鑰；同上 | 依 Gemini CLI 的設定送至 Gemini |
| API 腳本 | `GEMINI_API_KEY`；`pip install -r skills/gemini/requirements.txt`（google-genai、openai） | 資料送至 generativelanguage.googleapis.com |

## 7. 逐步安裝或設定方式

### A. Antigravity（App、CLI、IDE）

1. 把 `skills/gemini/preemptive-exposure-analysis/` 整個資料夾複製到工作區的 `.agents/skills/preemptive-exposure-analysis/`。要給所有工作區用時，改放全域路徑：App 與 IDE 是 `~/.gemini/config/skills/`，CLI 是 `~/.gemini/antigravity-cli/skills/`。
2. 把資料放在工作區裡，例如 `examples/synthetic-org/`。
3. 對話開始時，代理人會看到技能的名稱與說明，提到曝險分析時自動讀取 SKILL.md；在 App 也可以直接打 `/preemptive-exposure-analysis` 手動呼叫。

### B. Gemini CLI

1. 安裝到工作區（`--path` 指定 repo 裡的子目錄；`--scope` 預設是 `user`）：

   ```bash
   gemini skills install https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude.git \
     --path skills/gemini/preemptive-exposure-analysis --scope workspace
   ```

   或把資料夾直接複製到工作區的 `.agents/skills/`（也認 `.gemini/skills/`，同一層 `.agents/skills/` 優先）。
2. 在工作階段裡用 `/skills list` 確認技能已載入；剛複製的話先 `/skills reload`。
3. 提到曝險分析時，模型會呼叫 `activate_skill`，你確認之後才載入 SKILL.md。

### C. API 腳本

```bash
pip install -r skills/gemini/requirements.txt
python3 skills/gemini/api-workflow.py --dry-run
export GEMINI_API_KEY=...                        # 勿寫入檔案；腳本只認這個，不讀 GOOGLE_API_KEY
export GEMINI_MODEL=gemini-3.8-flash             # 預設值；需要更強的推理時改 gemini-4-argon
python3 skills/gemini/api-workflow.py            # google-genai 的 Interactions API
python3 skills/gemini/api-workflow.py --compat   # 改走 OpenAI 相容端點（beta）
```

輸出：`output/gemini-report.md`、`output/gemini-output.json`（JSON 解析、輸出 schema 驗證失敗或內容不一致時另存 `output/gemini-output.raw.txt`）。

結束碼：0 成功；1 輸入、授權範圍、環境或 API 錯誤；4 JSON 解析、輸出 schema 驗證失敗或內容不一致。授權範圍不合格時，在呼叫 API 之前中止。資訊訊息（筆數、缺漏、腳本預檢結果）印到 stderr；`--dry-run` 把 system 與兩段 user 提示詞完整印到 stdout，不寫任何檔案。

## 8. 使用範例、預期結果及常見問題

**FAQ**

1. *JSON 模式被拒絕？* 不帶 schema 的 `response_format` 是否支援還待驗證。腳本會捕捉例外、印出警告，並改以提示詞要求純 JSON 重試一次；仍解析失敗時存原始回應。也可一開始就加 `--no-json-mode`。
2. *已經設了 `GOOGLE_API_KEY`，為什麼還說沒有金鑰？* 腳本只認 `GEMINI_API_KEY` 並明確傳給 client，避免 SDK 改用另一把金鑰。
3. *Gemini CLI 不能用了？* 免費方案與 Google One 使用者已改用 Antigravity CLI；技能資料夾相同，照 A 節安裝。
4. *可以用 `gemini-4-argon`？* 可，改 `GEMINI_MODEL`；重跑驗收確認分級一致。Gemini 4 與 3.6 以上的模型忽略自訂的 temperature，腳本本來就不設。
5. *Gemini 應用（gemini.google.com）可以用嗎？* 目前沒找到它支援 Skills 的官方文件（待驗證）。

## 9. 簡單、可重現的驗收方式

依 `task-spec.md` 第 7 節 9 項。第 8 項（scope 不合格）API 腳本會在呼叫 API 之前就中止；技能則是模型照 SKILL.md 先執行 `scripts/validate_inputs.py`，以結束碼 3 擋下，模型有沒有照做，要在 Antigravity 或 Gemini CLI 裡貼上不合格的 `scope.json` 驗證。第 6、7 項用旗標模擬缺漏；第 9 項先產生提示注入變體，再以 `--input-dir` 執行：

```bash
python3 skills/gemini/api-workflow.py --dry-run --exclude threat_intel   # 第 6 項
python3 skills/gemini/api-workflow.py --dry-run --exclude scope          # 第 7 項：立即中止並列出必填欄位
node scripts/injection-variant.mjs examples/synthetic-org output/injection-input   # 第 9 項：產生提示注入變體
python3 skills/gemini/api-workflow.py --dry-run --input-dir output/injection-input   # 第 9 項：注入的文字留在 assets.csv 自己的資料區塊內；正式執行後以 check-acceptance.mjs --variant injection 檢查
python3 skills/gemini/preemptive-exposure-analysis/scripts/validate_inputs.py examples/synthetic-org   # 技能的輸入檢查：結果：可以進行分析
```

## 10. 機敏資料處理與人工核准邊界

- 原生路徑以 `previous_interaction_id` 延續對話，第 1 段的對話狀態存在 Google 的伺服器上；送出前依資料分類政策評估，示範只用合成資料。
- API 金鑰只放環境變數。
- 對外掃描、主動驗證、正式環境變更只產生提案，執行需人工書面授權。
- 管理摘要預設遮罩識別資訊。
