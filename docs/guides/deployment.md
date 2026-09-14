---
title: 部署與維護
order: 90
platform: ""
---

## 1. 網站架構

純靜態網站，無建置框架、無外部相依（無 CDN、無追蹤）：

```
index.html            單頁應用程式殼
assets/styles.css     樣式（淺／深色、行動裝置、列印）
assets/md.js          極簡 Markdown 渲染器
assets/demo.js        案例互動展示的確定性引擎
assets/app.js         hash 路由、各頁面、全站搜尋、複製／下載
data/*.js             由 scripts/build-data.mjs 產生（research、guides、skills、case、manifest）或手動維護（process、io、platforms、sources）
downloads/*.zip       由建置腳本產生的下載包
docs/                 研究文件（research/）、教學（guides/）、證據檔（evidence/）
skills/               共用規格與五平台檔案（單一來源）
examples/             合成範例資料、預期輸出、示範引擎快照與驗收夾具
scripts/              build-data.mjs、verify.mjs、run-demo.mjs、check-acceptance.mjs
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

工作流程 `.github/workflows/pages.yml` 會在推送到 `main` 時：安裝 Node 22 → `npm run build` → `npm run verify:static` → 上傳整個儲存庫為 Pages artifact → 部署。

**已完成的一次性設定**（2026-09-13）：儲存庫 Settings → Pages → Build and deployment → Source 選 **GitHub Actions**；預設分支設為 `main`；`github-pages` 環境的部署分支規則允許 `main`。目前網址為 `https://chinchiang.github.io/GartnerPreemptiveCybersecurity_Claude/`，部署工作流程已成功執行並經人工確認。若新建 fork 或搬移儲存庫，需重做這三項設定。

若偏好「Deploy from a branch」，也可以直接選 `main` 分支根目錄（因為 `data/` 與 `downloads/` 已提交），但建議用 Actions 以確保建置一致。

## 4. 驗證

```bash
npm run verify:static   # 資料檔、來源 ID 對應、schema、示範引擎驗收與快照、下載檔、機敏字串
npm run verify          # 加上 Playwright 瀏覽器檢查：導覽、搜尋、篩選、複製、下載、案例互動、行動裝置、無障礙
npm run verify:links    # 靜態檢查 + 來源連結 HEAD 檢查（不含瀏覽器），輸出 link-check.md（見第 4.2 節）
```

結果寫入 `verify-report.md`；截圖在 `verify-screenshots/`。任一項失敗時腳本以非零狀態結束。

### 4.1 示範引擎快照

評分規則同時存在於四個地方（`assets/demo.js`、`skills/shared/core-prompt.md`、`skills/shared/task-spec.md` 附錄 A、`skills/claude/.../references/scoring-rules.md`）。`examples/demo-snapshot.txt` 是 `run-demo.mjs` 的黃金輸出，`verify:static` 會逐位元組比對，用來抓「改了一處忘了同步其他三處」。

規則**刻意**變更時：先確認四處都已同步，再執行 `npm run snapshot` 更新快照，並在 PR 說明變更理由。

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

`scripts/check-acceptance.mjs` 檢查 `references/acceptance.md` 七項驗收中可機器判定的部分：頂層鍵與每個區塊的證據欄位、九個輸入檔筆數、`vpn-gw-01/SYN-2026-0101` 是否為 P1 且含四項關鍵依據、攻擊路徑鏈是否存在且標為 `hypothesis`、驗證計畫是否每項標「尚未授權」、管理摘要長度與決策請求；`--variant no-intel` 另檢查移除情資後是否標示缺漏並下修信心。

刻意**不**檢查中文品質、建議是否合理、遮罩是否足夠——這些用 `docs/evidence/model-acceptance-template.md` 人工判讀並留紀錄。

`examples/acceptance-fixture.json` 是一份「應該全部通過」的合成夾具，`verify:static` 會用它反向測試驗收腳本本身沒壞（同一份夾具在 `no-intel` 變體下必須失敗，否則表示該檢查是空的）。**它不是任何模型的真實輸出。**

Claude 沒有 `api-workflow.py`（只有 `scripts/validate_inputs.py`），驗收需在 Claude Code 或 claude.ai 手動執行後，把輸出 JSON 存檔再跑上面的腳本。

## 5. 維護

| 要更新什麼 | 改哪裡 | 之後 |
|---|---|---|
| 研究內容 | `docs/research/*.md`（frontmatter `order`、`title`、`summary`） | `npm run build` |
| 來源、待驗證清單、連結檢查紀錄 | `data/sources.js` | 無需 build |
| 流程／I-O／平台比較 | `data/process.js`、`data/io.js`、`data/platforms.js` | 無需 build |
| Skills | `skills/<platform>/…`；規則變更先改 `skills/shared/` 再同步各平台 | `npm run build` |
| 教學 | `docs/guides/<platform>.md` | `npm run build` |
| 範例資料 | `examples/synthetic-org/`（保持合成） | build；`npm run demo` 對照 `examples/expected-output.md`，再 `npm run snapshot` |
| 評分規則 | `skills/shared/task-spec.md` 附錄 A、`core-prompt.md`、`assets/demo.js`、`references/scoring-rules.md` 需一致 | build + verify + `npm run snapshot` |

`data/` 與 `downloads/` 是建置產物但**有進版控**（為了讓 `file://` 與「Deploy from a branch」都能用）。CI 會執行 `git diff --exit-code -- data/ downloads/`，忘記重建就會擋下 PR。`data/manifest.js` 內的 `contentHash` 是來源內容的 SHA-256 前 12 碼——刻意不放建置時間，這樣同一份內容永遠產生同一個 manifest，上述檢查才守得住。

建議每季重新查證：Gartner 新文件（尤其 Impact Radar 與 Hype Cycle 更新）、五個平台的模型與功能變動（見待驗證清單）。這件事已由 `.github/workflows/quarterly-review.yml` 每季（1／4／7／10 月 1 日）自動開一個 issue，內容是 `data/sources.js` 中 `status: 'pending'` 的項目所組成的勾選清單（`node scripts/todo-checklist.mjs` 可在本機預覽）。查證完成後把該項改成 `status: 'done'` 並填 `resolvedAt`——`verify:static` 會檢查 `pending` 項目都寫出了下一步、`done` 項目都有日期。

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
