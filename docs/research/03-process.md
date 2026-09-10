---
title: 3. 可執行流程：八個步驟的目的、輸入、處理、輸出、限制與人工決策點
order: 3
summary: 把可驗證的概念轉為可執行流程。本章為本專案推論框架，以 Gartner CTEM 五階段為骨架。
---

## 3.1 設計原則（本專案推論）

1. **骨架來自 CTEM**：S1 對應 scoping、S2 對應 discovery、S3–S4 對應 prioritization、S6 對應 validation、S5／S7 對應 mobilization [G8]。
2. **先制型的加速點**：依 Gartner 對 PEM 的定義 [G-IR]，加速的是「持續攻擊面列舉、高準確度驗證、自動化與引導式緩解」三處；本流程對應 S2、S6、S5。
3. **語言模型的邊界**：模型負責資料整合、規則化推理、假設生成與文件撰寫；不執行掃描、不驗證、不變更。每一步都標出人工決策點。
4. **迴圈而非直線**：S8 的指標回饋到 S1／S2，對應 CTEM「continuous」的精神。

## 3.2 八步流程總表

| 步驟 | 名稱 | 目的 | 主要輸入 | 主要輸出 | 人工決策點 |
|---|---|---|---|---|---|
| S1 | 範圍確認 Scoping | 確認授權範圍、排除項、主動測試授權狀態 | I1 scope | 範圍摘要 | 授權人簽核 |
| S2 | 資料匯集 Discovery | 解析所有輸入，產生資料品質報告與範圍外排除清單 | I2–I10 | 資料品質報告 | 是否在缺漏下繼續 |
| S3 | 曝險評分 Prioritization | 可能性 × 影響 → P1–P4 | I2–I9 | O1 曝險優先序 | 業務擁有者確認 P1 |
| S4 | 攻擊路徑假設 Hypothesis | 從入口到 crown jewel 的路徑與可行性 | I10 + S3 | O2 攻擊路徑假設 | 架構師審查拓樸 |
| S5 | 改善建議 Remediation | 對 P1/P2 對映行動、負責人、工作量、驗證方式、核准層級；補償控制缺口 | S3、S4、I8 | O3 改善建議 | 變更委員會／OT 負責人 |
| S6 | 驗證計畫 Validation plan | 對前 N 條路徑提出驗證方法與授權需求（**只提案**） | S4、I1 | O4 安全驗證計畫 | CISO 書面授權 |
| S7 | 管理摘要 Mobilization | 面向受眾的摘要與決策請求 | S1–S6 | O5 管理摘要 | 管理層決策 |
| S8 | 追蹤指標 Tracking | 指標與下次檢視 | S1–S7 | O6 追蹤指標 | 每週檢視 |

## 3.3 各步驟細節

### S1 範圍確認（Scoping）

- **目的**：沒有授權範圍就沒有分析。確認 `in_scope_assets`、排除項、`active_testing_authorized`、`external_scanning_authorized`、授權參考編號、受眾與遮罩設定。
- **輸入**：I1。
- **處理**：驗證必填欄位；列出範圍摘要；若任何後續資料指向範圍外資產，排除並記錄。
- **輸出**：範圍摘要（併入 O5 與 JSON `meta`）。
- **限制**：模型無法判斷授權是否真實有效；只能檢查欄位存在。
- **人工決策點**：授權人（例如 CISO）確認範圍與排除項。
- **依據**：CTEM scoping 強調「understanding what is important to business counterparts」[G8]。

### S2 資料匯集（Discovery）

- **目的**：把資產、曝險、弱點、身分、設定、控制、情資、拓樸解析為一致的資料模型，並誠實回報品質。
- **輸入**：I2–I10。
- **處理**：每檔回報筆數、缺欄位、異常（CVSS 超界、重複 ID、指向不存在資產、EASM 中未納入清冊的對外資產）；估計資產清冊完整度。
- **輸出**：資料品質報告（JSON `data_quality`）。
- **限制**：模型只能看見被提供的資料；「未知的未知」需靠 EASM 等工具。
- **人工決策點**：資料擁有者決定是否補資料或在缺漏下繼續。
- **依據**：CTEM discovery [G8]；Gartner 對 PEA 的描述「continuously discover and map attack surfaces and prioritize findings by enriching them with deep business context」[G32]。

### S3 曝險評分（Prioritization）

- **目的**：把「嚴重度」轉為「在這個組織裡被利用的可能性 × 業務影響」。
- **輸入**：I2（重要性、資料等級、對外曝露）、I3（CVSS、公開利用、EPSS、KEV）、I4（EASM 議題）、I6（身分弱點）、I7（設定偏差）、I8（既有控制與缺口）、I9（情資命中）。
- **處理**：示範規則見 skills/shared/task-spec.md 附錄 A；每項列 `factors[]`；依風險胃納分 P1–P4；信心水準依缺漏類別數下修。
- **輸出**：O1。
- **限制**：示範規則是線性加權，不是機率模型；EPSS 本身不含企業脈絡。組織應以自己的風險模型取代。
- **人工決策點**：業務擁有者確認 P1 的業務重要性與排序。
- **依據**：CTEM prioritization「urgency, severity, ability to remediate and level of risk」[G8]；ASCA「combined with asset context, vulnerability data and threat intelligence」[G-IR]；PTI 擴充 EAP 以「better prioritize exposures」[G-IR]。

