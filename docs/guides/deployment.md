---
title: 部署與維護
order: 90
platform: ""
---

## 1. 網站架構

純靜態網站，無建置框架、無外部相依（無 CDN、無追蹤；字型自載於 `assets/fonts/`）：

```
index.html            單頁應用程式殼
assets/styles.css     樣式（淺／深色兩套設計 token、行動裝置、列印）
assets/fonts/         自載字型 Inter 與 JetBrains Mono（woff2 拉丁子集，SIL OFL 1.1；中文用系統字型）。仍無外部請求，CSP font-src 'self' 即可
assets/md.js          極簡 Markdown 渲染器
assets/demo.js        案例互動展示的確定性引擎
assets/scope-gate.js  授權範圍守門的 JS schema 解讀（示範引擎與選用後端代理共用；scope 定義由建置以嵌入區塊寫入）
assets/last-updated.js  最後更新時間的合法格式與臺北時間的顯示（網站與 scripts/stamp-last-updated.mjs 共用）
assets/app.js         hash 路由、各頁面、全站搜尋、複製／下載
data/*.js             由 scripts/build-data.mjs 產生（research、guides、skills、case、manifest）或手動維護（process、io、platforms、sources）
downloads/*.zip       由建置腳本產生的下載包；各平臺 ZIP 的內容（平臺檔案＋腳本依賴的母本＋合成資料，解壓即可執行）由 scripts/skill-packages.mjs 的對照表決定
docs/                 研究文件（research/）、教學（guides/）、證據檔（evidence/）
skills/               母本（skills/shared/）、平臺檔案與建置產生的複本（各平臺 references/）；skills/shared/analysis_workflow.py 是 Python 的分析工作流程核心，改用它的平臺腳本只剩模型 adapter（理由見 docs/adr/0002）；Claude 技能的 validate_inputs.py 用建置產生的複本 scripts/analysis_workflow.py（見 docs/adr/0003），只渲染核心的授權範圍守門與腳本預檢
examples/             合成資料、預期輸出、示範引擎快照與驗收 fixture
scripts/              build-data.mjs、zip-util.mjs（建置產生 ZIP 用的 CRC32，無外部相依）、verify.mjs（--static 不改寫 verify-report.md，由 verify-report.test.mjs 檢查）、run-demo.mjs、check-acceptance.mjs（驗收的 CLI）、mutate.mjs（突變測試：逐一改壞實作、確認測試會失敗、一定還原，單元測試在 mutate.test.mjs）、stamp-last-updated.mjs（部署時把最後更新時間寫進 _site/index.html，單元測試在 stamp-last-updated.test.mjs）、last-updated.test.mjs（assets/last-updated.js 的單元測試）、scope-gate.test.mjs（assets/scope-gate.js 的單元測試）、scope-cases.test.mjs（授權範圍守門的共用案例套在示範引擎與選用後端代理上）、scoring.test.mjs（示範引擎依示範評分規則的計算行為）、attack-paths.test.mjs（示範引擎攻擊路徑的跳數上限與入口加分）、glossary.mjs（詞彙表 _Avoid_ 詞的檢查，單元測試與整個 repo 的檢查在 glossary.test.mjs）、acceptance.mjs（驗收 module，判定的唯一來源，單元測試在 acceptance.test.mjs）、build-worker.mjs（單元測試在 build-worker.test.mjs）、skill-packages.mjs（技能包組裝器，單元測試在 skill-packages.test.mjs）、scoring-rules.mjs（評分規則一致性檢查，單元測試在 scoring-rules.test.mjs）、frontmatter.mjs（Markdown frontmatter 的判斷規則，建置讀標題與 Skills 專區渲染檢視共用，單元測試與對建置產物的整合檢查在 frontmatter.test.mjs）、todo-checklist.mjs（把 data/sources.js 的待驗證項目印成 Markdown 勾選清單，季度查證的 issue 用）、deployment-guide.test.mjs（scripts/ 底下每支 .mjs 都要列在這一行）
tests/                fixtures/scope-cases.json（授權範圍守門的共用案例，JS 與 Python 共用）、python/（Python 測試；不出貨）
backend/              選用的模型 API 代理範例（預設不需要）
package.json          npm scripts（建置／驗證的唯一入口）與 Playwright 版本
.gitattributes        強制文字檔使用 LF（見第 7 節）
robots.txt            允許索引，指向 sitemap
sitemap.xml           只有一個 URL（hash 路由的 SPA，片段不被索引）
.nojekyll             關閉 GitHub Pages 的 Jekyll 處理
.github/workflows/    pages.yml（部署）、ci.yml（PR 驗證）、link-check.yml（來源連結檢查）、model-acceptance.yml（真實模型驗收）、quarterly-review.yml（季度查證提醒）
.github/dependabot.yml  只追蹤 GitHub Actions 版本
```

