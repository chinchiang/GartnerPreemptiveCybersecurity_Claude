# 授權範圍守門由兩份自寫的 schema 解讀執行，不用 JSON Schema 函式庫

授權範圍守門的規則只寫在 `skills/shared/input-schema.json` 的 scope 定義裡。執行規則的有兩份自寫的「schema 解讀」：Python 分析工作流程核心的 `_check`，以及 `assets/scope-gate.js`（示範引擎與選用後端代理共用）。兩份只認得同一組關鍵字：`type`、`required`、`properties`、`minLength`、`minItems`、`format`（只支援 `date`）、`pattern`、`items`；遇到其他關鍵字就丟出錯誤，`default`、`description`、`title`、`$comment` 這類註記關鍵字放行。`scope-gate.js` 讀的 scope 定義由建置以嵌入區塊寫入（比照 ADR 0001，提交進 git）。兩份解讀由 `tests/fixtures/scope-cases.json` 的共用案例守住一致。

理由：

- 不能用現成的 JSON Schema 函式庫（JS 的 ajv、Python 的 jsonschema）。Python 核心只能用標準函式庫，因為 Claude 技能資料夾會被單獨安裝（ADR 0003）。網站要能從 `file://` 直接開，沒有打包工具，`npm test` 也不需要 `npm install`，repo 沒有任何執行時套件。
- 選用後端代理獨立部署，讀不到 schema 檔；示範引擎在瀏覽器裡也讀不到。嵌入區塊讓 `scope-gate.js` 本身就帶著 scope 定義，四種執行環境（瀏覽器、Node 的 `require`、Node 的 `vm`、部署的 Worker）都不用另外供應 schema。
- 遇到不認得的關鍵字就丟出錯誤，是為了防止 #52 那類 bug：schema 早就寫了 `format: date` 與 `items`，三份實作卻都默默略過。

## Considered Options

- **用 JSON Schema 函式庫**：否決，理由見上。
- **建置時從 schema 產生 JS 檢查程式碼**：否決。產生器本身就是另一份「怎麼解讀 schema」的程式，產出的程式碼也比較難讀、難測。
- **建置把 schema 轉成精簡的規則表，JS 用一個小函式套用**：否決。多了一種中間格式要維護，解讀的邏輯只是換個地方放。
- **示範引擎與選用後端代理各自手寫規則**（#52 之前與當時的做法）：否決。規則有三處要同步，共用案例只能抓到它涵蓋到的情況。

## Consequences

- 改守門規則只改 schema。要用到新的關鍵字時，Python 核心與 `scope-gate.js` 兩份解讀都要實作，否則共用案例會因為「不認得的關鍵字」失敗。
- 兩份解讀對 `pattern` 的正規表示式語意必須一致；schema 的 pattern 要避開兩邊語意不同的寫法（例如 `\s`、`\S`：Python 與 JS 的空白字元範圍不同，見 PR #54）。