### S4 攻擊路徑假設（Hypothesis）

- **目的**：從單資產排序提升為「可達 crown jewel 的路徑」排序。
- **輸入**：I10（crown jewels、edges）+ S3 分數。
- **處理**：從 `internet` 沿 edges 深度優先搜尋至 crown jewel，最多 5 跳；可行性 = 入口可能性、最弱節點、身分／設定邊數、跳數的加權；列出可能阻斷控制。
- **輸出**：O2，`status: hypothesis`。
- **限制**：拓樸是人給的；模型不能證明路徑可行。無拓樸時跳過。
- **人工決策點**：資安架構師審查邊與信任關係是否正確。
- **依據**：Gartner "anticipate attack paths" [G-IR]；AEV 以攻擊情境證明可利用性 [G28b]。

### S5 改善建議（Remediation）

- **目的**：把 P1/P2 轉為可指派的行動，含補償控制（含欺敵作為選項）。
- **輸入**：S3、S4、I8。
- **處理**：修補可用且非設定議題 → 套用修補；設定議題 → 修正設定；無修補 → 緩解＋限制存取＋監控；OT／重要性 5 → 需變更委員會；列補償控制缺口（例如不可變備份、網段隔離、MFA、誘餌帳號）。
- **輸出**：O3。
- **限制**：模型不知道維護窗口與變更成本；工作量為粗估。
- **人工決策點**：變更委員會、OT 負責人。
- **依據**：CTEM mobilization「reduce friction in the approvals for treatments」[G8]；PEM「automated and guided mitigation」[G-IR]；欺敵作為先制能力 [G1][G-IR]。

### S6 安全驗證計畫（Validation plan）

- **目的**：為前 N 條路徑假設提出驗證方法（授權下的外部版本確認、內部 BAS、桌面演練、讀取式驗證）、授權需求、範圍排除與成功準則。
- **輸入**：S4、I1。
- **處理**：若兩個授權旗標為 false，每項標「尚未授權主動測試」；OT 資產一律排除主動測試。
- **輸出**：O4。
- **限制**：**模型不執行驗證**；驗證需人員與合規工具。
- **人工決策點**：CISO 書面授權。
- **依據**：CTEM validation [G8]；AEV 定義 [G28b]；AAE 在低容錯產業（製造、醫療、關鍵基礎設施）採用受限 [G-IR]；AI 生成報告 [U1] 對 OT 主動掃描風險的提醒（其他來源）。

### S7 管理摘要（Mobilization）

- **目的**：讓管理層做決策，而不是看技術清單。
- **輸入**：S1–S6。
- **處理**：≤ 300 字；含現況、最急迫、決策請求、限制；預設遮罩識別資訊。
- **輸出**：O5。
- **限制**：摘要是模型撰寫，需人工校對。
- **人工決策點**：管理層決策。
- **依據**：Gartner 建議以「protection levels and buying down exposure levels」溝通 [G-SRM25]。

### S8 追蹤指標（Tracking）

- **目的**：讓流程可持續、可衡量。
- **輸入**：S1–S7。
- **處理**：至少 6 項指標（對外 P1 數、P1/P2 總數、路徑假設數、高信心比例、清冊完整度、未納入清冊的對外資產數）與下次檢視。
- **輸出**：O6。
- **限制**：指標只反映輸入資料的品質。
- **人工決策點**：每週檢視；重大變更時回到 S1。
- **依據**：Gartner 建議以「reducing time-to-remediate critical exposures or decreasing the attack surface for high-value assets」對齊業務成果 [G-IR]。

## 3.4 角色與職責（本專案推論；參考 [U1] 的 RACI 觀點）

| 活動 | CISO | 資安分析師 | 系統擁有者 | 變更委員會 | OT 工程 |
|---|---|---|---|---|---|
| S1 範圍 | A | R | C | I | C |
| S2 資料 | I | R | C | I | R（OT 被動資料）|
| S3 評分 | A | R | C | I | C |
| S4 路徑 | I | R | C | I | C |
| S5 改善 | A | R | R | A | R |
| S6 驗證授權 | A | R | I | C | A（OT）|
| S7 摘要 | A | R | I | I | I |
| S8 指標 | A | R | C | I | C |

## 3.5 語言模型能做與不能做

| 能做 | 不能做 |
|---|---|
| 解析與整合結構化資料 | 發現未提供的資產 |
| 依規則評分並解釋依據 | 驗證實際可利用性 |
| 生成攻擊路徑假設 | 執行掃描或測試 |
| 撰寫改善建議、驗證計畫、摘要 | 保證防止攻擊 |
| 標示缺漏與信心 | 取代授權與人工核准 |