內容以 `docs/` 與 `skills/` 為單一來源；**修改後務必執行** `npm run build` 重新產生 `data/` 與 `downloads/`，否則網站不會更新。

## 2. 本機預覽

```bash
git clone https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude.git
cd GartnerPreemptiveCybersecurity_Claude
npm run build                  # 等同 node scripts/build-data.mjs，不需要 npm install
npx http-server -p 8080 .      # 或 python3 -m http.server 8080
# 開啟 http://localhost:8080/
```

建置與靜態驗證只用 Node 內建模組，**不需要 `npm install`**；只有瀏覽器驗證（Playwright）需要 `npm ci`。

直接以 `file://` 開啟 `index.html` 也可運作（資料以 `<script>` 載入，不依賴 fetch）。

## 3. GitHub Pages 部署

工作流程 `.github/workflows/pages.yml` 會在推送到 `main` 時：安裝 Node 22 → `npm run build` → `npm run verify:static` → 只把網站需要的檔案（`index.html`、`404.html`、`.nojekyll`、`robots.txt`、`sitemap.xml`、`assets/`、`data/`、`downloads/`）組成 `_site/` → 以 `scripts/stamp-last-updated.mjs` 把 HEAD commit 的時間（`git log -1 --format=%cI`）寫進 `_site/index.html` 的 `<meta name="last-updated">` → 上傳為 Pages artifact → 部署。網站右上角（1150px 以下改在頁尾）顯示的「最後更新」就是這個時間，換算成臺北時間；repo 裡提交的 `index.html` 一律留空，所以本機預覽與 `git clone` 的版本不顯示。找不到這個 `<meta>` 或時間不合法時這一步會失敗，不會部署一個沒有時間的網站。研究文件、證據檔、README、驗證報告與連結檢查表都已由建置腳本嵌入 `data/*.js`（`data/extra.js`），因此網站內容完整；`docs/`、`examples/`、`scripts/`、`verify-screenshots/` 不會直接以檔案形式公開在 Pages 上（仍可在 GitHub 儲存庫瀏覽）。

**已完成的一次性設定**（2026-09-13）：儲存庫 Settings → Pages → Build and deployment → Source 選 **GitHub Actions**；預設分支設為 `main`；`github-pages` 環境的部署分支規則允許 `main`。目前網址為 `https://chinchiang.github.io/GartnerPreemptiveCybersecurity_Claude/`，部署工作流程已成功執行並經人工確認。若新建 fork 或搬移儲存庫，需重做這三項設定。

若偏好「Deploy from a branch」，也可以直接選 `main` 分支根目錄（因為 `data/` 與 `downloads/` 已提交），但建議用 Actions 以確保建置一致。

## 4. 驗證

