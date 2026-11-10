# 輸出判定由兩份自寫的實作執行，判定順序由共用案例守住

模型輸出解析後的輸出判定（見 `GLOSSARY.md`）有兩份實作：Python 分析工作流程核心的 `output_verdict`（API 腳本用），以及 `scripts/output-verdict.mjs` 的 `outputVerdict`（選用後端代理內嵌）。兩份都依序對照 `skills/shared/output-schema.json`、內容一致性與分數表，回傳第一個失敗的種類（`output_schema_invalid`、`output_inconsistent`、`score_table_mismatch`）與問題，全部通過就回傳空值。每一份裡面又各有三對逐步的實作：`output_problems`↔`outputProblems`（自寫的 schema 解讀）、`output_consistency_problems`↔`outputConsistencyProblems`、`score_table_problems`↔`scoreTableProblems`。

判定順序由 `tests/fixtures/verdict-cases.json` 守住，逐步的規則由 `output-cases.json`、`consistency-cases.json`、`score-problems-cases.json` 守住，兩種語言跑同一份案例。

理由：

- 跟 ADR 0004 相同，不能用 JSON Schema 函式庫。Python 核心只能用標準函式庫（ADR 0003、0006）；選用後端代理是單一檔案的 Worker，`scripts/build-worker.mjs` 把 `output-verdict.mjs` 內嵌進去，所以這個檔案不能有 import，只能用 `export function` 宣告。
- 兩條路徑各自寫判定順序時，順序已經不一致過：#275 之前，Python 把一致性與分數表的問題合併成一則錯誤，JS 則先回一致性的問題。逐步的共用案例測不到順序，所以要另外一份判定案例。
- schema 解讀遇到不認得的關鍵字就丟出錯誤，理由同 ADR 0004（防止 #52 那類默默略過）。

## Considered Options

- **擴大 ADR 0004 的範圍，把輸出 schema 也寫進去**：否決。ADR 0004 的標題與內容都只講授權範圍守門；輸出判定還多了內容一致性與分數表兩層，硬塞進去會讓它失焦。
- **各自寫判定順序，只用逐步的共用案例**（#275 之前的做法）：否決，理由見上。
- **把判定順序寫成資料（例如步驟清單），兩邊各寫一個小函式套用**：否決。只有三個步驟，多一種中間格式不划算；判定案例已經能抓到順序不一致。

## Consequences

- 改判定順序或新增失敗種類時，兩份實作與 `verdict-cases.json` 要一起改；後端代理的 502 回應用 `error` 欄位放失敗種類，對外的格式也跟著變。
- `scripts/acceptance.mjs` 要逐層列出所有問題，不用輸出判定，直接呼叫逐步的函式；逐步的函式因此仍然從 `output-verdict.mjs` 匯出。
- 從模型回應抽出 JSON（Python 的 `parse_json_loose`、JS 的 `lastJsonBlock`）與回覆完整性的檢查（`require_complete`、`INCOMPLETE`）不在判定裡，兩邊的規則本來就不同；`INCOMPLETE` 清單的同步見 #276。
- 判定不攔例外。schema 解讀只在陣列的 schema 有 `items` 時才逐項檢查，不沿著沒有限制的資料往下走，所以遞迴深度只受 schema 的結構限制，模型輸出巢狀再深也不會在判定時超過呼叫堆疊（#281；共用案例 `output-cases.json` 的 `nest` 守住）。呼叫端仍要處理例外，因為解析與序列化 JSON 也是遞迴的：後端代理把檢查時的例外當成 `output_unparseable`，現在會走到那裡的主要是程式錯誤（例如 schema 用了不支援的規則），也回 502，跟 API 腳本不同；API 腳本的 `save_outputs` 用同一個 `except RecursionError` 包住解析、判定與序列化 JSON（巢狀太深時哪一步先超過呼叫堆疊依 Python 版本而定），比照判定失敗保留原始回應並以結束碼 4 結束；其他例外（例如 schema 用了不支援的規則）是程式錯誤，照舊往外丟（#278）。序列化那一步只有 Python 3.12 測得到，所以 CI 的 verify job 用 3.11 與 3.12 各跑一次 Python 測試。
