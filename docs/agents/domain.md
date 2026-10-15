# 領域文件

各工程技能探索程式碼時，如何使用本 repo 的領域文件。

## 探索前先讀

- 根目錄的 **`GLOSSARY.md`**：本 repo 的詞彙表。技能文件寫 `CONTEXT.md` 時，在本 repo 一律指 `GLOSSARY.md`；不要另外建立 `CONTEXT.md`。
- **`docs/adr/`**：讀和你要動的區域相關的 ADR。

上述檔案若不存在，**直接繼續，不必提出來**，也不要事先建議建立。`/domain-modeling` 技能（經由 `/grill-with-docs`、`/improve-codebase-architecture` 進入）會在詞彙或決策真正定案時才建立它們，詞彙一律寫進 `GLOSSARY.md`。

## 檔案結構

單一 context：

```
/
├── GLOSSARY.md
├── docs/adr/
│   └── 0001-<slug>.md
└── …
```

## 使用詞彙表的用語

輸出內容提到領域概念時（issue 標題、重構提案、假設、測試名稱），使用 `GLOSSARY.md` 定義的詞，不要換成詞彙表列在 _Avoid_ 的同義詞。

需要的概念還不在詞彙表裡，代表兩種情況之一：你在發明專案沒在用的說法（請重新考慮），或詞彙表真的有缺口（記下來交給 `/domain-modeling`）。

## 標示與 ADR 衝突

輸出內容若和既有 ADR 牴觸，要明確標示出來，不要默默推翻：

> _與 ADR-0007 牴觸，但值得重新討論，因為……_