```bash
npm test                # 單元測試（node:test，不需 npm install）：技能包組裝器、示範引擎的授權範圍守門、攻擊路徑跳數上限與入口加分的可達性、示範引擎依示範評分規則的計算行為（每條公式的手算值與邊界，`scripts/scoring.test.mjs`）、驗收的機器判定（`scripts/acceptance.mjs`：每項不合格就失敗、預期筆數對照 `acceptance.md`、fixture 契約回歸、示範引擎的輸出通過驗收，`scripts/acceptance.test.mjs`）、選用後端代理的授權範圍守門、後端代理建置的兩個嵌入點恰好一處（`scripts/build-worker.test.mjs`）、評分規則一致性、`verify:static` 不改寫已提交的 `verify-report.md`（`scripts/verify-report.test.mjs`）、突變工具（`scripts/mutate.test.mjs`）、手寫檔案不使用專指的 _Avoid_ 詞（`scripts/glossary.test.mjs`）、部署時寫入最後更新時間（`scripts/stamp-last-updated.test.mjs`）與它的臺北時間格式（`scripts/last-updated.test.mjs`）
python3 -m unittest discover -s tests/python   # Python 測試（標準函式庫）：分析工作流程核心、ChatGPT／DeepSeek／GLM／Grok adapter（假 SDK），validate_inputs.py（輸出、結束碼、單獨安裝），以及四支 api-workflow.py 與 validate_inputs.py 的授權範圍守門
npm run verify:static   # 資料檔、來源 ID 對應、schema、示範引擎的行為檢查與快照、下載檔、機敏字串、`index.html` 預留的最後更新時間 `<meta>`（驗收在 npm test）
npm run verify          # 加上 Playwright 瀏覽器檢查：導覽、搜尋、篩選、複製、下載、案例互動、行動裝置、無障礙、最後更新時間在 topbar 與頁尾的顯示
npm run verify:links    # 靜態檢查 + 來源連結 HEAD 檢查（不含瀏覽器），輸出 link-check.md（見第 4.2 節）
```

完整模式（`npm run verify`）的結果寫入 `verify-report.md`；`verify:static` 只把結果印到終端機，不改寫這個已提交的檔案。截圖在 `verify-screenshots/`。任一項失敗時腳本以非零狀態結束。CI 的 browser job 跑完會比對新產生的報告和已提交的報告（忽略執行時間那一行），不一致就失敗：檢查項目或結果變了，要更新已提交的報告並重建 `data/extra.js`。截圖不比對。

### 4.1 評分規則與示範引擎快照

評分規則數值的唯一來源是示範引擎匯出的規則資料（`assets/demo.js` 的 `RULES`），引擎由它計算。三份母本——`skills/shared/core-prompt.md`、`skills/shared/task-spec.md` 附錄 A（與第 5 節的信心規則）、`skills/shared/scoring-rules.md`——以手寫散文陳述同一套規則；兩份刻意改寫的版本（ChatGPT 的 Codex `SKILL.md`、`custom-gpt-instructions.md`）與 `data/process.js` 的 S3／S4 說明也寫了規則數值。`scripts/scoring-rules.mjs` 的一致性檢查從這些文件抽出數值與運算子，和規則資料比對（改寫版只比數值與運算子，措辭可以不同），任一處不同，`npm test` 就失敗並列出文件、規則、預期值與實際值。各平臺 `references/` 裡的複本由建置產生，不在檢查範圍內。

網站案例頁的「示範規則摘要」卡片由引擎的 `rulesSummary()` 依規則資料產生，不需要另外同步。

`examples/demo-snapshot.txt` 是 `run-demo.mjs` 的黃金輸出（規則資料套用在合成資料上的結果），`verify:static` 會逐位元組比對。

規則**刻意**變更時：

1. 改 `assets/demo.js` 的 `RULES`。
2. 依 `npm test` 列出的漂移改母本、改寫版與流程資料（網站規則卡由規則資料產生，不必改）。
3. `npm test` 通過後，執行 `npm run snapshot` 更新快照，並在 PR 說明變更理由。

### 4.2 來源連結檢查在哪裡跑

