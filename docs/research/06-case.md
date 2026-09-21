---
title: 6. 完整案例：Northwind Precision（合成資料）
order: 6
summary: 從輸入資料一路展示分析、輸出、人工審查與後續追蹤。所有資料皆為合成。
---

> **合成資料聲明**：Northwind Precision 是虛構的製造業公司。主機、IP（TEST-NET）、帳號、弱點編號（`SYN-*`）、威脅行為者皆虛構。評分規則是本專案示範規則，非 Gartner 公式。網站「案例互動展示」頁可即時切換輸入觀察輸出變化。

## 6.1 情境

- 12 項資產：3 個 DMZ 對外服務（VPN、客戶入口、郵件閘道）、核心 AD／ERP／檔案伺服器／跳板機、1 台 OT-DMZ 的 MES、雲端備份儲存桶、CI runner、HR SaaS。
- Crown jewels：`erp-db-01`（A06）、`mes-srv-01`（A07）。
- 授權：`SYN-AUTH-2026-09`，範圍 12 項；**主動測試與外部掃描皆未授權**；PLC/HMI 排除。
- 受眾：CISO、IT 主管、廠務主管；每週。

## 6.2 輸入（9 個檔案）

| 檔案 | 筆數 | 值得注意 |
|---|---|---|
| assets.csv | 12 | 6 項對外曝露；4 項 Restricted 且重要性 5（其中 2 項為 crown jewel：erp-db-01、mes-srv-01） |
| vulnerabilities.csv | 14 | `SYN-2026-0101`（VPN pre-auth RCE，EPSS 0.91、KEV）；`SYN-2023-0044`（MES，無修補） |
| exposures.json | 7 | `old-test.northwind-synthetic.example` 不在清冊 |
| identities.csv | 8 | `svc-erp-sync` 網域管理員無 MFA；`adm-legacy01` 190 天未登入 |
| misconfigurations.csv | 9 | OT-DMZ 未隔離；備份儲存桶允許匿名列出；CI 日誌未遮罩 |
| controls.json | 8 | VPN／郵件／OT 無 EDR；WAF 僅偵測；備份非不可變；無欺敵 |
| threat-intel.json | 3 | ALPHA 針對 VPN 與 Kerberos；BETA 針對郵件；OT 活動 |
| topology.json | 19 邊 | 6 個入口；身分邊集中在 AD |
| scope.json | 1 | 兩個授權旗標皆 false |

## 6.3 S1–S2：範圍與資料品質

- 範圍內 12 項；無範圍外資產。
- 資料品質：所有必填欄位齊全；異常 1 項（EASM 未知資產）。信心：**高**（無缺漏類別）。
- 人工決策：CISO 確認範圍；資料擁有者確認 EASM 未知資產是否為遺漏的測試主機（下一步納入清冊）。

## 6.4 S3：曝險優先序（平衡胃納）

| 優先 | 資產 | 發現 | 分數 | 可能性 | 影響 | 主要依據 |
|---|---|---|---|---|---|---|
| P1 | vpn-gw-01 | SYN-2026-0101 | 86.0 | 10.0 | 8.6 | 對外；EASM 舊韌體／舊 TLS；公開利用；EPSS 0.91；KEV；VPN 群組 MFA 不全；設定偏差；無 EDR／MFA／修補 SLA；情資 ALPHA（medium）；可達 crown jewel 之入口 |
| P1 | mes-srv-01 | SYN-2023-0044 | 72.5 | 7.3 | 10.0 | 公開利用；EPSS 0.55；共用帳號；OT-DMZ 未隔離；5 項控制缺口；情資 OT（low）；crown jewel；無修補 |
| P1 | web-portal-01 | SYN-2026-0210 | 68.7 | 7.2 | 9.6 | 對外；EASM 舊 CMS；公開利用；EPSS 0.62；web 以 root 執行；有 EDR／WAF／日誌／SLA（降分）；入口 |
| P1 | s3-backup-bucket | SYN-2026-0402 | 64.4 | 6.4 | 10.0 | 對外；匿名列出；svc-backup 無 MFA；備份非不可變；無日誌；入口（資料外洩路徑） |
| P1 | mail-gw-01 | SYN-2026-0150 | 63.4 | 8.8 | 7.2 | 對外；公開利用；EPSS 0.45；無修補；無 EDR／日誌／SLA；情資 BETA（low）；入口 |
| P2 | ad-dc-01 | SYN-2025-0500 | 54.8 | 5.5 | 10.0 | 公開利用；svc-erp-sync 與 adm-legacy01；SMB signing；無欺敵；情資 ALPHA（medium） |
| P2 | erp-db-01 | SYN-2024-0810 | 52.8 | 5.3 | 10.0 | 公開利用；pg_hba trust；無 EDR／日誌／欺敵；crown jewel |
| P2 | vpn-gw-01 | SYN-2025-0342 | 48.3 | 5.6 | 8.6 | 對外；低 EPSS；同上控制缺口；入口 |
| P3 | ci-runner-01 | SYN-2026-0388 | 36.1 | 5.0 | 7.2 | 對外；token 外洩；無 EDR／日誌；入口 |
| P3 | web-portal-01 | SYN-2025-0977 | 32.5 | 3.4 | 9.6 | 舊版 nginx；有控制；入口 |
| P3 | hr-saas-sso | SYN-2026-0290 | 28.5 | 4.6 | 6.2 | 對外；管理角色無 MFA |
| P4 | file-srv-01 | SYN-2025-0620 | 15.3 | 2.5 | 6.2 | SMB signing；有 EDR |
| P4 | erp-app-01 | SYN-2026-0333 | 0.0 | 0.0 | 10.0 | 有 EDR／日誌／SLA（控制把可能性降到 0） |
| P4 | jump-host-01 | SYN-2026-0015 | 0.0 | 0.0 | 6.6 | 有 EDR／MFA／日誌／SLA |

