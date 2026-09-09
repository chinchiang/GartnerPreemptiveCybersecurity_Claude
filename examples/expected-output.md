# 預期輸出（合成資料 Northwind Precision）

> 本檔為以 `examples/synthetic-org/` 執行「先制型曝險分析」時的**參考輸出**。數值由確定性示範引擎（`node scripts/run-demo.mjs`）產生；語言模型執行各平台 skill 時，**分級（P1–P4）、主要依據與路徑存在性應一致，小數可不同**。所有資料皆為合成；評分規則為本專案示範規則，非 Gartner 公式。

## 資料品質

| 檔案 | 筆數 | 異常 |
|---|---|---|
| scope.json | 1 | 主動測試授權 = false；外部掃描授權 = false |
| assets.csv | 12 | 無 |
| vulnerabilities.csv | 14 | 無 |
| exposures.json | 7 | `old-test.northwind-synthetic.example`（asset_id null）未納入清冊 |
| identities.csv | 8 | 無 |
| misconfigurations.csv | 9 | 無 |
| controls.json | 8 | 無 |
| threat-intel.json | 3 行為者 | 無 |
| topology.json | 19 邊 | 無 |

信心：高（無缺漏類別）。

## 曝險優先序（平衡胃納：P1 ≥ 60、P2 ≥ 40、P3 ≥ 20）

| 優先 | 資產 | 發現 | 分數 | 可能性 | 影響 | 主要依據 |
|---|---|---|---|---|---|---|
| P1 | vpn-gw-01 | SYN-2026-0101 | 86.0 | 10.0 | 8.6 | 對外曝露；EASM 議題；公開利用程式；EPSS 0.91；KEV；身分弱點；設定偏差；控制缺口 EDR/MFA/Patch SLA；情資 ALPHA（medium）；可達 crown jewel 之入口 |
| P1 | mes-srv-01 | SYN-2023-0044 | 72.5 | 7.3 | 10.0 | 公開利用程式；EPSS 0.55；身分弱點；設定偏差；控制缺口 ×5；情資 OT（low）；crown jewel |
| P1 | web-portal-01 | SYN-2026-0210 | 68.7 | 7.2 | 9.6 | 對外曝露；EASM 議題；公開利用程式；EPSS 0.62；設定偏差；既有控制 EDR/WAF/SIEM/SLA；入口 |
| P1 | s3-backup-bucket | SYN-2026-0402 | 64.4 | 6.4 | 10.0 | 對外曝露；匿名列出；身分弱點；設定偏差；控制缺口 不可變備份/SIEM；入口 |
| P1 | mail-gw-01 | SYN-2026-0150 | 63.4 | 8.8 | 7.2 | 對外曝露；EASM 議題；公開利用程式；控制缺口 EDR/SIEM/SLA；情資 BETA（low）；入口 |
| P2 | ad-dc-01 | SYN-2025-0500 | 54.8 | 5.5 | 10.0 | 公開利用程式；身分弱點 ×2；設定偏差；既有控制；無欺敵；情資 ALPHA（medium） |
| P2 | erp-db-01 | SYN-2024-0810 | 52.8 | 5.3 | 10.0 | 公開利用程式；身分弱點 ×2；設定偏差；網段隔離；控制缺口；crown jewel |
| P2 | vpn-gw-01 | SYN-2025-0342 | 48.3 | 5.6 | 8.6 | 對外曝露；EASM 議題；身分弱點；設定偏差；控制缺口；入口 |
| P3 | ci-runner-01 | SYN-2026-0388 | 36.1 | 5.0 | 7.2 | 對外曝露；身分弱點；設定偏差；控制缺口；入口 |
| P3 | web-portal-01 | SYN-2025-0977 | 32.5 | 3.4 | 9.6 | 對外曝露；EASM 議題；既有控制；入口 |
| P3 | hr-saas-sso | SYN-2026-0290 | 28.5 | 4.6 | 6.2 | 對外曝露；EASM 議題；身分弱點；設定偏差；MFA |
| P4 | file-srv-01 | SYN-2025-0620 | 15.3 | 2.5 | 6.2 | 公開利用程式；身分弱點；既有控制 |
| P4 | erp-app-01 | SYN-2026-0333 | 0.0 | 0.0 | 10.0 | 既有控制 EDR/SIEM/SLA |
| P4 | jump-host-01 | SYN-2026-0015 | 0.0 | 0.0 | 6.6 | 既有控制 EDR/MFA/SIEM/SLA |