本地研究環境的出口 proxy 會把 gartner.com 等網域回成 403，**那不代表連結失效**。GitHub Actions runner 沒有這層限制，因此連結檢查改在 CI 執行：`.github/workflows/link-check.yml`（手動 `workflow_dispatch`，另每季 1 月／4 月／7 月／10 月 1 日自動執行），結果以 artifact 形式提供，確認後再覆蓋 `link-check.md` 並更新 `data/sources.js` 的 `LINK_CHECK_NOTE`。

Runner 走資料中心 IP，Gartner 與部分媒體站仍可能因 bot 防護回 403；能藉此區分「本地 proxy 封鎖」與「站方封鎖」已是有價值的資訊。

### 4.3 真實模型驗收

前面兩節驗的都是**專案本身**（資料一致、示範引擎、網站行為），不需要金鑰、結果可重現。**模型實際輸出的品質**是另一件事，用 `.github/workflows/model-acceptance.yml` 手動觸發：

```bash
# 本機等價操作（金鑰只從環境變數讀）
python3 skills/chatgpt/api-workflow.py --input-dir examples/synthetic-org --output-dir output/baseline
node scripts/check-acceptance.mjs output/baseline/chatgpt-output.json
```

`scripts/check-acceptance.mjs` 檢查 `skills/shared/acceptance.md`（各平臺 `references/acceptance.md` 為其複本）八項驗收中可機器判定的部分（判定由驗收 module `scripts/acceptance.mjs` 提供，這支只是 CLI）：頂層鍵與每個區塊的證據欄位、九個輸入檔筆數、`vpn-gw-01/SYN-2026-0101` 是否為 P1 且含四項關鍵依據、攻擊路徑鏈是否存在且標為 `hypothesis`、驗證計畫是否每項標「尚未授權」、管理摘要長度與決策請求；`--variant no-intel` 另檢查移除情資後是否標示缺漏並下修信心。

刻意**不**檢查中文品質、建議是否合理、遮罩是否足夠——這些用 `docs/evidence/model-acceptance-template.md` 人工判讀並留紀錄。

`examples/acceptance-fixture.json` 是一份「應該全部通過」的合成 fixture，`npm test`（`scripts/acceptance.test.mjs`）會用它反向測試驗收的判定本身沒壞（同一份 fixture 在 `no-intel` 變體下必須失敗，否則表示該檢查是空的）。第 1 項的預期筆數由合成資料推出，並對照 `acceptance.md` 寫的 9 個數字。**它不是任何模型的真實輸出。**

Claude 沒有 `api-workflow.py`（只有 `scripts/validate_inputs.py`），驗收需在 Claude Code 或 claude.ai 手動執行後，把輸出 JSON 存檔再跑上面的腳本。

## 5. 維護

