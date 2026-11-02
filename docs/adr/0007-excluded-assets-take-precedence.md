# 排除清單用 excluded_assets，排除優先；excluded 只是文字限制事項

授權範圍原本只有 `excluded`，schema 只寫它是字串陣列，沒說用途。合成資料把它寫成文字（「產線 PLC 與 HMI（僅可讀取 MES 相關資料，不得對 OT 提出主動測試）」），示範引擎只把它抄進驗證計畫的範圍排除；資產篩選完全只看 `in_scope_assets`。外部稽核（#146）指出：同一資產同時列在允許清單與 `excluded` 時，示範引擎仍分析它、送往模型前的篩選也照樣送出。

決定：

- 新增選填的 `authorized_scope.excluded_assets`（資產識別碼陣列）。允許分析的資產＝`in_scope_assets` 減去 `excluded_assets`；同一資產兩邊都有時**排除優先**。
- `excluded` 維持原樣，明定為文字限制事項，不參與篩選。
- 三處篩選共用同一條規則：示範引擎（`assets/demo.js`）、送往模型前的篩選（`assets/scope-gate.js` 的 `scopedBundle`，後端代理也用它）、Python 分析工作流程核心（`scoped_files`）。JS 的 `allowedAssets` 與 Python 的 `allowed_asset_ids` 是同一條規則的兩份實作，由 `tests/fixtures/scoped-bundle-cases.json` 的共用案例守住一致。
- `excluded_assets` 不放進必填欄位，所以授權範圍守門（ADR 0004）與規則說明行（ADR 0005）都不變。

## Considered Options

- **把 `excluded` 改成資產識別碼**：否決。既有的 scope 檔都把它寫成文字，改語意會讓舊檔的文字被當成識別碼比對（比不到任何資產，等於沒排除），使用者也看不出差別。
- **兩邊重疊就拒絕分析**：否決（#146 的決定）。排除的意圖很明確，照排除處理比要求使用者先修正設定更安全；重疊另以腳本預檢的異常列出。
- **讓授權範圍守門也檢查 `excluded_assets`**：否決。守門只檢查必填欄位（ADR 0004），擴大到選填欄位要兩份解讀與規則說明一起改；格式不符改由腳本預檢列為必要問題。

## Consequences

- 腳本預檢多兩種發現：`EXCLUDED_ASSET`（排除清單覆蓋允許清單，異常，列在 `assets.csv`）與 `INVALID_EXCLUDED_ASSETS`（`excluded_assets` 不是非空白字串的陣列，必要問題，列在 `scope.json`）。依 #59，必要問題只讓 Claude／Gemini 技能的 `validate_inputs.py` 以結束碼 1 結束，API 腳本仍不阻擋；格式不符的項目不會被排除。
- JS 端（示範引擎、後端代理）遇到格式不符的 `excluded_assets` 視同空清單，不另外警告。後端代理部署前的輸入檢查列在 #151。
- 合成資料不加 `excluded_assets`，示範快照與驗收預期不變。