> 數值由網站示範引擎（`assets/demo.js`）以預設參數計算（`node scripts/run-demo.mjs` 可重現）。語言模型執行 skill 時，分級與主要依據應一致，但小數可能不同。注意：`jump-host-01` 的 RDP 無 MFA 議題因控制降分而落到 P4，正是「規則有盲點、需人工審查」的示範。

**人工決策**：ERP 團隊確認 ERP DB 重要性 5；廠務確認 MES 的最大可容忍停機 2 小時；CISO 同意五項 P1 的排序。

## 6.5 S4：攻擊路徑假設

| # | 路徑 | 跳數 | 可行性 | 關鍵邊 |
|---|---|---|---|---|
| 1 | internet → vpn-gw-01 → ad-dc-01 → erp-db-01 | 3 | 6.4 | VPN RCE → DC → svc-erp-sync 憑證（identity） |
| 2 | internet → vpn-gw-01 → ad-dc-01 → erp-app-01 → erp-db-01 | 4 | 5.2 | 同上 + pg_hba trust（misconfig）；erp-app-01 有 EDR／日誌把可能性壓到 0，成為最弱節點 |
| 3 | internet → vpn-gw-01 → ad-dc-01 → file-srv-01 → mes-srv-01 | 4 | 4.9 | DC → 檔案伺服器 → OT-DMZ 未隔離 |
| 4 | internet → s3-backup-bucket → erp-db-01（資料外洩路徑）| 2 | 4.2 | 匿名列出 → DB dump |
| 5 | internet → mail-gw-01 → file-srv-01 → mes-srv-01 | 3 | 3.9 | 釣魚 → SMB → OT-DMZ 未隔離 |
| 6 | internet → vpn-gw-01 → jump-host-01 → mes-srv-01 | 3 | 3.8 | RDP 無 MFA → 跳板機可達 OT-DMZ；跳板機控制完整（可能性 0）拉低可行性 |
| 7 | internet → vpn-gw-01 → jump-host-01 → erp-db-01 | 3 | 3.8 | 跳板機由 DBA 使用 |
| 8 | internet → web-portal-01 → erp-app-01 → erp-db-01 | 3 | 3.4 | CMS RCE → API → pg_hba trust |
| 9 | internet → ci-runner-01 → web-portal-01 → erp-app-01 → erp-db-01 | 4 | 2.7 | 部署金鑰 → 入口網站 |

> 路徑可行性規則：節點若有任何發現，取其最高可能性（可為 0，表示控制已把該節點壓低）；完全沒有發現的節點取 3（未知）。因此經過 erp-app-01、jump-host-01 的路徑可行性偏低——這是規則對「有控制的節點」的獎勵，但也可能低估「控制存在但未驗證」的情況，需人工審查。

**人工決策**：架構師確認「VPN 使用者網段可達 DC」屬實；補充「跳板機到 OT-DMZ 需經防火牆規則 #42」，路徑 6 可行性應再下修；同時質疑 jump-host-01 的 RDP 無 MFA 議題被控制降分到 0 是否合理（此類修正正是人工審查的價值）。

## 6.6 S5：改善建議（節錄）

| 優先 | 資產 | 行動 | 負責 | 核准 |
|---|---|---|---|---|
| P1 | vpn-gw-01 | 套用修補 SYN-2026-0101；同時強制 VPN 群組 100% MFA | Network Team | 一般變更 |
| P1 | web-portal-01 | 套用修補；web 服務改非 root；WAF 轉阻擋模式 | Digital Team | 一般變更 |
| P1 | mes-srv-01 | 無修補：補償控制——OT-DMZ 與產線網段隔離、取消共用帳號、部署誘餌憑證 | Plant IT | 變更委員會／OT 負責人 |
| P1 | s3-backup-bucket | 修正儲存桶政策（封鎖公開存取）；啟用物件鎖定／版本控管 | IT Ops | 一般變更 |
| P1 | mail-gw-01 | 無修補：套用廠商緩解、限制管理介面來源、加入 SIEM | IT Ops | 一般變更 |
| P2 | ad-dc-01 | svc-erp-sync 降權為最小權限、停用 adm-legacy01、啟用 SMB signing | IT Ops | 變更委員會 |