| 要更新什麼 | 改哪裡 | 之後 |
|---|---|---|
| 研究內容 | `docs/research/*.md`（frontmatter `order`、`title`、`summary`） | `npm run build` |
| 來源、待驗證清單、連結檢查紀錄 | `data/sources.js`（每筆來源需有 `verification` 等級；待驗證項目需有 `status`） | 無需 build |
| 證據檔、README、驗證報告、連結檢查表（站上附錄） | `docs/evidence/*.md`、`README.md`、`verify-report.md`、`link-check.md` | `npm run build`（嵌入 `data/extra.js`） |
| 核心提示詞（系統提示詞的嵌入區塊、選用後端代理） | `skills/shared/core-prompt.md` | `npm run build`（重寫三份 `system-prompt.md` 與兩份 `SKILL.md` 的嵌入區塊，提交；第 0 節「- scope 必填欄位的規則：」那一行也由建置從 schema 產生，見下一列）；`node scripts/build-worker.mjs` 產生 `backend/dist/worker.js`（不提交） |
| 流程／I-O／平臺比較 | `data/process.js`、`data/io.js`、`data/platforms.js` | 無需 build |
| Skills | 共用內容改 `skills/shared/` 的母本，平臺專屬內容改 `skills/<platform>/…`；各平臺 `references/` 的複本，以及核心提示詞的嵌入區塊（Grok／GLM／DeepSeek 的 `system-prompt.md`、GLM／DeepSeek 的 `SKILL.md`），以及核心提示詞母本與三份改寫版（Custom GPT 指示、Codex 與 Claude 的 `SKILL.md`）的規則說明行（見「授權範圍守門規則」一列），都由建置從母本產生，**請勿手動編輯**（這些檔案其餘的內容是手寫的） | `npm run build`（重寫複本；複本的組成見 `scripts/skill-packages.mjs` 的對照表） |
| 新增建置產生的檔案 | 建置（`scripts/build-data.mjs`、`scripts/skill-packages.mjs` 的對照表）多寫出一個檔案或目錄時，把它的路徑加進根目錄的 `.ignore`：`rg` 搜尋與詞彙表測試都依它略過生成檔（見 `docs/agents/workflow.md`） | `npm run build`（產物一起提交）；`npm test` |
| 教學 | `docs/guides/<platform>.md` | `npm run build` |
| 合成資料 | `examples/synthetic-org/`（保持合成）；筆數變了就同步改 `skills/shared/acceptance.md` 第 1 項與 `scripts/acceptance.test.mjs` 的預期筆數字面值 | build；`npm test`；`npm run demo` 對照 `examples/expected-output.md`，再 `npm run snapshot` |
| 授權範圍守門規則 | 只改 `skills/shared/input-schema.json` 的 scope 定義：Python 分析工作流程核心與 `assets/scope-gate.js`（網站示範引擎與選用後端代理共用，scope 定義由建置以嵌入區塊寫入）都依它判定。要用到兩份解讀還不認得的 schema 關鍵字時，兩份都要實作，否則會丟出錯誤（見 `docs/adr/0004-scope-gate-reads-the-schema-in-two-interpreters.md`）；判定變了就同步改 `tests/fixtures/scope-cases.json` 的共用案例。模型側守門的規則說明也由建置從 schema 產生（`scope-gate.js` 的 `scopeRuleNote()`），寫進核心提示詞與三份改寫版（Custom GPT 指示、Codex 與 Claude 的 `SKILL.md`）以「- scope 必填欄位的規則：」開頭的那一行；要用到規則說明還不會描述的規則時，`scopeRuleNote()` 與 Python 的 `scope_rule_note` 兩份都要實作，否則建置會丟出錯誤（見 `docs/adr/0005-model-side-gate-rule-note-is-generated-into-the-core-prompt.md`） | build（重寫 `scope-gate.js` 的嵌入區塊與四份檔案的規則說明行，提交）+ `npm test` + Python unittest |
| 最後更新時間 | 合法格式與顯示格式改 `assets/last-updated.js`（部署時的寫入工具 `scripts/stamp-last-updated.mjs` 也用它判定）；topbar 與頁尾的位置改 `index.html`，斷點改 `assets/styles.css`；`index.html` 的 `<meta name="last-updated">` 必須留空 | `npm test` + `verify:static`；畫面與斷點（含搜尋框在 901px、1151px 至少 160px：topbar 加東西或改斷點都可能擠窄它）要跑完整模式 `npm run verify` 才檢查得到（CI 的 browser job，或 Windows 本機；`verify.mjs` 以 `?stamped` 模擬部署後的網站） |
| 評分規則 | `assets/demo.js` 的 `RULES`，再依一致性檢查改母本、改寫版（Codex `SKILL.md`、`custom-gpt-instructions.md`）與 `data/process.js` 的流程說明（見第 4.1 節）；改了數值或公式時，`scripts/scoring.test.mjs` 的手算預期值也要跟著改 | `npm test` + build + verify + `npm run snapshot` |

