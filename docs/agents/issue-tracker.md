# Issue tracker：GitHub

本 repo 的 issue 與規格都放在 GitHub Issues，一律用 `gh` CLI 操作；`gh` 會從 `git remote -v` 自動判斷 repo。

## 慣例

- **建立 issue**：`gh issue create --title "..." --body "..."`；多行內容用 heredoc。
- **讀取 issue**：`gh issue view <number> --comments`，並一併取得標籤。
- **列出 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，依需要加上 `--label`、`--state` 篩選。
- **留言**：`gh issue comment <number> --body "..."`
- **加上／移除標籤**：`gh issue edit <number> --add-label "..."`／`--remove-label "..."`
- **關閉**：`gh issue close <number> --comment "..."`
- Issue 標題與內文使用正體中文、臺灣慣用語，領域名詞依 `GLOSSARY.md`。

## Pull request 是否視為需求來源

**PRs as a request surface: no.**（若要把外部 PR 當成功能需求送進 triage，改成 `yes`；`/triage` 會讀這個旗標。）

設為 `yes` 時，PR 走與 issue 相同的標籤與狀態，改用對應的 `gh pr` 指令：

- **讀取 PR**：`gh pr view <number> --comments`，diff 用 `gh pr diff <number>`。
- **列出待 triage 的外部 PR**：`gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`，只保留 `authorAssociation` 為 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR`、`NONE` 的項目（排除 `OWNER`／`MEMBER`／`COLLABORATOR`）。
- **留言／標籤／關閉**：`gh pr comment`、`gh pr edit --add-label`／`--remove-label`、`gh pr close`。

GitHub 的 issue 與 PR 共用同一組編號，單寫 `#42` 可能是兩者之一：先試 `gh pr view 42`，失敗再改用 `gh issue view 42`。

## 技能說「發布到 issue tracker」時

建立一個 GitHub issue。

## 技能說「取得相關 ticket」時

執行 `gh issue view <number> --comments`。

## Wayfinding 操作

供 `/wayfinder` 使用。**map** 是一個 issue，底下的 **child** issue 就是各張 ticket。

- **Map**：一個標上 `wayfinder:map` 的 issue，內文包含 Notes／Decisions-so-far／Fog。建立方式：`gh issue create --label wayfinder:map`。
- **Child ticket**：以 GitHub sub-issue 連到 map（透過 `gh api` 的 sub-issues endpoint）。沒有開啟 sub-issue 時，把 child 加進 map 內文的任務清單，並在 child 內文開頭寫 `Part of #<map>`。標籤用 `wayfinder:<type>`（`research`／`prototype`／`grilling`／`task`）。認領後指派給負責的開發者。
- **相依（blocking）**：以 GitHub **原生 issue dependencies** 為準，在網頁介面上看得到。新增方式：`gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`。其中 `<blocker-db-id>` 是 blocker 的數字 **database id**，用 `gh api repos/<owner>/<repo>/issues/<n> --jq .id` 取得，不是 `#number`，也不是 `node_id`。GitHub 會在 `issue_dependencies_summary.blocked_by` 回報仍開啟的 blocker 數量。無法使用 dependencies 時，改在 child 內文開頭寫 `Blocked by: #<n>, #<n>`。所有 blocker 都關閉後，ticket 才算解除封鎖。
- **Frontier 查詢**：列出 map 底下仍開啟的 child（`gh issue list --state open`，範圍限定在 map 的 sub-issue 或任務清單），排除還有開啟中 blocker 的（`issue_dependencies_summary.blocked_by > 0`，或 `Blocked by` 那行列的 issue 仍開啟）以及已被指派的；依 map 中的順序取第一張。
- **認領**：`gh issue edit <n> --add-assignee @me`，這是工作階段的第一個寫入動作。
- **完成**：`gh issue comment <n> --body "<answer>"`，接著 `gh issue close <n>`，最後在 map 的 Decisions-so-far 補上一行脈絡指標（摘要＋連結）。