## 攻擊路徑假設（status: hypothesis）

| # | 路徑 | 跳數 | 可行性 |
|---|---|---|---|
| 1 | internet → vpn-gw-01 → ad-dc-01 → erp-db-01 | 3 | 6.4 |
| 2 | internet → vpn-gw-01 → ad-dc-01 → erp-app-01 → erp-db-01 | 4 | 6.1 |
| 3 | internet → vpn-gw-01 → ad-dc-01 → file-srv-01 → mes-srv-01 | 4 | 4.9 |
| 4 | internet → vpn-gw-01 → jump-host-01 → mes-srv-01 | 3 | 4.7 |
| 5 | internet → vpn-gw-01 → jump-host-01 → erp-db-01 | 3 | 4.7 |
| 6 | internet → web-portal-01 → erp-app-01 → erp-db-01 | 3 | 4.3 |
| 7 | internet → s3-backup-bucket → erp-db-01 | 2 | 4.2 |
| 8 | internet → mail-gw-01 → file-srv-01 → mes-srv-01 | 3 | 3.9 |
| 9 | internet → ci-runner-01 → web-portal-01 → erp-app-01 → erp-db-01 | 4 | 3.6 |

## 安全驗證計畫（提案；兩個授權旗標皆 false）

| # | 假設 | 方法 | 授權狀態 |
|---|---|---|---|
| V1 | vpn-gw-01 → erp-db-01（3 跳） | 授權下的外部驗證（版本確認／安全 PoC）+ 內部 BAS 模擬橫向移動 | 尚未授權主動測試：需 CISO 另行核准並排除 OT |
| V2 | vpn-gw-01 → erp-db-01（4 跳） | 同上 | 同上 |
| V3 | vpn-gw-01 → mes-srv-01（4 跳） | 同上（OT 端點只做讀取式驗證） | 同上 |

## 追蹤指標

| 指標 | 值 | 目標 |
|---|---|---|
| 對外曝露且 P1 的發現數 | 4 | 0（7 天內） |
| P1/P2 發現總數 | 5 / 3 | 每週下降 |
| 可達 crown jewel 的攻擊路徑假設數 | 9 | 每條至少一個已驗證阻斷點 |
| 高信心比例 | 100% | ≥ 80% |
| 資產清冊完整度（模擬） | 100% | ≥ 95% |
| 未納入清冊的對外資產 | 1 | 0 |

## 驗收對照（task-spec 第 7 節）

| # | 檢查 | 預期 |
|---|---|---|
| 2 | `vpn-gw-01 / SYN-2026-0101` | P1；依據含對外曝露、公開利用程式、模擬 KEV、威脅情資命中 |
| 3 | 路徑 | 含 `internet → vpn-gw-01 → ad-dc-01 → erp-db-01`，hypothesis |
| 4 | 驗證計畫 | 每項「尚未授權主動測試」 |
| 6 | 移除 threat-intel.json | 信心「中」；`SYN-2026-0101` 仍 P1；`mail-gw-01` 降 P2；`ad-dc-01` 降 P3；輸出列「未納入威脅情資」 |
| 7 | 移除 scope.json | 拒絕分析並列出必要欄位 |

## 結尾聲明

本分析由語言模型依使用者提供的資料整理，未驗證實際曝險；所有攻擊路徑為假設；任何主動測試與變更需人工授權。
