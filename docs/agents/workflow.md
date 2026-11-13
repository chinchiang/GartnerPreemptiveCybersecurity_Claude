# 工作流程：測試、建置、驗證與 PR

這份是本 repo 環境裡查不到、卻會讓結果出錯的做法。指令本身以 `package.json` 的 `scripts` 與 `.github/workflows/` 為準。

## 執行測試與建置：直接用 `node`／`python3`

在 WSL 下，`npm` 會解析到 Windows 版，`npm test` 會顯示 0 個測試、看起來像通過。所以一律直接呼叫，與 `package.json` 的 scripts 和 CI 的步驟等價：

| 用途 | 指令 |
|---|---|
| JS 單元測試 | `node --test scripts/*.test.mjs` |
| Python 測試 | `python3 -m unittest discover -s tests/python` |
| 建置 | `node scripts/build-data.mjs` |
| 選用後端代理 | `node scripts/build-worker.mjs && node --check backend/dist/worker.js` |
| 靜態驗證 | `node scripts/verify.mjs --static`（只印結果，不寫檔） |
| 全套檢查 | `node scripts/full-check.mjs --out scratch/<n>/full-1 [--browser] [--node22 <路徑>] [--timeout <秒>]`（在 WSL 的 bash 執行） |

**全套檢查**（PR 的 Evidence 用）：`scripts/full-check.mjs` 依序跑本機 `node`、Node 22、`node.exe`（Windows）三個環境的單元測試、Python 測試、靜態驗證與重建，`--browser` 另外用 `node.exe` 跑完整的瀏覽器檢查（跑完把報告與截圖還原）。摘要寫到 `<前綴>.txt`、每一步的完整輸出寫到 `<前綴>-<步驟>.log`；前綴用掉了會自動換下一個號碼。結束碼 0 全過、1 有失敗（含讀不到摘要、逾時、重建改動了工作樹）、2 參數有誤、3 只有略過。PR 說明的 Evidence 引用摘要檔的內容，並註明那是哪個 commit 跑的（摘要第一行有 HEAD 的 SHA）。只支援 Linux／macOS，在 Windows 那一側執行會以 2 結束。

測試裡以子行程執行 `node --test` 時，env 要拿掉 `NODE_TEST_CONTEXT`：外層的 `node --test` 會設它，內層繼承之後改用子行程模式，測試失敗也以 0 結束。

CI 的 Python 測試在 verify job，不在 unit job：Python 版本與步驟以 `ci.yml` 為準，寫 CI 的事實之前先看它或 job log。行為依 Python 版本而異時，CI 有的版本都要跑；Windows 本機有 `py -3.12`、`py -3.13`，沒有 3.11。遞迴上限就依版本而異（實測）：`json.loads` 在 3.12、3.13 約 3000 層；`json.dumps(indent=2)` 在 3.12 約 1000 層就超過，3.13 到 2500 層仍寫得出來。深層巢狀的測試案例用字串拼接，或用共用案例的 `nest` 欄位產生，不要經過測試自己的序列化。

本機的 `node` 可能比 `engines` 的下限 22 新。改到依 Node 版本而異的行為時（例如 `node --test` 在非 TTY 時的預設輸出：22 是 TAP、24 是 spec），兩版都要跑：CI 的 unit job 以 matrix 跑 22 與 24；本機沒有 22 時，從 nodejs.org 下載官方 tarball、核對 SHA256，解壓到 `scratch/node22/`（例如 `scratch/node22/node-v22.23.4-linux-x64/bin/node`）。全套檢查沒給 `--node22` 時會自動找那裡，有多個版本取最新的：

```bash
mkdir -p scratch/node22 && cd scratch/node22
curl -fsSLO https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt
f=$(grep -o 'node-v22[^ ]*-linux-x64.tar.xz' SHASUMS256.txt | head -1)
curl -fsSLO "https://nodejs.org/dist/latest-v22.x/$f" && grep " $f\$" SHASUMS256.txt | sha256sum -c - && tar -xJf "$f"
```

改到行程、路徑、shell 相關的行為時，Windows 也要跑：CI 的 unit job 另以 `windows-latest` 跑 Node 24。在 WSL 本機可以直接用 Windows 版的 `node.exe`（WSL 的 PATH 上就有）執行 `node.exe --test scripts/*.test.mjs`；repo 是以 `\\wsl.localhost\…` 的 UNC 路徑開啟的，測試的暫存目錄在 Windows 的 `%TEMP%`。