`data/`、`downloads/`、各平臺 `references/` 的複本與嵌入區塊（`system-prompt.md`、`SKILL.md`，以及 `assets/scope-gate.js` 的 scope 定義）是建置產物但**有進版控**（為了讓 `file://`、「Deploy from a branch」與 `git clone` 後的技能資料夾都能直接用；理由見 `docs/adr/0001-generated-copies-are-committed.md`）。CI 在建置與靜態驗證之後檢查整份工作樹（`git status --porcelain` 必須是空的，新產生的檔案也算），忘記重建或直接改了複本、嵌入區塊都會擋下 PR；新增嵌入目標時不必改 CI。`data/manifest.js` 內的 `contentHash` 是來源內容的 SHA-256 前 12 碼——刻意不放建置時間，這樣同一份內容永遠產生同一個 manifest，上述檢查才守得住。網站上的最後更新時間因此不由建置產生，而是部署時才寫進 `_site/` 的複製品（見第 3 節）。

建議每季重新查證：Gartner 新文件（尤其 Impact Radar 與 Hype Cycle 更新）、五個平臺的模型與功能變動（見待驗證清單）。這件事已由 `.github/workflows/quarterly-review.yml` 每季（1／4／7／10 月 1 日）自動開一個 issue，內容是 `data/sources.js` 中 `status: 'pending'` 的項目所組成的勾選清單（`node scripts/todo-checklist.mjs` 可在本機預覽）。查證完成後把該項改成 `status: 'done'` 並填 `resolvedAt`——`verify:static` 會檢查 `pending` 項目都寫出了下一步、`done` 項目都有日期。

`sitemap.xml` 的 `<lastmod>` 是手寫的，內容有較大幅度更新時順手改一下即可（刻意不由建置產生：那會讓 `data/` 的一致性檢查每天都失敗）。

## 6. 安全與隱私

- 儲存庫與網站不含任何 API 金鑰、憑證或真實資料；`verify.mjs` 會掃描金鑰樣式字串。
- 網站不使用 cookie、不連外部服務；主題偏好只存於 `localStorage`。
- `index.html` 有 CSP meta：`default-src 'self'`、`object-src 'none'`、`form-action 'none'`。`style-src` 必須保留 `'unsafe-inline'`（`assets/app.js` 有 18 處 `style="…"` 屬性），`img-src` 必須保留 `data:`（favicon 是內嵌 SVG）。**加入任何外部資源前先改這一行**，否則瀏覽器會靜默擋掉；`npm run verify` 會把 CSP 違規當成 console error 而失敗。
- 儲存庫已於 2026-09-14 轉為公開，指向儲存庫的連結（topbar 按鈕與頁尾）因此顯示。**若改回 private 記得把 `assets/app.js` 的 `REPO_PUBLIC` 改成 `false`**：Pages 站點是公開的，指向 private 儲存庫的連結對訪客一律是 404，而站在維護者的瀏覽器裡看不出來（你有權限）。
- 若啟用 `backend/` 代理，金鑰只在伺服器端，並限制來源與速率。

## 7. 在 Windows 上開發

`.gitattributes` 以 `* text=auto eol=lf` 強制所有文字檔在工作樹中使用 LF。**這不是風格偏好**：`build-data.mjs` 會把 `docs/` 與 `skills/` 的內容內嵌進 `data/*.js` 並打包成 ZIP，若以 CRLF 簽出，產出的位元組就與 Linux（CI／Pages）不同，第 5 節的一致性檢查會誤報。

腳本本身也已對 CRLF 免疫（`readText()` 正規化換行、`parseFrontmatter()` 接受 `\r?\n`、路徑一律轉為 `/`），所以就算你的工作樹是 CRLF，建置結果仍然正確。若是在加入 `.gitattributes` 之前就已存在的 clone，執行一次 `git add --renormalize .` 確認索引乾淨即可。

另外：`docs/guides/claude.md` 在不分大小寫的檔案系統上會被 Claude Code 誤認為 `CLAUDE.md` 專案指令檔而自動載入。這只影響在本儲存庫中使用 Claude Code 的體驗，不影響網站；若造成干擾，可在根目錄放一份真正的 `CLAUDE.md` 覆寫。
