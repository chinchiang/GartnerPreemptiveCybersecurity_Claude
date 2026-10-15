# 複本由建置產生，並且提交進 git

各平臺技能包 `references/` 裡的複本（schema、task-spec、acceptance、scoring-rules）由 `npm run build` 從 `skills/shared/` 的母本產生，而且**連同產物一起提交**，不加進 `.gitignore`。理由：

- `git clone` 之後技能資料夾要能直接使用；技能包脫離 repo 時仍要讀得到完整規格（各 SKILL.md 的承諾）。
- 網站與 `file://` 讀的是已提交的檔案。

## Considered Options

- **複本加進 `.gitignore`，只出現在 ZIP 與網站資料**：否決。`git clone` 拿到的技能資料夾會缺檔，指南寫的「或 `git clone` 儲存庫」就失效了。
- **刪除複本，讓技能直接引用 `skills/shared/`**：否決。技能包一旦脫離 repo 就讀不到規格。

## Consequences

複本不能手改，只能改母本後重建。CI 先重建，再對 `data/`、`downloads/`、`skills/` 執行 `git diff --exit-code`：忘記重建或直接改了複本，都會擋下 PR。