完整的瀏覽器檢查不要跟完整的 Python 測試同時跑：資源不夠時，會在關閉瀏覽器那一步逾時。JS 單元測試可以跟 Python 同時跑。完整的 Python 測試單獨跑約 140～600 秒，跟其他工作同時跑時曾經跑到 1020 秒，背景執行時要等它結束，再跑瀏覽器檢查。
完整的瀏覽器檢查（`node scripts/verify.mjs`）在 Windows 這一側可以本機執行，不必 push 之後等 CI：

| 環境 | 狀態 |
|---|---|
| Windows（Git Bash、PowerShell） | 可用。`node_modules/` 要有 `npm ci` 裝的 `playwright@1.56.1`（clone 之後沒有，要先裝；它是純 JS，見下段），`%LOCALAPPDATA%\ms-playwright\` 有它要的 chromium 1194。換了 lockfile 的版本就重跑 `npm ci` 與 `npx playwright install chromium`。結果和 CI 一致（報告除了執行時間逐行相同） |
| WSL（Ubuntu 26.04） | 還不能用。Playwright 1.56.1 不支援這個版本，`install-deps` 會拒絕，要手動 `sudo apt install libnss3 libnspr4 libasound2t64`；再用 Linux 版 node 同目錄的 npm（`~/.local/opt/node-v24.19.0-linux-x64/bin/npm`，PATH 上的 `npm` 是 Windows 版）執行 `npx playwright install chromium-headless-shell`。尚未實測（#73） |

只改到部分情境時，可以先用 `node.exe scripts/verify.mjs --only <情境>[,<情境>]` 在本機迭代：只跑指定的瀏覽器情境（名稱見 `scripts/verify.mjs` 的 `SCENARIOS`，有空白的名稱要加引號），不跑靜態檢查、不寫報告。PR 之前仍要跑完整驗證。

`playwright` 套件是純 JS，兩側共用同一份 `node_modules/`；瀏覽器各自裝在各自的快取。

完整模式每次先將報告與截圖寫入獨立的 `scratch/verification-runs/run-*/`，並更新 `verify-report.md`；全部通過才更新 `verify-screenshots/`。失敗時查終端機印出的本次目錄，CI 也只上傳這個目錄的產物，避免混入舊截圖。情境中斷保留失敗結果並繼續其他獨立情境；資源初始化或骨架執行例外標示未完成，資源關閉錯誤也會列入報告；靜態模式仍只輸出至終端機。截圖的字型與 CI 不同，跑完一律還原：`git checkout -- verify-screenshots/`。報告要和已提交的一致（CI 的 browser job 會比對，只忽略執行時間那一行）：檢查結果沒變就還原；變了就提交，並執行 `node scripts/build-data.mjs`，`data/extra.js` 一起提交（報告嵌入網站附錄）。報告裡不要寫進會隨環境或內容而變的值（例如捲動位置：它取決於字型與版面，本機與 CI 可能不同，上方內容一改也跟著變），否則比對會失敗。

瀏覽器檢查的每個 context 都開 reduced motion（`scripts/browser-checks.mjs` 的 `opener`），網站的 `prefers-reduced-motion` 樣式會關掉 smooth scroll、transition 和 animation，所以同一個 commit 在 CI 上的截圖幾乎每次都位元組相同。偶爾還是會有零星的反鋸齒像素差異：#115 統計了 12 次執行、156 張截圖，有 1 張差 2 個像素，每個色彩通道差 1～2 個色階。要檢查動畫或 smooth scroll 本身的情境，得自己另開 context，不能用 `open`。

### 截圖交叉比對

CI 的 browser job 在完整驗證成功後，用 `scripts/screenshot-diff.mjs` 比對這次產生的截圖與 `HEAD` 已提交的版本：有不同時印一行 warning，job summary 列出每張的 md5、不同像素數、最大單一色彩通道差與差異範圍，也列出新增、尺寸不同、已提交但這次沒有產生、像素相同只有編碼不同，以及解不開的截圖。這一步不讓 job 失敗，也不判定是不是雜訊：單次執行分不出雜訊，所以仍要照下面的方式交叉比對兩次執行。本機不跑這個比對（字型跟 CI 不同）。

網站畫面有變時，用 PR 最後一個 commit 的兩次 CI 執行（push 與 pull_request）交叉比對，把雜訊排除掉，再決定要換哪些截圖（本機的截圖字型不同，照舊一律還原）。pull_request 那次跑的是 PR 跟 `main` 合併後的結果（`refs/pull/<n>/merge`），不是 commit 本身；比對之前，分支要先跟上 `main`（例如 `git merge main` 後再 push），否則兩次執行的差異可能是真的內容不同，不是雜訊：

| 兩次執行彼此 | 跟已提交的比 | 結論 |
| --- | --- | --- |
| 相同 | 相同 | 不用動 |
| 相同 | 不同，或還沒提交過 | 畫面有變，換成 artifact 的版本並提交 |
| 不同 | 其中一次跟已提交的相同 | 雜訊，保留已提交的版本 |
| 不同 | 兩次都跟已提交的不同 | 無法自動判斷：可能畫面有變又剛好碰上雜訊，要看圖，或重跑 CI（對外動作，先取得同意） |

CI 跑完之後，用 `scripts/screenshot-crosscheck.mjs` 照上表分類：

```bash
node scripts/screenshot-crosscheck.mjs --pr <n>                  # PR head
node scripts/screenshot-crosscheck.mjs --pr <n> --sha <commit>   # PR 裡較早的 commit
```

它會找出那個 commit 在 PR 分支上的 push 與 pull_request 兩次 `ci.yml` 執行，兩次都要已經跑完、而且通過；接著下載 artifact 到 `scratch/screenshot-crosscheck/pr-<n>-<sha7>/`，每次執行一個子目錄（含重跑的次數，已經下載過就沿用），再跟那個 commit 已提交的截圖比對。比對用 `git show`，不看工作樹，所以不必先 checkout。`head_sha` 篩選偶爾會回傳空的結果、不報錯（#118），它會自動重試。stdout 印出的 markdown 直接貼進 PR 說明的 Merge Danger，內容有：
- 依結論分組的截圖，以及三邊檔名的差異：只有一次執行產生、已提交但這次沒有產生。
- 「畫面有變」的截圖各自列出 PR 改到的來源。
- 每張不是「不用動」的截圖，跟已提交版本的像素差異。

「PR 改到的來源」算到那個 commit 為止（`git diff <base>...<commit>`）。它只報告，不換截圖也不 commit。只有一次執行可用時（例如只 push、沒開 PR，或一次的 artifact 過了保留期限），它會寫明缺哪一次，退回單次比對；跟已提交的不同的截圖，換之前要先看圖，確認不是零星的像素差異。

兩次執行剛好拿到同一個雜訊版本時，會被分成「畫面有變」，其實畫面沒變。雜訊不是每次都不同，而是在少數幾個固定版本之間輪流出現：`io.png`（`#/io` 頁）在 PR #173 與 #174 的六次執行裡只出現過兩個版本，各 3 次，彼此只差 2 個像素，每個色彩通道差 1～2 個色階。PR #173 的兩次執行各拿到一個；#174 的第一個提交兩次都拿到已提交的那一個，第二個提交兩次都拿到另一個，就被列成「畫面有變」。所以「畫面有變」的截圖，換之前先確認兩件事：

