# 選用後端：安全的模型 API 代理（Cloudflare Worker 範例）

網站預設**不需要任何 API 金鑰**：案例互動展示使用確定性的示範規則在瀏覽器內執行。若你想在網站上加一個「用真實語言模型跑 skill」的按鈕，**不要**把金鑰放進前端。本目錄提供一個最小的代理範例，金鑰只存在伺服器端環境變數。

**這是範例，不可直接上線。** 目前只有來源限制、記憶體裡的速率限制、請求大小上限、輸出上限、上游逾時與錯誤處理、模型輸出的檢查；正式使用前至少還缺：

- **身分驗證**：`ALLOWED_ORIGIN` 只比對 `origin` 標頭，非瀏覽器的用戶端可以任意偽造，不能取代身分驗證。見 [#158](https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude/issues/158)。
- **持久的速率限制與總用量配額**：每 IP 的次數只記在 Worker 記憶體裡，不同實例不共用、重新啟動就清空；總用量與費用也沒有上限。見 [#158](https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude/issues/158)。

## 設計原則

1. 金鑰只在伺服器（Worker 的 secret）；前端只呼叫 `/api/analyze`。
2. 代理只允許固定的 system prompt（讀自 `skills/shared/core-prompt.md`），不讓前端覆蓋第 0 節。
3. 速率限制與來源限制（`ALLOWED_ORIGIN`）；請求體大小上限 512 KB，以實際讀到的位元組計算（不只看 `content-length`），超過就停止讀取並回 413；送往模型的 JSON 一律完整，不截斷。
4. 授權範圍守門：`bundle.scope` 缺少或必填欄位不合格就回 400 並列出缺少的欄位，不送往模型供應商；規則只來自 `skills/shared/input-schema.json` 的 scope 定義，由與網站示範引擎共用的 `assets/scope-gate.js` 判定（見 `docs/adr/0004-scope-gate-reads-the-schema-in-two-interpreters.md`）。`authorized_scope` 有 `excluded_assets` 而且不符合 schema 的定義（例如寫成字串）時也回 400，訊息寫明它的規則：格式不符時排除不會生效，照常送出會把要排除的資產送往模型（見 `docs/adr/0007-excluded-assets-take-precedence.md`）。送往模型的資料只保留輸入 schema 頂層定義的類別，不認得的鍵一律丟掉。
5. 附上分數表：用示範引擎（`assets/demo.js` 的 `scoreTable`）依授權範圍篩選後的資料算出每項發現的分數，以「腳本預先計算的曝險分數」區塊附在送出的訊息裡，模型照用、不重新計算（跟 API 腳本相同，見 `docs/adr/0010-api-path-precomputes-exposure-scores.md`）。缺資產清冊或弱點、或算不出可信的分數時不附表，照常送出。分數表只跑範圍確認與曝險評分，不跑攻擊路徑假設；入口加分用可達性搜尋判斷，不窮舉攻擊路徑，成本大約是邊數乘以資產數（篩選邊時逐一比對資產清冊），不會隨路徑數暴增（窮舉時 40 個資產完全連通就要數十秒，#248）。收到上游 2xx 的回應後，不論有沒有附分數表，都檢查模型輸出（#247、#252）：從模型的文字裡取最後一個 JSON 區塊（``` 圍起來、沒標語言或標 json），依序做三項檢查，回報第一個不合格的：（1）依 `skills/shared/output-schema.json` 驗證；（2）內容一致性（分數與分級、參照完整性、驗證狀態要有證據）；（3）附了分數表時，以 finding_id 對照分數表。三項的判定都跟 API 腳本同一條規則，由共用案例守住（`tests/fixtures/output-cases.json`、`consistency-cases.json`、`score-problems-cases.json`）；schema 的錯誤訊息是 JS 這一份（`scripts/output-schema.mjs`）的文字，跟 API 腳本印的可能不同。全部通過才照原樣轉發；否則回 502，內容是 JSON，`error` 是 `output_schema_invalid`、`output_inconsistent`（兩者附 `problems` 字串陣列）、`score_table_mismatch`（附結構化的 `problems`）、`output_unparseable`（取不到文字、找不到或解析不了 JSON）或 `output_incomplete`（回覆不完整：被輸出上限截斷時可調高 `MAX_OUTPUT_TOKENS`；被內容過濾或拒答也算），都附上 `upstream`（上游回應的原文），無法檢查時一律不放行。
6. 不記錄請求內容。上游 2xx 的回應照原樣轉發（要先通過第 5 點的檢查）；上游回非 2xx 或連線失敗時回 502，只附上游的狀態碼數字，不轉發上游的回應內容與例外訊息（可能含帳號或金鑰的資訊）；超過 `UPSTREAM_TIMEOUT_MS` 就中止並回 504。
7. 每次呼叫都帶輸出上限（`MAX_OUTPUT_TOKENS`，預設 8000）：`openai`、`xai` 用 `max_completion_tokens`，`anthropic`、`glm`、`deepseek`、`gemini` 與 `BASE_URL` 指定的其他端點用 `max_tokens`（`gemini` 的 OpenAI 相容端點官方未說明參數名稱，待驗證）。OpenAI 的 `max_completion_tokens` 包含推理 token，推理模型可能在產生可見輸出前就用完上限，需要時調高。
8. 設定不完整或不合格時拒絕，不放行：`ALLOWED_ORIGIN`、`MODEL`、`PROVIDER_API_KEY` 任一沒設定（或是空字串）、`PROVIDER` 不是已知的供應商又沒有 `BASE_URL`、`MAX_OUTPUT_TOKENS` 或 `UPSTREAM_TIMEOUT_MS` 有設定卻不是正整數（`UPSTREAM_TIMEOUT_MS` 另外不得超過計時器的上限 2147483647）時，所有請求（含 CORS 的 `OPTIONS` 請求）都回 500 並說明是哪個設定，不呼叫上游。這兩個選用的數值沒設定或是空字串時，用預設值。
9. 使用者上傳的資料會送往模型供應商：部署前確認資料處理協議，示範只用合成資料。

## 檔案

- `worker.js`：Cloudflare Worker **模板**，支援 `PROVIDER=openai|anthropic|xai|glm|deepseek|gemini`（皆為 OpenAI 相容或 Anthropic 相容端點；`gemini` 走 Gemini API 的 OpenAI 相容端點，官方標示 beta）。其中 `CORE_PROMPT` 是佔位字串、授權範圍守門與示範引擎以相對路徑 import `../assets/scope-gate.js`、`../assets/demo.js`，部署前必須先建置。
- `package.json`：只宣告 `"type": "module"`，讓 Node 以 ES module 載入 `worker.js`（`scripts/scope-cases.test.mjs` 的守門測試）；根目錄的 `package.json` 不能這樣宣告，因為測試以 `require` 載入 `assets/demo.js`。
- `../scripts/build-worker.mjs`：把 `skills/shared/core-prompt.md` 的提示詞區塊嵌入模板，並內嵌模板 import 的 `assets/scope-gate.js`、`assets/demo.js`、`scripts/output-schema.mjs` 與 `skills/shared/output-schema.json`（改了其中任何一個都要重新建置與部署），輸出單一檔案 `backend/dist/worker.js`（已列入 `.gitignore`）。
- `.env.example`：需要設定的變數清單（**不要**建立含真實值的 `.env` 並提交）。

## 部署（Cloudflare Workers）

```bash
node scripts/build-worker.mjs               # 在儲存庫根目錄執行，產生 backend/dist/worker.js
npm i -g wrangler
cd backend
wrangler secret put PROVIDER_API_KEY        # 互動輸入，不會寫入檔案
wrangler deploy dist/worker.js --name pea-proxy --compatibility-date 2026-01-01 \
  --var PROVIDER:openai --var MODEL:<供應商官方模型 ID> --var ALLOWED_ORIGIN:https://<你的 GitHub Pages 網域> \
  --var MAX_OUTPUT_TOKENS:8000 --var UPSTREAM_TIMEOUT_MS:60000
```

`MODEL`、`PROVIDER_API_KEY`、`ALLOWED_ORIGIN` 是必填，少一個 Worker 就對所有請求回 500。`PROVIDER` 預設 `openai`；`MAX_OUTPUT_TOKENS`（預設 8000）與 `UPSTREAM_TIMEOUT_MS`（毫秒，預設 60000）是選用，上面寫出預設值方便調整，不需要時可以拿掉。

`MODEL` 請以各供應商官方模型列表為準；本專案未在真實模型上驗證代理（列為待驗證）。速率限制使用 Worker 記憶體，僅為示範；正式使用請改用 Cloudflare Rate Limiting 或 KV／Durable Objects（見上面「不可直接上線」）。

前端接法（示意，未內建於本站）：

```js
const r = await fetch('https://<worker>/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bundle }) });
```

## 其他選項

- Vercel／Netlify Functions：同樣邏輯，金鑰放環境變數。
- 企業內部：以既有 API gateway 承載，並加上 SSO。