補償控制缺口：不可變備份（目前無）、欺敵（目前無）、網段隔離（部分）、MFA（部分）、修補 SLA（網路設備與 OT 無）。

## 6.7 S6：安全驗證計畫（提案）

| # | 假設 | 方法 | 授權狀態 |
|---|---|---|---|
| V1 | vpn-gw-01 → erp-db-01（3 跳） | 授權下外部版本確認 + 內部 BAS 模擬 Kerberoasting 與橫向移動 | **尚未授權主動測試**：需 CISO 核准（含外部掃描授權），排除 OT |
| V2 | vpn-gw-01 → erp-db-01（4 跳，經 erp-app-01） | 內部設定檢視（pg_hba）+ 桌面演練 | 同上 |
| V3 | vpn-gw-01 → mes-srv-01（4 跳，經 DC 與檔案伺服器） | 只做讀取式驗證（網段與 SMB 規則檢視）；**不對 OT 主動測試** | 同上 |

> 「方法」欄是分析師依假設細化後的版本；示範引擎只依「入口是否對外」「是否經過 OT」給出通用方法（見 `examples/expected-output.md`）。授權狀態由引擎依 scope 的兩個旗標決定：任一為 false 即「尚未授權」，對外驗證另需 `external_scanning_authorized`。

**人工決策**：CISO 決定授權 V1、V2 的內部 BAS（排除 OT），外部驗證交由既有授權的第三方。

## 6.8 S7：管理摘要（≤ 300 字，識別資訊已遮罩）

> 以下為分析師依引擎輸出潤飾的版本；引擎直接產生的版本（同樣遮罩、243 字）見 `examples/expected-output.md` 與網站案例頁第 7 節。

> 本週 14 項發現納入分析，5 項 P1（4 項對外曝露、1 項為 OT 製造執行系統）。最急迫：遠端存取閘道之 pre-auth RCE，已有公開利用且產業情資顯示活躍。最可行的攻擊路徑假設：遠端存取閘道 → 網域控制站 → ERP 資料庫，關鍵阻斷點為特權服務帳號 MFA 與網段隔離。決策請求：(1) 核准 7 天內修補四項對外 P1 並封鎖備份儲存桶公開存取；(2) 核准 OT-DMZ 隔離變更；(3) 授權內部 BAS 驗證前兩條路徑（排除 OT）。限制：所有路徑為假設；發現 1 個未納入清冊的對外資產待確認。

## 6.9 S8：追蹤指標與後續

| 指標 | T+0 | 目標 |
|---|---|---|
| 對外曝露且 P1 | 4 | 0（7 天內） |
| P1/P2 | 5/3 | 每週下降 |
| 可達 crown jewel 的路徑假設 | 9 | 每條至少一個已驗證阻斷點 |
| 高信心比例 | 100% | ≥ 80% |
| 清冊完整度 | 100%（但 EASM 發現 1 未知） | ≥ 95% |
| 未納入清冊的對外資產 | 1 | 0 |

時間軸：T+2 天業務確認排序與授權決策；T+7 天 P1 修補後重跑；T+14 天驗證結果回填 O2 狀態；每週檢視。

## 6.10 資料缺漏的影響（互動示範可重現；數值由 `node scripts/run-demo.mjs` 各旗標產生）

| 移除 | 影響 |
|---|---|
| threat-intel.json（`--no-intel`） | `SYN-2026-0101` 仍為 P1（可能性已達上限）；`mes-srv-01` 降為 62.5、`mail-gw-01` 降為 P2、`ad-dc-01` 降為 P3；路徑 1 可行性 6.4 → 6.0；所有發現信心「中」，缺漏列出「威脅情資」 |
| identities.csv（`--no-identities`） | `ad-dc-01`、`erp-db-01` 降為 P3、`s3-backup-bucket` 降為 P2；路徑 1 可行性 6.4 → 5.9；信心「中」。skill 執行時另應把路徑中的 identity 邊標「未知」（引擎不標示，這是提示詞規則） |
| topology.json（`--no-topology`） | 無攻擊路徑假設、無「入口」影響加分：`vpn-gw-01` 降為 66.0，`web-portal-01`、`s3-backup-bucket`、`mail-gw-01` 降為 P2；驗證計畫為空；拓樸計為缺一類，信心「中」；O5 註明「未提供拓樸」 |
| controls.json（`--no-controls`） | `web-portal-01` 升至 84.1、`ad-dc-01` 升為 P1（無 EDR／WAF 降分）；`erp-app-01`、`jump-host-01` 不再是 0 分；補償控制缺口為空；信心「中」 |
| 清冊完整度 70%（`--inventory 70`） | 後 4 項資產（jump-host、backup bucket、CI、HR SaaS）消失；路徑假設減為 5；未知資產指標不變；所有發現信心「低」（清冊 < 80%），缺漏列出「資產清冊完整度 70% < 80%」 |
| scope.json | **拒絕分析** |