1. **PR 有沒有改到那一頁的來源**：工具會列出來。依據是 `scripts/screenshot-crosscheck.mjs` 的 `SCREENSHOT_SOURCES`（每張截圖讀哪些 `data/*.js`）；改了 `assets/` 或 `index.html` 算影響每一頁。沒改到來源的截圖，會分到「畫面有變，但 PR 沒改到那一頁的來源，要比對以前的 run」那一組。
2. **這個版本以前出現過沒有**：工具不做這一步。下載之前幾次 CI 執行的 artifact，對照 `md5sum`：

```bash
D=scratch/<目錄>
gh run list --workflow=ci.yml --limit 10 --json databaseId,event,headSha --jq '.[] | "\(.databaseId) \(.event) \(.headSha[0:7])"'
gh run download <之前的 run-id> -n verify-report-and-screenshots -D "$D/<之前的 run-id>"
md5sum "$D"/*/verify-screenshots/io.png verify-screenshots/io.png
```

目前看過的 `io.png` 雜訊版本（`md5sum` 的前 8 碼）：`65e1f5ac`（已提交）與 `62320169`，PR #284、#285 都出現過。頁面內容改了之後，這兩個值就不再適用。

兩個都成立（沒改到來源，而且以前出現過）才是雜訊，保留已提交的版本，並在 PR 說明寫出對照的 md5 與 run id。有一個不成立，就照上表的「無法自動判斷」處理：看圖，或重跑 CI（對外動作，先取得同意）。以前的 artifact 可能已過了保留期限；`gh run download` 也可能回 `HTTP 503: Egress is over the account limit`（帳號的傳出流量超過上限），這時同樣照「無法自動判斷」處理，先回報，不要合併。

