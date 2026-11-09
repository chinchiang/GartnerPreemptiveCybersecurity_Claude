---
title: 5. 可能的 Outputs
order: 5
summary: 逐項說明每個輸出的結構與範例、對應輸入與判斷依據、資料齊備程度與可信度考量、驗證方式與使用對象。
---

> 本章為本專案推論。所有輸出遵守 `skills/shared/output-schema.json`：每個區塊帶 `confidence`、`basis`、`missing_inputs`、`requires_human`。範例皆取自合成資料 Northwind Precision。

## 5.1 總表

| 編號 | 輸出 | 對應步驟 | 主要輸入 | 使用對象 | 可信度考量 |
|---|---|---|---|---|---|
| O1 | 曝險優先序 | S3 | I2–I9 | 資安團隊、系統擁有者 | 缺漏類別數、清冊完整度 |
| O2 | 攻擊路徑假設 | S4 | O1、I10、I6、I8 | 資安架構師、紅隊 | 拓樸品質；永遠是假設 |
| O3 | 改善建議 | S5 | O1、O2、I3、I7、I8 | IT/OT 營運、變更委員會 | 修補可用性、控制資料 |
| O4 | 安全驗證計畫 | S6 | O2、I1、I10 | CISO、驗證團隊 | 授權狀態 |
| O5 | 管理摘要 | S7 | O1–O4、I1 | CISO、管理層 | 綜合 |
| O6 | 追蹤指標 | S8 | O1–O5、I2、I4 | 資安治理 | 資料新鮮度 |

## 5.2 逐項說明

### O1 曝險優先序

- **結構**：每項 `finding_id`、`asset_name`、`vuln_id`、`priority`（P1–P4）、`score`（0–100）、`likelihood`、`impact`、`factors[]`、`missing[]`、`confidence`；區塊層級 `thresholds`。
- **範例（合成）**：

| 優先 | 資產 | 發現 | 分數 | 依據 |
|---|---|---|---|---|
| P1 | vpn-gw-01 | SYN-2026-0101 VPN pre-auth RCE | 86.0 | 對外曝露；公開利用程式；EPSS 0.91；KEV；身分弱點 ×1；控制缺口 ×3；情資命中 SYNTHETIC-GROUP-ALPHA（medium）；可達 crown jewel 之入口 |
| P1 | mes-srv-01 | SYN-2023-0044 MES unauthenticated API | 72.5 | 公開利用程式；EPSS 0.55；身分弱點；設定偏差；控制缺口 ×5；情資（low）；crown jewel；無修補 |
| P1 | web-portal-01 | SYN-2026-0210 CMS upload RCE | 68.7 | 對外曝露；公開利用程式；EPSS 0.62；設定偏差；既有控制 EDR、WAF；入口 |

- **判斷依據**：附錄 A 示範規則；`factors[]` 逐項可回溯到輸入欄位。
- **資料齊備程度**（JSON 欄位 `confidence`，舊稱「信心」）：缺 0 類 → 高；1–2 類 → 中；≥ 3 類或清冊 < 80% → 低。只反映輸入是否齊全，不代表已經驗證（#152）；以下各輸出的「可信度考量」是研究階段對整體可信度的描述，比這個欄位寬，資料新鮮度、來源可信度與實證驗證狀態目前不納入判定。
- **驗證方式**：人工抽查 P1 的 factors；與組織既有風險模型比對；S6 的授權驗證。
- **對應 Gartner 概念**：CTEM prioritization [G8]；preemptive exposure assessment「prioritize findings by enriching them with deep business context」[G32]。

### O2 攻擊路徑假設

- **結構**：每條 `id`、`entry`、`target`、`nodes[]`、`edges[]`（via 描述）、`feasibility`（0–10）、`blocking_controls[]`、`status: hypothesis`。
- **範例（合成）**：`internet → vpn-gw-01 → ad-dc-01 → erp-db-01`，可行性 6.4；邊：VPN 443 → VPN 使用者網段可達 DC → svc-erp-sync 網域管理員憑證；可能阻斷控制：VPN 修補／MFA、特權服務帳號降權、ERP DB 網段隔離。
- **判斷依據**：拓樸邊 + O1 的入口可能性 + 身分／設定邊數 − 跳數。
- **可信度考量**：取決於 I10 與 I6 品質；**永遠標示為假設**。
- **驗證方式**：O4 的授權驗證；驗證後可改為 `validated-feasible` 或 `validated-blocked`。回填與下一輪沿用是導入時應建立的制度（見第 3 章 3.6「驗證回饋」）。
- **對應 Gartner 概念**："anticipate attack paths" [G-IR]；AEV 證明可利用性 [G28b]。

### O3 改善建議

