# 模型側守門的規則說明由建置從 schema 寫進核心提示詞

在聊天介面上，授權範圍的檢查由模型依核心提示詞執行（模型側守門，見 `GLOSSARY.md`），模型手上只有提示詞，沒有 `input-schema.json`。所以規則要寫進提示詞，而且只能有一個來源：`skills/shared/input-schema.json` 的 scope 定義。

`assets/scope-gate.js` 的 `scopeRuleNote()` 從 scope 定義產生規則說明，建置把它寫成「- scope 必填欄位的規則：<說明>。」，放進核心提示詞母本（`core-prompt.md` 第 0 節）與三份改寫版（Custom GPT 指示、Codex 與 Claude 的 `SKILL.md`）裡以這個開頭辨識的那一行（規則說明行，見 `GLOSSARY.md`）；每個檔案須恰好一行。核心提示詞的其他使用端（各平臺系統提示詞與 `SKILL.md` 的嵌入區塊、選用後端代理、`api-workflow.py`）因此自動帶到同一行。Python 分析工作流程核心的 `scope_rule_note` 是對等的另一份（附在中止訊息後面），兩份對同一個字面字串做斷言。說明必須涵蓋每條規則，寫不出來的就丟出錯誤，不退回比較寬鬆的說明。驗收 8（scope 不合格應拒絕）在對話介面人工判讀。

理由：

- 規則只有一個來源才不會和 schema 漂移；#52 之前程式改了規則、提示詞從來沒跟上。
- 建置維持只用 Node（`README.md`）；JS 這邊本來就有一份 schema 解讀（ADR 0004），規則說明是同一份解讀的另一種輸出。
- 母本裡放一行建置產生的內容，所有使用端與直接貼上 `core-prompt.md` 的人都拿得到同一行。核心提示詞與 Custom GPT 指示在 ```text 區塊外面附一行「勿手動編輯」的 HTML 註解，模型讀不到；兩份 `SKILL.md` 整份都會被模型讀到，所以不加註解（否則對有 shell 權限的 Codex 等於多一道「執行建置」的指示），改由測試，以及 CI「重建後整份工作樹必須沒有變動」的檢查，擋下手改或忘了重建。
- 寫不出來就丟錯，和 ADR 0004 的理由相同：規則說明是模型側守門唯一的規則來源，退回寬鬆的說明就等於默默放寬守門。

## Considered Options

- **建置呼叫 `python3` 跑 `scope_rule_note`**：否決。說明只有一份程式產生，但建置要多依賴 Python，`pages.yml` 與從 Windows 本機建置的人都要裝。
- **手寫說明，加一致性檢查**（比照評分規則的 `scoring-rules.mjs`）：否決。規則改了要手改核心提示詞與三份改寫版。
- **母本只放佔位字串，由各使用端替換**：否決。替換點有三處（建置、Worker 建置、Python 執行時），直接貼上母本的人會看到佔位字串。
- **另開一個規則說明的母本，由各平臺另外附上**：否決。聊天介面的使用者要多貼一份，Custom GPT 要多放一個 Knowledge 檔。
- **在 `api-workflow.py` 加略過授權範圍守門的旗標，讓 Actions 自動驗收模型**：否決。等於在安全守門旁開一道後門。

## Consequences

- 改 scope 規則時，若用到規則說明還不會描述的規則（例如其他 pattern、`minLength` 大於 1），`scopeRuleNote()` 與 `scope_rule_note` 兩份都要實作，否則建置與守門的中止訊息都會丟出錯誤。
- Custom GPT 指示多了一行（約 150 字）；Instructions 欄位的字數上限仍未經官方查證。
- 模型側守門只能拒絕分析，擋不住資料送出；在真實模型驗收（`data/sources.js` 的待驗證項目）完成之前，它的效果尚未驗證。
