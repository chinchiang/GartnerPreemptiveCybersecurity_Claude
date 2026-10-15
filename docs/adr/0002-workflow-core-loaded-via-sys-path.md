# 分析工作流程核心用 sys.path 從 skills/shared/ 載入，不複製到各平臺

Python 的分析工作流程核心放在 `skills/shared/analysis_workflow.py`。各平臺的 `api-workflow.py` 依自身位置找到 `skills/shared/`，加進 `sys.path` 後載入，**不**比照 ADR 0001 的複本做法，把它複製進每個平臺目錄。技能包組裝器把核心列為這些平臺的依賴，隨技能包 ZIP 一起出貨；ZIP 維持 repo 目錄結構，解壓後同樣找得到。

理由：平臺腳本執行時本來就要讀 `skills/shared/` 的核心提示詞與 schema，平臺目錄從來不是單獨可跑的；複製只會多出數份 Python 複本，也得為 `.py` 另訂一種複本標註，換不到任何好處。

## Considered Options

- **由建置把核心複製到每個平臺目錄，直接 `import`**：否決。理由如上；而且複本一多，Python 這邊又回到「改一處要同步多份」的狀態，正是這次重構要消除的問題。