- **結構**：每項 `finding_id`、`priority`、`action`、`owner`、`effort`、`verify`、`approval_level`；區塊 `compensating_controls[]`。
- **範例（合成）**：`[P1] vpn-gw-01：套用修補（SYN-2026-0101）並驗證版本；負責 Network Team；工作量中；驗證：修補後以授權外部驗證確認版本；核准：一般變更流程`。`[P1] mes-srv-01：無修補可用：套用廠商緩解措施、限制存取來源、加強監控；核准：變更委員會／OT 負責人`。補償控制缺口：不可變備份（A10）、網段隔離（A07）、MFA（A01、A07）、欺敵（A04、A06、A08）。
- **判斷依據**：修補可用性、是否設定議題、環境（OT）、重要性。
- **可信度考量**：中（模型不知維護窗口與成本）。
- **驗證方式**：變更後重跑分析；O4 驗證。
- **對應 Gartner 概念**：PEM「automated and guided mitigation」[G-IR]；欺敵與 AMTD 作為先制對策 [G1][G3]。

### O4 安全驗證計畫（提案）

- **結構**：每項 `id`、`hypothesis`、`method`、`authorization_required`（需要誰的書面授權）、`authorization_status`（「尚未授權主動測試」或「已授權」）、`scope_exclusions[]`、`success_criteria`。
- **範例（合成）**：`V1 vpn-gw-01 → erp-db-01：授權下的外部版本確認 + 內部 BAS 模擬橫向移動；尚未授權主動測試：需 CISO 另行核准並排除 OT；成功準則：證明路徑不可行或確認阻斷點有效`。
- **判斷依據**：O2 前 3 條；I1 授權旗標；OT 排除。
- **可信度考量**：不適用（提案）。
- **驗證方式**：由人員與合規工具執行；結果回填 O2 狀態。
- **對應 Gartner 概念**：CTEM validation [G8]；AEV [G28b]；AAE 在低容錯產業的限制 [G-IR]。

### O5 管理摘要

- **結構**：`audience[]`、`text`（≤ 300 字）、`decisions_requested[]`；含現況、最急迫、決策請求、限制；預設遮罩識別資訊。
- **範例（合成，引擎輸出，識別資訊已遮罩）**：

  > 1. 現況：14 項發現，5 項 P1（4 項對外曝露）；最急迫：VPN Gateway（A01）之 VPN appliance pre-auth RCE。
  > 2. 最可能路徑：internet → A01 → A04 → A06（可行性 6.4/10，未驗證），阻斷點為身分與網段控制。
  > 3. 決策請求：（1）核准 P1（5 項）修補排程與補償控制；（2）決定是否授權主動驗證（排除 OT；外部驗證另需外部掃描授權）。
  > 4. 限制：無重大資料缺漏；所有路徑為假設，模型未驗證實際曝險。

  完整版見網站案例頁第 7 節與 `examples/expected-output.md`。
- **判斷依據**：O1–O4 綜合。
- **可信度考量**：綜合；文字需人工校對。
- **驗證方式**：管理層回饋；下次檢視比較。
- **對應 Gartner 概念**：CTEM mobilization「communication standards」[G8]；Gartner 新聞稿轉述（非逐字，待原頁核對）的「buying down exposure levels」溝通建議 [G-SRM25]。

### O6 追蹤指標

- **結構**：每項 `name`、`value`、`target`、`next_review`。
- **範例（合成）**：對外曝露且 P1 = 4（目標 0，7 天內）；P1/P2 = 5/3；路徑假設 = 9；資料齊備程度為高的比例 100%；清冊完整度 100%；未納入清冊的對外資產 = 1（目標 0）。
  - 清冊完整度的 100% 不是從資料算出來的：它是示範引擎的模擬參數（`inventoryCompleteness`，預設 100，用來示範完整度不足時資料齊備程度怎麼下修），實務上則是組織自報的值。同一份資料裡 EASM 發現 1 個未納入清冊的對外資產，兩者的差集（見第 2 章 2.4）表示實際完整度低於 100%，這個值高估了。
- **判斷依據**：O1–O2 統計 + I2/I4 品質。
- **可信度考量**：等同輸入新鮮度。
- **驗證方式**：每週趨勢；與事件資料交叉。
- **對應 Gartner 概念**：Gartner 建議以「time-to-remediate critical exposures」與「attack surface for high-value assets」對齊業務成果 [G-IR]；本流程維持單次分析，上面的指標都是當期數值，沒有修補天數之類的時間類指標，也沒有跨期比較；成果型指標由導入的組織建立（見第 3 章 3.6「成果型指標」與 [ADR 0008](https://github.com/chinchiang/GartnerPreemptiveCybersecurity_Claude/blob/main/docs/adr/0008-single-analysis-feedback-and-outcome-metrics-are-adoption-practices.md)）。

## 5.3 輸出的共同限制

- 所有輸出由語言模型依提供的資料整理，**未驗證實際曝險**。
- 攻擊路徑一律假設；主動測試與變更需人工授權。
- 數值會因模型推理略有差異；分級與主要依據應一致（驗收依此設計）。
