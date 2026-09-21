---
title: 4. 必要與選用的 Inputs
order: 4
summary: 逐項說明每個輸入的用途與必要性、資料來源與格式、更新頻率、品質要求、敏感程度與缺漏替代方案。
---

> 本章為本專案推論。分類依據：Gartner 對 discovery 與 prioritization 的描述 [G8]、ASCA 的「asset context, vulnerability data and threat intelligence」[G-IR]、PEA 的「deep business context」[G32]。網站「Inputs／Outputs 對照」頁提供可篩選版本。

## 4.1 總表

| 編號 | 輸入 | 必要性 | 對應步驟 | 敏感度 |
|---|---|---|---|---|
| I1 | 授權範圍與分析參數 | 必要 | S1、S6、S7 | 中 |
| I2 | 資產清冊 + 業務重要性 | 必要 | S2、S3、S4、S8 | 高 |
| I3 | 弱點與發現 | 必要 | S2、S3、S5 | 高 |
| I4 | 外部曝險（EASM） | 建議 | S2、S3、S8 | 高 |
| I5 | 利用可能性訊號（EPSS／KEV／公開利用） | 建議 | S3 | 低（公開資料）|
| I6 | 身分與權限 | 建議 | S3、S4 | 極高 |
| I7 | 設定基準偏差 | 選用 | S3、S5 | 高 |
| I8 | 既有控制措施 | 建議 | S3、S4、S5 | 高 |
| I9 | 威脅情資 | 建議 | S3、S8 | 中 |
| I10 | 網路拓樸／信任關係 | 建議 | S4、S6 | 極高 |

## 4.2 逐項說明

### I1 授權範圍與分析參數（scope）

- **用途與必要性**：定義誰授權、分析哪些資產、是否允許任何主動測試、報告給誰。**沒有 I1 不得分析。**
- **來源／格式／頻率**：CISO 或資安治理；JSON（見 `input-schema.json`）；每次分析或範圍變更時更新。
- **品質要求**：`in_scope_assets` 必須與 I2 的 `asset_id` 對得上；授權旗標明確為布林值；有授權參考編號。
- **敏感程度**：中（揭露組織的關注重點）。
- **缺漏替代**：無替代；停止並要求補齊。

### I2 資產清冊 + 業務重要性（assets）

- **用途**：所有評分的基礎；`business_criticality` 與 `data_classification` 決定影響分數；`internet_exposed` 是可能性最大單一因子。
- **來源／格式／頻率**：CMDB、CAASM、雲端資產 API、人工盤點；CSV/JSON；每週或變更時。
- **品質要求**：`asset_id` 唯一；重要性 1–5 由業務擁有者給定而非 IT 猜測；完整度估計 ≥ 95%（指標）。
- **敏感程度**：高（主機名稱、擁有者）。
- **缺漏替代**：缺 `business_criticality` 時以資料等級推估（Restricted→5、Confidential→3、Internal→2）並標示「推估」；清冊不完整時信心下修並列為指標。

### I3 弱點與發現（vulnerabilities）

- **用途**：可能性的技術基礎；`cvss_base` 為最低要求。
- **來源／格式／頻率**：弱點掃描器、雲端態勢工具、滲透測試報告；CSV/JSON；每週。
- **品質要求**：`asset_id` 對得上 I2；CVSS 0–10；`vuln_id` 可回溯（真實環境為 CVE／廠商公告，合成資料為 `SYN-*`）。
- **敏感程度**：高。
- **缺漏替代**：只能產出「曝險面清單」（依對外曝露與設定），並詢問是否繼續。

### I4 外部曝險（exposures，EASM 輸出）

- **用途**：確認哪些資產真的對外可達、有哪些議題（過期憑證、舊版指紋）、以及**未納入清冊的對外資產**。
- **來源／格式／頻率**：EASM 工具、外部掃描服務（需授權）；JSON；每週或每日。
- **品質要求**：`asset_id` 對應；`asset_id: null` 的項目要保留（這正是價值所在）。
- **敏感程度**：高（對外足跡）。
- **缺漏替代**：以 I2 的 `internet_exposed` 近似，標示「未經 EASM 確認」；指標「未納入清冊的對外資產」顯示「未知」。

