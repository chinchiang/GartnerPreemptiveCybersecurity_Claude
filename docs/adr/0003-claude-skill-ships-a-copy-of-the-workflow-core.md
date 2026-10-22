# Claude 技能附一份建置產生的分析工作流程核心複本

> 範圍已由 ADR 0006 擴大：例外適用於所有附 `validate_inputs.py` 的技能資料夾（Claude、Gemini），`validate_inputs.py` 的母本也搬到了 `skills/shared/`。以下是當時的決定，未改動。

Claude 技能的 `validate_inputs.py` 改用分析工作流程核心，但**不**依 ADR 0002 從 `skills/shared/` 載入：建置把 `skills/shared/analysis_workflow.py` 複製成 `skills/claude/preemptive-exposure-analysis/scripts/analysis_workflow.py`（檔首一行 `#` 標註，比照 ADR 0001 的複本，同樣提交進 git），`validate_inputs.py` 載入同目錄的這份複本，守門規則讀技能內的 `references/input-schema.json`。這是 ADR 0002 的例外，只適用於 Claude 技能。

理由：ADR 0002 的前提是「平臺資料夾從來不是單獨可跑的」，四支 `api-workflow.py` 確實如此；Claude 技能卻不是。它的三種安裝方式（複製到 `.claude/skills/`、壓成 zip 上傳 claude.ai、以 API 上傳）都只帶走 `preemptive-exposure-analysis/` 這一個資料夾，`references/` 的複本本來就是為此存在。從 `skills/shared/` 載入核心，會讓三種安裝方式下的 `validate_inputs.py` 全部失效。

## Considered Options

- **照 ADR 0002 以 `sys.path` 從 `skills/shared/` 載入**：否決。只有 repo 與 repo 的技能包 ZIP 能跑，指南寫的三種安裝方式都會壞；改成要求使用者連 `skills/shared/` 一起複製，又違背 Agent Skills「一個資料夾就是一個技能」的格式。
- **`validate_inputs.py` 維持獨立實作，只靠共用測試守住一致**：否決。Python 這邊的守門與資料完整性檢查會一直有兩份，正是這次重構要消除的問題。

## Consequences

只多一份 `.py` 複本，規則仍只有一份母本。複本不能手改：CI 重建後整份工作樹必須沒有變動，忘記重建或直接改了複本都會擋下 PR（同 ADR 0001）。核心只能用標準函式庫、不得假設自己位在 `skills/shared/` 才能載入（模組層級的路徑常數只有 `main()` 一路會用到）；`validate_inputs.py` 只用載入、守門與檢查的函式。
