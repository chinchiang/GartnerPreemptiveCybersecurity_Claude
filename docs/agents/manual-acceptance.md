# 給使用者執行的腳本與手動驗收

寫給使用者在自己電腦上執行的腳本（例如 wizard），或進行真實模型的對話驗證時用。驗收紀錄的寫法是審查規則，見 `CODING_STANDARDS.md` §7。

- **使用者在 PowerShell 打 `bash` 會叫到 WSL**，代理這邊的 Git Bash 叫到的是 Git 的 bash。給使用者跑的腳本，兩種都要能跑：路徑轉換用 `wslpath`（WSL）或 `cygpath`（Git Bash）；Windows 看得到的暫存目錄是 `%TEMP%`，WSL 的 `/tmp` 不行；WSL 裡沒有 node，有 `python3`。
- **給使用者的腳本要實際執行過**，不能只跑 `bash -n`：CRLF、找不到指令、路徑格式這些錯，只在執行時才出現。WSL 那一側用 `wsl.exe -e bash -c 'cd <repo 的 /mnt 路徑> && …'` 跑，再用 PowerShell 確認 Windows 那一側看得到結果。
- **wizard 要把「要輸入的句子」和「給你的提醒」在畫面上分清楚**：使用者可能把提醒一起打進對話（#209 第 3 次）。紀錄照實寫出實際的輸入。
- **對話驗證這類手動驗收，工作區要跟 repo、wizard 和參考答案完全隔開**：模型會主動探索目錄（#209 第 1 輪執行了 7 次 `Get-ChildItem`，還讀了 wizard）。每次對話前確認模型的工作區路徑；讀回應時，再用回應裡的線索核對它跑在哪裡，例如 Antigravity CLI 開頭的畫面會顯示工作區路徑，`validate_inputs.py` 的訊息也要跟本機對同一個工作區跑出的參考訊息逐字相同（#209 第 2 次就是這樣發現 8a～8c 跑錯了工作區）。