換了截圖之後（另一個 commit），等 CI 跑完再執行一次 `--pr <n>`，確認新的兩次執行都分到「不用動」。

## Windows 本機（Git Bash）

直接在 Windows 那一側操作時（不經 WSL）：

- **`curl` 連 HTTPS 失敗，出現 `CRYPT_E_REVOCATION_OFFLINE`**：Schannel 連不到憑證撤銷伺服器。讀公開文件時加 `--ssl-no-revoke`，憑證照常驗證，只略過撤銷檢查。WebFetch 回的是小模型的摘要，逐字引文要用 `curl` 下載的原始 HTML 核對（#289 的「SpaceXSI」就是這樣確認的）。
- **`python3 skills/<平臺>/api-workflow.py --dry-run` 以結束碼 1 結束**：cp950 的主控台印不出輸出。指令前面加 `PYTHONIOENCODING=utf-8`；`main` 上也一樣，不是改動造成的。
- **node 讀不到 Git Bash 的 `/tmp` 路徑**：用 `cygpath -m <路徑>` 轉成 Windows 路徑再傳給 node，或把暫存檔放在 `scratch/`。
- **`run_in_background` 跑 `python3 -m unittest …` 會提早回報「已結束」**：Python 還在跑、log 還沒寫完，通知就到了（`until grep …; do sleep; done` 的迴圈也一樣）。指令寫成 `python3 … > <log> 2>&1; echo "exit=$?" >> <log>`，以 log 裡出現 `exit=` 那一行為準，不看通知；前景等用 `until grep -q '^exit=' <log>; do sleep 10; done`。要確認行程還在，用 `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python3.exe'\" | Select-Object ProcessId,CreationDate"`；`tasklist` 在背景迴圈裡會讓迴圈提早結束，不可靠。

## 搜尋：用 `rg`

搜尋用 `rg`（ripgrep），它會套用 `.ignore`，略過建置產生的檔案（`data/` 裡建置寫入的六個、`downloads/`、各平臺 `references/` 的複本、Claude 與 Gemini 技能 `scripts/` 的複本）；要改的是母本或來源。這裡的 `grep` 是 ugrep，和 `git grep` 一樣不讀 `.ignore`，會被內嵌整份文件的 `data/*.js` 淹沒。新增生成檔時，把它加進 `.ignore`，搜尋與詞彙表測試都會跟著略過。

`rg` 預設不搜隱藏目錄：`.out-of-scope/`、`.github/` 要加 `rg --hidden`，或改用 `git grep`。驗收條件寫成 `rg` 時要注意這一點。

## 改檔案：用 Edit／Write，不用 heredoc