### I5 利用可能性訊號（exploit_public、epss、kev）

- **用途**：把「嚴重」轉為「可能被利用」。KEV 表示已知遭利用；EPSS 為未來 30 天被利用機率；公開利用程式提高可能性。
- **來源／格式／頻率**：FIRST EPSS、CISA KEV、廠商公告；欄位附在 I3；每日。
- **品質要求**：EPSS 0–1；KEV 布林；資料日期。
- **敏感程度**：低（公開）。
- **缺漏替代**：以 `cvss_base / 10 × 1.5` 近似並標示。AI 生成報告 [U1] 提醒 EPSS 未以實際利用校準、KEV 具滯後性，因此本流程建議三訊號併用（其他來源，需查證）。

### I6 身分與權限（identities）

- **用途**：攻擊路徑中最常見的「邊」。特權帳號無 MFA、閒置管理員、服務帳號過度授權都提高可能性。
- **來源／格式／頻率**：AD／IdP 匯出、PAM、IGA；CSV/JSON；每週。
- **品質要求**：`linked_assets` 指向存在的資產；`mfa_enabled` 明確；`last_login_days` 有值。
- **敏感程度**：極高（帳號名稱）。輸出預設遮罩。
- **缺漏替代**：不計身分因子；路徑中的 identity 邊標「未知」；信心下修。

### I7 設定基準偏差（misconfigurations）

- **用途**：對應 Gartner 對 ASCA 的定義「continuously analyze, prioritize and optimize security control configurations to minimize threat exposure」[G-IR]（見第 1 章 1.6 表）；設定議題常是無修補時的主要曝險。
- **來源／格式／頻率**：CIS 基準掃描、雲端 CSPM、ASCA 工具；CSV/JSON；每週。
- **品質要求**：`status` 為 pass/fail/unknown；`control` 可對應基準條目。
- **敏感程度**：高。
- **缺漏替代**：不計設定因子；標示。

### I8 既有控制措施（controls）

- **用途**：避免「已被控制降低的曝險」被高估；同時找出控制缺口作為補償控制建議。
- **來源／格式／頻率**：控制清冊、EDR／WAF／備份系統的覆蓋報表、ASCA；JSON；每月。
- **品質要求**：`coverage_assets` 與 `gaps` 互斥且指向存在資產；`maturity` 使用固定詞彙。
- **敏感程度**：高（揭露防禦盲點）。
- **缺漏替代**：假設無補償控制（保守），標示。

### I9 威脅情資（threat_intel）

- **用途**：對應 Gartner PTI「early warning」與「prioritize preemptive mitigation」[G12][G-IR]；在本流程作為加權而非預測。
- **來源／格式／頻率**：ISAC、商業情資、政府通報、PTI 平台；JSON；每日或每週。
- **品質要求**：每個行為者有 `confidence`；`exploits_vuln_ids` 使用與 I3 相同的識別碼；`as_of` 日期。
- **敏感程度**：中。
- **缺漏替代**：不加權；標示「未納入威脅情資」；信心下修。

### I10 網路拓樸／信任關係（topology）

- **用途**：攻擊路徑假設的唯一來源；`crown_jewels` 定義目標；`trust` 類型決定阻斷控制。
- **來源／格式／頻率**：網段圖、防火牆規則摘要、AD 信任、雲端 IAM 關係、CAASM；JSON；每月或變更時。
- **品質要求**：邊指向存在資產；`trust` 使用固定詞彙（exposed、network、identity、app-trust、misconfig、user-pivot、data）；不含實際驗證結果。
- **敏感程度**：極高（等同「王冠珠寶地圖」[U1]）。
- **缺漏替代**：跳過 S4，只做單資產排序；在 O5 說明。

## 4.3 資料治理提醒

- I2、I6、I10 合併後是攻擊者最想要的資料。送往任何外部模型 API 前需資料分類與供應商評估；示範一律用合成資料。
- 所有輸入都應有 `as_of` 或分析日期，讓 O6 能追蹤新鮮度。
