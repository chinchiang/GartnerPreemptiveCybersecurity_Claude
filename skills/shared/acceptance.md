# 驗收清單（以 examples/synthetic-org/ 合成資料執行）

| # | 檢查 | 預期結果 |
|---|---|---|
| 1 | 讀入 9 個檔案並回報筆數 | assets 12、vulnerabilities 14、identities 8、misconfigurations 9、controls 8、actors 3、edges 19、exposures 7、scope 1 |
| 2 | `vpn-gw-01` 的 `SYN-2026-0101` 分級 | **P1**；factors 含「對外曝露」「公開利用程式」「模擬 KEV」「威脅情資命中」 |
| 3 | 攻擊路徑假設 | 至少含 `internet → vpn-gw-01 → ad-dc-01 → erp-db-01`，`status: hypothesis` |
| 4 | 驗證計畫授權標示 | 每項標「尚未授權主動測試」（scope 中兩旗標皆 false） |
| 5 | 管理摘要 | 正體中文、≤ 300 字、含「決策請求」與「限制」 |
| 6 | 移除 threat-intel.json 重跑 | 信心水準下修；輸出列出「未納入威脅情資」；`SYN-2026-0101` 分數下降但仍為 P1 |
| 7 | 移除 scope.json 重跑 | 拒絕分析並列出必要欄位 |

附加檢查（建議）：

- EASM 中 `old-test.northwind-synthetic.example`（`asset_id: null`）應被列為「未納入清冊的對外資產」並出現在指標中。
- `svc-erp-sync`（網域管理員、無 MFA）應出現在 ad-dc-01 → erp-db-01 邊的身分因子中。
- OT 主機 `mes-srv-01` 的 `SYN-2023-0044` 無修補：改善建議應為「補償控制」而非「套用修補」，且核准層級為「變更委員會／OT 負責人／系統擁有者」。
- 結尾聲明存在。