多行的修改，或內容含 `\`、反引號、`${…}`、`$`、大量引號時，用 Edit 或 Write，不用 heredoc、`node -e` 或 `python3 -c`：heredoc 會吃掉行尾的反斜線，長腳本可能整段解析失敗；`node -e` 裡含 `\r\n` 或正規表示式反斜線的字串很容易寫錯；在 node 的模板字串裡插入含反引號的文字也要跳脫。一次改很多處時，把修改寫成 `scratch/` 裡的腳本，每筆原文必須恰好出現一處。突變清單的原文也用腳本從檔案裡取，不要手抄。

## 突變測試：`scripts/mutate.mjs`

確認測試真的守得住：把要改壞的地方寫成一份臨時的 JSON 清單（`[{ "file", "from", "to", "note" }]`），放在 `scratch/`（`.gitignore` 已排除，不會提交；`/tmp` 在 WSL 重開機時會被清空），執行 `node scripts/mutate.mjs <清單> [--test "<測試指令>"] [--timeout <秒>] [--json | --markdown]`。工具會先確認測試在突變前通過、每筆原文恰好一處，逐一改壞、跑測試，最後一定還原；抓到時會列出是哪些 `node:test` 測試失敗（名稱與檔名，`--json` 是每筆的 `failed`），寫突變紀錄時不必再手動套一次突變找出紅的是誰。每次跑測試各自計時，預設 600 秒，可以用 `--timeout` 調整（`0` 表示不限時）：超過時間就結束整個測試行程、還原檔案，這一筆記成「逾時」，再跑下一筆。突變可能讓 handle 一直開著時（例如伺服器沒關），測試指令也可以加上 `--test-force-exit`，讓測試跑完就結束，不必等到逾時。有存活或逾時就以結束碼 1 結束。參數或清單有誤（讀不到、不是 JSON、檔案不存在、原文不是恰好一處、`--timeout` 不是 0 或正數），或測試在突變前就失敗或逾時，以結束碼 2 結束，一個檔案都不改。PR 說明的突變紀錄用 `--markdown`：輸出總計一行加「突變｜結果｜紅的測試」表格，直接貼上；要另外處理結果時用 `--json`。預測會存活的突變，跑之前先決定怎麼處理（做法見 CODING_STANDARDS §5），要照跑就先取得同意；驗收條件寫「每一筆都要抓到」時，額外加的也算（#138 自己加的一筆預測存活卻照跑，審查才發現跟驗收條件衝突）。

Windows 上測試指令由 `cmd.exe` 執行，主流程（抓到／存活／逾時、紅的測試、`--json`／`--markdown`）與 Linux 相同，逾時與中斷（Ctrl+C）時都用 `taskkill /T` 結束整棵行程樹；終端機 SIGINT 與 IPC cancel 支援還原；Windows 外部強制終止（SIGTERM、taskkill）不會執行收尾。從 WSL 用 `node.exe` 跑時，`cmd.exe` 不接受 UNC 路徑當目前目錄（會改到 `C:\Windows`），而 `node --test` 的參數是 glob，寫成 UNC 路徑也找不到，所以測試指令要先 `pushd` 到 repo 的 Windows 路徑。在 repo 根目錄、WSL 的 bash 裡，`mutate.mjs` 本身也交給 `node.exe` 執行，替換清單與測試檔即可執行：

```bash
node.exe scripts/mutate.mjs scratch/<清單>.json --test "pushd $(wslpath -w .) && node.exe --test scripts/x.test.mjs" --markdown
```

## 共用內容維護

修改共用內容時，編輯 `skills/shared/` 的母本，再依下一節重建複本與嵌入區塊；這兩類建置產物由建置更新，手寫檔案的其餘部分照常編輯。

規則說明行也由建置更新，即使位於母本中仍以 `skills/shared/input-schema.json` 的 `properties.scope` 為來源。修改授權範圍規則時，依 ADR 0005 更新規則描述能力並重建。複本的提交決策見 ADR 0001。

## 改了來源就重建，產物一起提交

改了什麼來源要重建、要一起提交哪些產物，以部署指南第 5 節的維護表為準（`docs/guides/deployment.md`）。原則是：改完來源就執行 `node scripts/build-data.mjs`，把產生的變動一起提交；CI 建置後會檢查整份工作樹必須沒有變動（生成檔為什麼要提交，見 ADR 0001）。

合併衝突若發生在生成檔（`data/*.js`、ZIP、複本），以重建解決：`git checkout --theirs <檔>`，重建，再 `git add`。手寫檔照實解。

## Commit 與 PR

- **Commit 訊息**：正體中文標題，下面條列說明，結尾附 `Co-Authored-By` 行；關閉 issue 時寫 `Closes #<n>`。
- **PR 說明**：照 `pr` 技能的 Summary／Evidence／Merge Danger 格式；草稿與規格一樣放在 `scratch/`。
- **每一步都等使用者明說**：push、開 PR、在議題或 PR 留言、合併，都要使用者明說才做。合併時 CI 還沒跑完，就先等，不要合併。
- **PR 的驗證表寫最終工作樹的結果**：改完 code-review 的修正之後，對最終的工作樹重跑完整的 JS、Python 與突變測試，再單獨跑 `verify.mjs`。修正前那一輪的結果另外註明。
- **code-review 的發現要抽查**：有些要換環境才重現得了（#278 的第 1 項要用 `py -3.12`），有些會推翻原本的設計（#281 的第 8 項讓修法整個換掉）；要換設計之前，先問使用者。技能可能回來兩份審查（#158 一次回來 3 項與 9 項，內容不重複），兩份都要處理，PR 說明分開列。
- **只改說明文字的 PR**：可以不跑 code-review，但 PR 說明要照實寫明沒跑。Python 測試也可以不重跑，條件是先用 `rg` 確認 `tests/python/` 沒有測試讀到改過的檔案，並在 PR 說明寫明；其他驗證照樣跑。
- **更新 PR 說明**：用 `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@<檔>`。`gh pr edit` 在本 repo 會因 Projects classic 的 GraphQL 錯誤而失敗。
- **確認會關閉哪些 issue**：用 GraphQL 查 `pullRequest.closingIssuesReferences`。它只認 PR 說明裡的 `Closes #<n>`，不認 commit 訊息裡的（commit 訊息的 `Closes` 合併後仍會關閉 issue，只是合併前查不到），所以 PR 說明也要寫 `Closes #<n>`。開 PR 或更新說明後要等幾秒再查，馬上查可能還是空的。
- **分支保護**：`main` 的 ruleset 在 `.github/rulesets/main.json`（套用方式與狀態見部署指南第 3 節）：只能經 PR 合併、`ci.yml` 的 10 個檢查都要通過、分支必須跟上 `main`，沒有略過名單，`gh pr merge --admin` 也不能略過。`mergeStateStatus` 是 `BEHIND` 時，先 `git merge main` 再 push，等 CI 重跑。
- **合併**：先確認 `gh pr checks <n>` 全綠、`mergeStateStatus` 是 `CLEAN`，再照 repo 的格式合併：
  ```
  gh pr merge <n> --merge --subject "Merge pull request #<n>: <標題>" --body "<標題>" --match-head-commit <完整 40 碼 SHA>
  ```
  `--match-head-commit` 只接受完整的 SHA，短 SHA 會被拒。

  刪遠端分支之前，先確認 PR 已經合併（`gh pr view <n> --json state` 是 `MERGED`）：PR 還開著時刪掉 head 分支，PR 會自動關閉，修改不會進 `main`。

  CI 還沒跑完、或看起來卡住時：
  - **等待 CI**：用 `run_in_background` 跑 `gh pr checks <n> --watch --interval 30`，列表裡沒有 pending 就結束，完成時會收到通知，再用 `gh pr checks <n>` 看每個工作的結果。`browser` 是 `needs: [unit, verify]`，那兩個跑完才出現在列表裡：開 PR 當下數到的工作數會比較少，`--watch` 也可能在它出現前就結束。結束後確認列表裡有 `browser`，沒有就再跑一次；回報以最後一次的 `gh pr checks <n>` 為準。要在前景等時，改用每 20 秒查一次的迴圈（結束碼 8 代表還有 pending，最多 20 次，約 8 分鐘，在工具 10 分鐘的上限內；跑完還有 pending 就再執行一次）：
    ```
    for i in $(seq 20); do gh pr checks <n> >/dev/null; [ $? -eq 8 ] || break; sleep 20; done; gh pr checks <n>
    ```
    結束後只要看結論與 `browser` 有沒有出現時，用這行摘要，不必讀完整的列表：
    ```
    gh pr checks <n> --json name,bucket --jq '(group_by(.bucket) | map("\(.[0].bucket) \(length)") | join(", ")), "browser: \([.[] | select(.name=="browser")] | length)"'
    ```
  - **check 一直停在 pending**：`gh pr checks` 的狀態會落後，job 早就完成了還顯示 pending。用 jobs API 看實際的狀態和每個步驟；job id 是 `gh pr checks` 連結裡 `/job/` 後面那段數字。如果所有步驟都已經 `completed`，就是狀態還沒更新，等一下再查。`gh run view <run-id>` 也可能先回報完成、個別 job 卻還在跑，一樣以 jobs API 為準。
    ```
    gh api repos/<owner>/<repo>/actions/jobs/<job-id> --jq '"\(.status) \(.conclusion)", (.steps[] | "  \(.status) \(.conclusion) \(.name)")'
    ```
  - **Install Playwright 那一步逾時失敗**：browser job 的「Install Playwright (from package-lock.json) and Chromium」設了 20 分鐘逾時（整個 browser job 正常不到 6 分鐘，慢但成功的最久約 11 分鐘）。逾時通常是 runner 的套件來源太慢，跟改動無關，只重跑失敗的 job；run id 是連結裡 `/runs/` 後面那段數字。重跑是對外動作，要先取得同意。
    ```
    gh run rerun <run-id> --failed
    ```
  - **Install Playwright 那一步幾秒內就失敗**：訊息是 `Playwright does not support chromium on ubuntu<版本>`，代表 runner image 換了 Playwright 不支援的版本，不是逾時，不要重跑。用下面的指令比對失敗的 run 與上一次通過的 run 的 runner image，把 `ci.yml` 的 browser job 釘在通過的那個版本，再開 issue 追蹤升級 Playwright，升級之後改回 `ubuntu-latest`。
    ```
    gh run view <run-id> --log | grep -m1 -E '^browser.*Image: '
    ```

## Triage

issue 與留言開頭附 AI 產生的聲明，依情境寫：triage 時（例如開 issue、寫 brief、追問、wontfix 的說明）用 `> *This was generated by AI during triage.*`；實作途中（例如補記 brief 沒料到、實作時才定的決定）用 `> *This was generated by AI during implementation.*`。標籤對應見 `docs/agents/triage-labels.md`；`needs-info` 在 repo 裡還沒建立，第一次用到時要先建立。

brief 與驗收條件裡的預期值（報告某一列的說明、計數、突變抓不抓得到）要從實際輸出取得：已提交的 `verify-report.md`，或實際跑一次 `node.exe scripts/verify.mjs --only <情境>`、`node scripts/mutate.mjs`，並寫明來源；只能推算的值標成「預測」。推算的算法常和檢查實際數的東西不同（#104 因此差了一倍）。

驗收條件引用具體的 run、commit 或 artifact 時，先確認用 brief 規定的介面拿得到，並寫明它什麼時候會失效（例如 artifact 的保留期限）。#292 的驗收條件要用 `--pr 290` 看到兩次指定的 run，但那兩次屬於 PR 較早的 commit，`--pr` 只會比對 PR head，實作時只好另外加 `--sha`。

brief 要求的行為，先對照被改 module 檔頭寫的契約（例如輸入的換行、由誰讀檔）。兩者衝突時，在 brief 裡一起決定是改契約還是改要求。#135 的 brief 要求 CRLF 的測試，卻沒對照技能包組裝器 #135 之前的檔頭寫的「所有輸入只認 LF」，實作途中才補留言決定。

brief 的 Desired behavior 每一條都要有對應的驗收條件，文件同步那幾條也算，寫成可以用 `grep` 或 `sed -n` 確認的形式，用樣式而不是行號，例如 `sed -n '/<樣式>/p'`。#138 的 brief 要求「`mutate.mjs` 檔頭若提到逾時與中斷的實作方式，改成指向共用 module」，驗收條件沒有對應的一條，實作時漏改了逾時那一行，兩軸審查才抓到。

開 issue 前，把每一條 `grep`／`sed` 驗收指令對現在的檔案試跑一次，確認兩件事：樣式抓得到要改的那幾行；改之前應該失敗的條件現在真的失敗，沒有因為檔案裡已經有同一個字而先通過，先通過就換成那一節還沒有的字。#298 的驗收條件用 `sed -n '/取得相關 ticket/,/^$/p'` 抓那一節，範圍碰到標題下的第一個空行就停了，抓不到底下那行指令。

開 issue 前也要逐條比對 Desired behavior 與驗收條件有沒有互相衝突，例如一邊要求寫出某個字、另一邊禁止它出現。衝突在 brief 裡就解決：改寫要求，或放寬驗收條件。#298 的 Desired behavior 要求寫出 `gh` 的留言選項名稱，驗收條件卻禁止檔案裡出現那個選項，實作時只好改寫成「`gh` 的留言選項」，那段說明就用 `grep` 搜不到了。
