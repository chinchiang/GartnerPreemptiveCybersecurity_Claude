# Gartner「Preemptive Cybersecurity（先制型資安）」研究與五平台 Skills Playbook

研究 Gartner 的 Preemptive Cybersecurity 方法論，拆解其必要輸入、處理流程與可能輸出；據此建立可在 **ChatGPT、Claude、Grok、GLM、DeepSeek** 上使用的 skills 或等效工作流程；並以合成資料示範。全部內容以正體中文撰寫，保留必要英文專有名詞，並以互動網站呈現。

> **誠實聲明**：本專案明確區分「Gartner 明確陳述」「其他來源」「本專案推論」「待驗證」。凡標示為本專案推論的流程、分類、評分規則，**不是 Gartner 官方方法論**。研究環境無法直接開啟 gartner.com 與多數廠商網站，Gartner 網頁引文取自搜尋索引摘錄並交叉比對；唯一讀過全文的 Gartner 文件是使用者提供的《Emerging Tech Impact Radar: Preemptive Cybersecurity》授權轉載版。詳見網站「研究方法」章與「證據與來源」頁。

## 網站

- 網站網址（已由 GitHub Actions 部署，2026-09-13 確認可用）：`https://chinchiang.github.io/GartnerPreemptiveCybersecurity_Claude/`
- 本機預覽：`npm run build && npx http-server -p 8080 .`，或直接開啟 `index.html`。建置與靜態驗證只用 Node 內建模組，不需要 `npm install`。

網站包含：方法論導覽（8 章研究文件全文）、可執行流程（8 步驟互動）、Inputs／Outputs 對照（可篩選，含合成範例）、平台比較、Skills 專區（一鍵複製／下載／ZIP）、安裝與使用教學（切換平台）、案例互動展示（合成資料，可切換輸入與權重；輸出 JSON 符合 output-schema）、證據與來源（查證等級可篩選、原始證據檔、待驗證清單、連結檢查表）、部署與維護（附驗證報告與後端說明）。支援桌面與行動裝置、淺／深色主題、全站搜尋、基本無障礙。

## 儲存庫結構

```
index.html, assets/, data/        靜態網站（無框架、無外部相依）
docs/research/                    研究文件 00–07（方法、定義、關聯、流程、輸入、輸出、案例、平台）
docs/guides/                      五平台安裝與使用教學 + 部署與維護
docs/evidence/                    英文證據檔（Gartner 與平台查證原始紀錄）
skills/shared/                    共用任務規格、核心提示詞、輸入／輸出 JSON Schema
skills/{chatgpt,claude,grok,glm,deepseek}/   各平台 skill 或等效檔案（SKILL.md、提示詞、API 腳本）
examples/synthetic-org/           合成範例資料（9 檔）；expected-output.md 預期輸出；demo-snapshot.txt 示範引擎黃金快照
scripts/                          build-data.mjs（產生 data/ 與 downloads/）、verify.mjs（驗證）、run-demo.mjs（示範引擎；--json 輸出 output-schema 格式、--no-scope 模擬缺授權）、check-acceptance.mjs（驗收真實模型輸出）、build-worker.mjs（後端代理嵌入提示詞）
downloads/                        建置產生的 ZIP 下載包
backend/                          選用的模型 API 代理範例（預設不需要、無金鑰；部署前以 build-worker.mjs 產生 dist/）
.github/workflows/                pages.yml（部署）、ci.yml（PR 驗證）、link-check.yml（來源連結檢查）、model-acceptance.yml（真實模型驗收，手動）、quarterly-review.yml（季度查證提醒）
```

## 快速使用 Skills

| 平台 | 最快路徑 |
|---|---|
| Claude | 把 `skills/claude/preemptive-exposure-analysis/` 放進 `.claude/skills/`，在 Claude Code 輸入 `/preemptive-exposure-analysis examples/synthetic-org` |
| ChatGPT | Custom GPT 貼入 `skills/chatgpt/custom-gpt-instructions.md`；或 Codex 使用 `skills/chatgpt/codex-skill/` |
| Grok | `skills/grok/system-prompt.md` 貼入對話，或 `python3 skills/grok/api-workflow.py --dry-run` |
| GLM | Claude Code + GLM 後端使用 `skills/glm/claude-code-skill/`；或 `python3 skills/glm/api-workflow.py --dry-run` |
| DeepSeek | `python3 skills/deepseek/api-workflow.py --dry-run`（版本無關）；或 `skills/deepseek/host-skill/` |

所有 API 腳本都支援 `--dry-run`（不需 API 金鑰）。金鑰一律以環境變數提供，儲存庫不含任何金鑰或真實資料。

## 驗證

```bash
npm run build
npm run verify:static   # 資料、來源 ID、schema、示範引擎驗收與快照、下載檔、機敏字串
npm run verify          # 加上 Playwright 瀏覽器檢查（導覽、搜尋、篩選、複製、下載、案例互動、行動裝置）；需先 npm ci
python3 skills/claude/preemptive-exposure-analysis/scripts/validate_inputs.py examples/synthetic-org
```

上面兩個指令驗的是專案本身（免金鑰、可重現）。**真實模型輸出**的驗收另用 `scripts/check-acceptance.mjs` 與 `.github/workflows/model-acceptance.yml`（手動觸發），人工判讀的部分記錄在 `docs/evidence/model-acceptance-template.md`；細節見 `docs/guides/deployment.md` 第 4.3 節。

實際檢查結果記錄於 `verify-report.md`。`data/` 與 `downloads/` 為建置產物但有進版控，CI 會檢查它們與來源一致；修改 `docs/` 或 `skills/` 後請務必重新 `npm run build` 再提交。

## 安全邊界

本專案的工作流程以**授權範圍內的防禦分析**為目的。語言模型只做資料整合、規則化推理、假設生成與文件撰寫；不執行掃描或測試、不驗證實際曝險、不保證防止攻擊。對外掃描、主動安全驗證與正式環境變更在流程中設有明確的授權旗標與人工審查步驟。

## 授權與商標

- 本專案內容（文件、程式碼、合成資料）採 MIT License（見 `LICENSE`）。
- Gartner 為 Gartner, Inc. 之商標。本專案與 Gartner 無關；引用僅限公開資料與短句，並標示來源。依 Gartner 使用政策，不在儲存庫內收錄任何 Gartner 文件全文。
