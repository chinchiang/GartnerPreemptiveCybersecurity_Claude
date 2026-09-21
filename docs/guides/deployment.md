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
examples/             合成範例資料與預期輸出
scripts/              build-data.mjs、verify.mjs、run-demo.mjs
backend/              選用的模型 API 代理範例（預設不需要）
.github/workflows/pages.yml  GitHub Pages 部署工作流程
```

內容以 `docs/` 與 `skills/` 為單一來源；**修改後務必執行** `node scripts/build-data.mjs` 重新產生 `data/` 與 `downloads/`，否則網站不會更新。

## 2. 本機預覽

```bash
git clone https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude.git
cd GartnerPreemptiveCybersecurity_Claude
node scripts/build-data.mjs
npx http-server -p 8080 .      # 或 python3 -m http.server 8080
# 開啟 http://localhost:8080/
```

直接以 `file://` 開啟 `index.html` 也可運作（資料以 `<script>` 載入，不依賴 fetch）。

## 3. GitHub Pages 部署

工作流程 `.github/workflows/pages.yml` 會在推送到 `main` 時：安裝 Node 22 → `node scripts/build-data.mjs` → `node scripts/verify.mjs --static` → 只把網站需要的檔案（`index.html`、`404.html`、`.nojekyll`、`assets/`、`data/`、`downloads/`）組成 `_site/` 上傳為 Pages artifact → 部署。研究文件、證據檔、README、驗證報告與連結檢查表都已由建置腳本嵌入 `data/*.js`，因此網站內容完整，但 `docs/`、`examples/`、`scripts/`、`verify-screenshots/` 不會直接以檔案形式公開在 Pages 上（仍可在 GitHub 儲存庫瀏覽）。

**已完成的一次性設定**（2026-09-13）：儲存庫 Settings → Pages → Build and deployment → Source 選 **GitHub Actions**；預設分支設為 `main`；`github-pages` 環境的部署分支規則允許 `main`。目前網址為 `https://chinchiang.github.io/GartnerPreemptiveCybersecurity_Claude/`，部署工作流程已成功執行並經人工確認。若新建 fork 或搬移儲存庫，需重做這三項設定。

若偏好「Deploy from a branch」，也可以直接選 `main` 分支根目錄（因為 `data/` 與 `downloads/` 已提交），但建議用 Actions 以確保建置一致。

## 4. 驗證

```bash
node scripts/verify.mjs --static     # 資料檔、來源 ID 對應、schema、示範引擎驗收、下載檔、機敏字串
node scripts/verify.mjs              # 加上 Playwright 瀏覽器檢查：導覽、搜尋、篩選、複製、下載、案例互動、行動裝置、無障礙
node scripts/verify.mjs --links      # 加上來源連結 HEAD 檢查（需不受限網路），輸出 link-check.md
```

結果寫入 `verify-report.md`；截圖在 `verify-screenshots/`。

## 5. 維護

| 要更新什麼 | 改哪裡 | 之後 |
|---|---|---|
| 研究內容 | `docs/research/*.md`（frontmatter `order`、`title`、`summary`） | build |
| 來源、待驗證清單、連結檢查紀錄 | `data/sources.js`（每筆需有 `verification` 等級） | 無需 build |
| 證據檔、README、驗證報告、連結檢查表（站上附錄） | `docs/evidence/*.md`、`README.md`、`verify-report.md`、`link-check.md` | build（嵌入 `data/extra.js`） |
| 選用後端代理的提示詞 | `skills/shared/core-prompt.md` | `node scripts/build-worker.mjs` 產生 `backend/dist/worker.js` |
| 流程／I-O／平台比較 | `data/process.js`、`data/io.js`、`data/platforms.js` | 無需 build |
| Skills | `skills/<platform>/…`；規則變更先改 `skills/shared/` 再同步各平台 | build |
| 教學 | `docs/guides/<platform>.md` | build |
| 範例資料 | `examples/synthetic-org/`（保持合成） | build；`node scripts/run-demo.mjs` 對照 `examples/expected-output.md` |
| 評分規則 | `skills/shared/task-spec.md` 附錄 A、`core-prompt.md`、`assets/demo.js`、`references/scoring-rules.md` 需一致 | build + verify |

建議每季重新查證：Gartner 新文件（尤其 Impact Radar 與 Hype Cycle 更新）、五個平台的模型與功能變動（見待驗證清單）。

## 6. 安全與隱私

- 儲存庫與網站不含任何 API 金鑰、憑證或真實資料；`verify.mjs` 會掃描金鑰樣式字串。
- 網站不使用 cookie、不連外部服務；主題偏好只存於 `localStorage`。
- 若啟用 `backend/` 代理，金鑰只在伺服器端，並限制來源與速率。
