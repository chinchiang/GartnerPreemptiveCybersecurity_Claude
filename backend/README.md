# 選用後端：安全的模型 API 代理（Cloudflare Worker 範例）

網站預設**不需要任何 API 金鑰**：案例互動展示使用確定性的示範規則在瀏覽器內執行。若你想在網站上加一個「用真實語言模型跑 skill」的按鈕，**不要**把金鑰放進前端。本目錄提供一個最小的代理範例，金鑰只存在伺服器端環境變數。

## 設計原則

1. 金鑰只在伺服器（Worker 的 secret）；前端只呼叫 `/api/analyze`。
2. 代理只允許固定的 system prompt（讀自 `skills/shared/core-prompt.md`），不讓前端覆蓋第 0 節。
3. 速率限制與來源限制（`ALLOWED_ORIGIN`）；請求體大小上限。
4. 不記錄請求內容；回應直接轉發。
5. 使用者上傳的資料會送往模型供應商：部署前確認資料處理協議，示範只用合成資料。

## 檔案

- `worker.js`：Cloudflare Worker **模板**，支援 `PROVIDER=openai|anthropic|xai|glm|deepseek`（皆為 OpenAI 相容或 Anthropic 相容端點）。其中 `CORE_PROMPT` 是佔位字串，部署前必須先建置。
- `../scripts/build-worker.mjs`：把 `skills/shared/core-prompt.md` 的提示詞區塊嵌入模板，輸出 `backend/dist/worker.js`（已列入 `.gitignore`）。
- `.env.example`：需要設定的變數清單（**不要**建立含真實值的 `.env` 並提交）。

## 部署（Cloudflare Workers）

```bash
node scripts/build-worker.mjs               # 在儲存庫根目錄執行，產生 backend/dist/worker.js
npm i -g wrangler
cd backend
wrangler secret put PROVIDER_API_KEY        # 互動輸入，不會寫入檔案
wrangler deploy dist/worker.js --name pea-proxy --compatibility-date 2026-01-01 \
  --var PROVIDER:openai --var MODEL:<供應商官方模型 ID> --var ALLOWED_ORIGIN:https://<你的 GitHub Pages 網域>
```

`MODEL` 請以各供應商官方模型列表為準；本專案未在真實模型上驗證代理（列為待驗證）。速率限制使用 Worker 記憶體，僅為示範；正式使用請改用 Cloudflare Rate Limiting 或 KV／Durable Objects。

前端接法（示意，未內建於本站）：

```js
const r = await fetch('https://<worker>/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bundle }) });
```

## 其他選項

- Vercel／Netlify Functions：同樣邏輯，金鑰放環境變數。
- 企業內部：以既有 API gateway 承載，並加上 SSO。
