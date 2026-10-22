# 附 validate_inputs.py 的技能資料夾（Claude、Gemini）都附核心複本，validate_inputs.py 的母本搬到 skills/shared/

ADR 0003 的例外（技能資料夾附一份建置產生的分析工作流程核心複本，不依 ADR 0002 從 `skills/shared/` 載入），從 Claude 擴大到所有**附 `validate_inputs.py` 的技能資料夾**：目前是 Claude 與 Gemini。其他有 SKILL.md 的平臺（Codex、GLM、DeepSeek）的技能資料夾也會被單獨複製到宿主，但沒有腳本要執行，只靠 `references/` 的複本，不受這個例外影響。

Gemini 的技能資料夾照 Claude 的寫法：手寫 SKILL.md，`scripts/` 放 `validate_inputs.py` 與它載入的核心。兩個資料夾的 `validate_inputs.py` 內容相同，所以母本從 `skills/claude/preemptive-exposure-analysis/scripts/` 搬到 `skills/shared/validate_inputs.py`。建置把它和 `analysis_workflow.py` 一起複製到兩個技能的 `scripts/`，檔首加一行 `#` 標註（比照 ADR 0001 的複本）。對照表以 `SKILL_FOLDER_SCRIPTS` 宣告這兩支，Claude 與 Gemini 共用同一份宣告。

理由：Antigravity 與 Gemini CLI 安裝技能的方式（複製到工作區的 `.agents/skills/`、`gemini skills install --path <子目錄>`）都只帶走 `preemptive-exposure-analysis/` 這一個資料夾，跟 ADR 0003 裡 Claude 的三種安裝方式是同一種情況。

## Considered Options

- **Gemini 的技能資料夾照 GLM／DeepSeek 的寫法，只放嵌入的核心指令與 `references/`，不附腳本**：否決（#109 的 Q7）。Antigravity 與 Gemini CLI 都能讀檔、執行指令，附上 `validate_inputs.py`，模型照 SKILL.md 先執行它時，scope 的判定就由腳本做（與 API 腳本同一套規則），不靠模型自己讀規則判斷。
- **Gemini 放一份手寫的 `validate_inputs.py`**：否決（#109 的 Q8）。兩份會漂移，違背單一來源。
- **母本留在 Claude 的資料夾，Gemini 從那裡複製**：否決（#109 的 Q8）。母本會變成「放在平臺目錄裡的檔案」，對照表得另外處理這個例外。

## Consequences

- Claude 技能裡 `scripts/validate_inputs.py` 的路徑不變，但從手寫檔變成生成檔，不能手改；改 `skills/shared/validate_inputs.py` 再建置。
- 母本本身不直接執行：它讀的規則來源是技能內的 `references/input-schema.json`，`skills/shared/` 底下沒有 `references/`。
- Gemini 另外有 `skills/gemini/api-workflow.py`，它仍照 ADR 0002 從 `skills/shared/` 載入核心，所以 Gemini 的技能包 ZIP 跟其他有 `api-workflow.py` 的平臺一樣帶上母本。技能資料夾與 API 腳本各用各的載入方式。
- 以後再有附 `validate_inputs.py` 的技能資料夾，在對照表那一列用 `SKILL_FOLDER_REFERENCES` 與 `SKILL_FOLDER_SCRIPTS` 即可，並把它的 SKILL.md 加進規則說明行的目標（ADR 0005）。
