---
title: 2. 與 CTEM、威脅情資、攻擊面管理、曝險管理、攻擊路徑分析、安全驗證及欺敵技術的關聯
order: 2
summary: 逐項說明每個關聯的證據來源；Gartner 有說的標為明確陳述，沒有說的標為推論。
---

## 2.1 概念關係總覽（本專案推論，依據下列各節證據）

```
                         ┌──────────────── Preemptive Cybersecurity（Gartner 定義）────────────────┐
                         │  AI/ML 在威脅成形前預測並中和；能力例：PTI、advanced deception、AMTD     │
                         │  2026 五支柱：preemptive exposure management / adversary mgmt & TI /     │
                         │  adversary disruption / posture & policy / services maturity           │
                         └───────────┬────────────────────┬──────────────────┬────────────────────┘
                                     │                    │                  │
              ┌──────────────────────▼──────┐   ┌─────────▼────────┐  ┌──────▼──────────────┐
              │ Exposure management / CTEM  │   │ Threat intelligence│  │ Deception / AMTD   │
              │ （Gartner：proactive → 加速  │   │ （Gartner：PTI 是  │  │ （Gartner：三個命名 │
              │  preattack cycle 才是        │   │  預警系統；情資轉型）│  │  能力之二）        │
              │  preemptive）               │   └──────────────────┘  └─────────────────────┘
              │  scoping → discovery →       │
              │  prioritization → validation │
              │  → mobilization             │
              └──┬──────────┬──────────┬────┘
                 │          │          │
        ┌────────▼───┐ ┌────▼──────────┐ ┌──▼────────────────────┐
        │ 攻擊面管理  │ │ 攻擊路徑分析   │ │ 安全驗證（AEV：BAS、  │
        │ EASM／EAP  │ │（Gartner Impact│ │ 自動滲透、紅隊）      │
        │（Gartner：  │ │ Radar：       │ │（Gartner：AEV 證明   │
        │ discovery／ │ │ anticipate    │ │ 曝險可被利用；        │
        │ scoping 的  │ │ attack paths  │ │ 驗證是 CTEM 第四階段）│
        │ 工具類別）  │ │ [G-IR]；方法為 │ │                       │
        │            │ │ 本專案推論）  │ │                       │
        └────────────┘ └───────────────┘ └───────────────────────┘
```

## 2.2 CTEM（Continuous Threat Exposure Management）

**Gartner 明確陳述**

- CTEM 定義（2024 年 2 月新聞稿 [G7]）："a pragmatic and systemic approach organizations can use to continually evaluate the accessibility, exposure and exploitability of digital and physical assets, aligning assessment and remediation scopes with threat vectors or business projects rather than an infrastructure component."
- 五個階段（免費文章 [G8]）：
  1. **Scoping**："define the scope of the CTEM initiative by understanding what is important to business counterparts and what impacts warrant remedial effort"
  2. **Discovery**："identify assets within that scope and their risk profiles"
  3. **Prioritization**："based on urgency, severity, ability to remediate and level of risk posed to the organization"
  4. **Validation**："uses controlled simulation or emulation of an attack ... red team or penetration testing exercises, or ... breach and attack simulations, and also assesses suggested remediation approaches for their efficacy and organizational feasibility"
  5. **Mobilization**："reduce friction in the approvals for treatments ... define communication standards and document cross-team approval workflows"
- 預測："By 2026, Gartner predicts that organizations prioritizing their security investments based on a CTEM program will realize a two-thirds reduction in breaches." [G7]（廠商常引用 2022 年付費研究的另一種寫法「three times less likely」[G30]，數值等價；後者未在免費頁面確認。Vectra 引用時自註該數字 "directionally supported, but not empirically validated" [V7]，提醒讀者這是預測而非實證。）
- **CTEM 與先制型的關係**（付費研究公開摘要 [G16]）："Exposure management supports a proactive approach to cybersecurity for the modern attack surface. However, with the increase in sophistication of cyberattacks, it must accelerate the preattack cycle — from identification to mitigation — to effectively transition from proactive to preemptive."
- 經廠商轉載 [G22]："Continuous threat exposure management is a process-oriented Gartner framework for buyers to proactively identify where they have risk."
- Impact Radar 對 PEM 的定義 [G-IR]："accelerate one or more aspects of the continuous threat exposure management (CTEM) process, such as continuous attack surface enumeration, high-accuracy validation, or both automated and guided mitigation."——這是 Gartner 把先制型資安與 CTEM 直接連結的最明確句子，且已讀全文。
- 2026 年研究把 "preemptive exposure management" 列為先制型資安五支柱之首 [G27]。

**其他來源**：Morphisec 部落格引述 Gartner 對 PEM 的描述 "is not a new technology category; rather, it represents progressive techniques for executing exposure management activities" [V8]（廠商轉載，非授權 reprint，未在 Gartner 頁面確認）。

**本專案推論**：CTEM 是「流程」，先制型資安是「目標狀態與技術方向」。把 CTEM 的五階段加速到「攻擊者行動之前」，並加入預測、欺敵、自動化變動，就是 Gartner 所謂 proactive → preemptive。本專案的八步流程因此以 CTEM 五階段為骨架（S1 對應 scoping、S2 對應 discovery、S3–S4 對應 prioritization、S6 對應 validation、S5/S7 對應 mobilization），再加上情資與追蹤。

## 2.3 威脅情資（Threat Intelligence）

**Gartner 明確陳述**

- PTI 是三個命名能力之一 [G1]；「作為預警系統，預測未來攻擊並排定先制緩解的優先序」[G12]。
- 2025 年研究指出 AI 型 PTI 的成敗取決於 "the accuracy of underlying AI and ML algorithms, the quality and quantity of data used to train these models, and the availability of solution integrators" [G18]。
- 2026 年五支柱之二為 "adversary management and threat intelligence" [G27]。
- Impact Radar 對 PTI 的定義（見第 1 章 1.6 表 [G-IR]）：PTI "forecast the likelihood of future cyberattacks and provide early insights on emerging threats"，並會擴充 EAP、AEV、ASCA——也就是情資不只是獨立產品，而是曝險管理、驗證與控制評估的加值層。

**其他來源**：Hype Cycle for Security Operations 2026 的第三方摘要提到「威脅情資正在轉型」[V9]。

**本專案推論**：在沒有 PTI 平台的組織，情資最務實的用法是「加權」：把已知遭利用、產業內活躍行為者的 TTP 與弱點對映到自己的曝險，提升優先序。本專案示範規則中的「情資命中」加權（依行為者信心 high 2／medium 1.5／low 1）即為此設計；它不是預測，只是加權。

**與本流程的具體對應**：I9 威脅情資只要求 `actors[].exploits_vuln_ids`、`ttps` 與 `confidence` 三個欄位，正是 [G18] 三個成敗因子中「資料品質」的最低要求；`confidence` 決定加權幅度，避免低信心情資推高優先序。缺 I9 時流程不做加權並把信心下修一級，對應 [G12] 把 PTI 描述為「預警系統」——沒有預警，結論只能更保守。情資也回饋到 S8：`trending_weakness_classes` 可作為下次檢視時擴大 discovery 範圍的依據。

## 2.4 攻擊面管理（Attack Surface Management）

**Gartner 明確陳述**

- Exposure Assessment Platforms（EAP）市場定義：EAP "help enterprises manage Continuous Threat Exposure Management (CTEM) programs by scoping the attack surface, prioritizing exposures, and enabling remediation." [G29]
- 2026 年「Top Funded Startups for Preemptive Exposure Management」摘要把 "preemptive exposure assessment (PEA)" 定義為 "technologies that continuously discover and map attack surfaces and prioritize findings by enriching them with deep business context" [G32]。
- Gartner 提到「全球攻擊面網格（GASG）」的擴張是先制型資安的驅動力 [G1]。
- Impact Radar 對 PEM 的定義把 "continuous attack surface enumeration" 列為 PEM 要加速的 CTEM 面向之一 [G-IR]（見第 1 章 1.6 表）。

**待驗證**：Gartner 對 External Attack Surface Management（EASM）與 CAASM 本身的市場定義頁在研究環境無法開啟，本章未引用；讀者應以 Gartner Peer Insights 的 EASM 市場定義為準（列入證據頁待驗證清單）。

**本專案推論**：外部攻擊面管理（EASM）輸出對應本流程的 S2 discovery，也是「未納入清冊的對外資產」這個指標的來源。

**與本流程的具體對應**：本流程刻意把 EASM 與 CAASM 的角色分開——EASM（I4）回答「從外面看得到什麼」，包括 `asset_id: null` 的未知資產；資產清冊／CAASM（I2）回答「我們自己知道有什麼」。兩者的差集就是 S8「未納入清冊的對外資產」指標，也是 S2 資料品質報告中「資產清冊完整度估計」的依據。I4 的 `issues[]`（例如過期 TLS、匿名列出）在 S3 只加 0.5 分，因為 EASM 議題是「訊號」而非已確認的可利用弱點；把它與 I3 的弱點區分開，避免同一問題被重複計分。

## 2.5 曝險管理（Exposure Management）

**Gartner 明確陳述**

- 「曝險管理的未來是先制型」[G21]：C 級主管 "must incorporate new methods such as intelligent simulation, AI-enabled remediation and automated moving target defense to enable a preemptive approach to managing exposures at scale."
- 「曝險管理廠商不先制就淘汰」[G22]："To survive and thrive, vendors must deliver preemptive exposure management solutions."；區隔技術包括 "ASCA, cyber ranges, predictive threat intelligence, autonomous adversarial emulation and cybersecurity knowledge graphs"。
- 2026 年研究指出價值 "is rapidly shifting beyond just visibility and prioritization to autonomous validation and mitigation" [G32]；四種 PEM 類別：PEA、PEV、UEMP、DSEM。

**其他來源**：統一曝險管理平台 "will capture 60% of the market by 2028" [G24]——此數字只見於 Picus／BleepingComputer 對 Gartner 文件的引用，未在 Gartner 公開摘要確認。

**本專案推論**：Gartner 的先制型曝險管理強調「從發現到消除的時間窗口」；本流程的 S8 指標因此包含「對外曝露且 P1 的發現數（目標 7 天內歸零）」。

## 2.6 攻擊路徑分析（Attack Path Analysis）

**證據狀態（修正）**：在公開網頁的搜尋摘錄中，沒有 Gartner 先制型資安文本點名「attack path analysis」；但已讀全文的 Impact Radar [G-IR] 在關鍵發現中明確寫道："AI and machine learning (ML) technologies must be used to **anticipate attack paths** and predict where an adversary is likely to strike"，並在 PTI 一節指出 PTI 會用於 "correlate and enrich findings and analyses of alerts, threats, vulnerabilities and **attack paths**"。因此「預測攻擊路徑」是 **Gartner 明確陳述**；而「以圖論分析關鍵節點（choke point）」等具體方法則來自廠商內容（例如 XM Cyber [V6]）與 AI 生成報告 [U2]，屬其他來源。Gartner AEV 市場定義中的「攻擊情境」概念（"performing attack scenarios and modeling or measuring the outcome" [G28b]）與此相呼應。

**本專案推論**：攻擊路徑分析是把「單一弱點的優先序」提升為「可達 crown jewel 的路徑優先序」的方法，與 Gartner 的 "anticipate attack paths" [G-IR]、"identifying and mitigating likely attack vectors" [G22] 和 "forecasting likely exploits" [G25] 一致。本流程的 S4「攻擊路徑假設」即為此設計，並強調輸出是**假設**，需要 S6 驗證。

## 2.7 安全驗證（Security Validation）

**Gartner 明確陳述**

- Adversarial Exposure Validation（AEV）市場定義 [G28b]："technologies that deliver consistent, continuous and automated evidence of the feasibility of an attack. These technologies confirm how potential attack techniques would successfully exploit an organization and circumvent prevention and detection security controls by performing attack scenarios and modeling or measuring the outcome to prove the existence and exploitability of exposures."；AEV 取代了 2023 年 Hype Cycle 上的 BAS 與自動滲透測試／紅隊技術類別。
- 驗證是 CTEM 第四階段 [G8]。
- 2026 年 AEV 市場指南預測 "By 2029, 30% of organizations will link AEV results to automated remediation or orchestration workflows" [G28c]（經廠商轉載）。
- 「智慧模擬」研究：產品領導者 "must enable what-now, what-if and what-next security scenarios by simulating adversarial behaviors" [G23]。

**其他來源**：Picus 稱 "Gartner identifies validation as the inflection point between proactive and preemptive cybersecurity" [V4]。此句為廠商轉述，未在 Gartner 公開頁面找到原文。

**本專案推論**：語言模型**不能**執行驗證；它只能產生「驗證計畫」（S6），並要求授權旗標與人工核准。

**與本流程的具體對應**：S6 的四種方法選項（授權下的外部版本確認、內部 BAS、桌面演練、讀取式驗證）對應 AEV 定義中「performing attack scenarios and modeling or measuring the outcome」的兩端 [G28b]——前兩者是「執行情境」，後兩者是「建模／量測」。I1 的兩個授權旗標決定哪一端可用：`external_scanning_authorized` 與 `active_testing_authorized` 任一為 false，S6 每項都標「尚未授權主動測試」，只剩桌面演練與讀取式驗證。Impact Radar 對 AAE（autonomous adversarial emulation）的描述提醒，在製造、醫療與關鍵基礎設施等低容錯環境採用受限 [G-IR]，因此本流程對 OT 資產一律排除主動測試。驗證結果回填 O2 的 `status`（validated-feasible／validated-blocked），這是路徑假設唯一能離開 `hypothesis` 狀態的途徑。

## 2.8 欺敵技術（Deception）

**Gartner 明確陳述**

- 三個命名能力之一 [G1]；"Deceive attackers to divert them from critical assets" 是三個 D 之一 [G3]；常與 AMTD 結合 [G3]；"can shift the balance against attackers" [G12]。
- AMTD 市場定義中把 "deception technologies to mislead attackers" 列為組成 [G28]。

**其他來源**：CounterCraft 稱 Gartner "named deception technology as one of three core capabilities in this shift" [V2]，與 [G1] 一致。

- Impact Radar 對 advanced cyber deception 的定義（第 1 章 1.6 表 [G-IR]）："automate the deployment of deceptive elements and adapt behavior based on how attackers interact with them"；範圍 1–3 年，但 Gartner 評其市場「質量」為低，理由是主流採用慢且產業差異大。

**本專案推論**：在流程中，欺敵不是分析步驟而是「改善建議」的一種選項：當路徑假設的阻斷成本高（例如 OT 無法修補），可建議在路徑節點部署誘餌帳號／憑證（honey accounts/tokens）作為補償控制，並列入 S8 指標。

**與本流程的具體對應**：合成案例的 `controls.json` 把 "Deception (honey accounts/tokens)" 列為成熟度 none 的控制，因此 S3 對 ad-dc-01、erp-db-01、file-srv-01 各加一項「控制缺口」，S5 對無修補的 OT 主機建議部署誘餌憑證作為補償控制。這與 Gartner 把欺敵評為「質量低」並不矛盾：本流程只把它當成本低、可局部部署的選項，不假設組織已有欺敵平台；是否採用仍是 S5 人工決策點（變更委員會／OT 負責人）的判斷。

## 2.9 對照表：關聯的證據等級

| 關聯 | Gartner 明確陳述 | 其他來源 | 本專案推論 |
|---|---|---|---|
| CTEM ↔ 先制型 | proactive → preemptive 需加速 preattack cycle [G16]；五支柱之首 [G27] | Cymulate、Picus 等 | 八步流程以 CTEM 為骨架 |
| 威脅情資 | PTI 為命名能力 [G1][G12]；PTI 定義與擴充 EAP／AEV／ASCA [G-IR] | Dropzone 摘要 [V9] | 情資作為加權因子（依 confidence） |
| 攻擊面管理 | EAP／PEA 定義 [G29][G32]；attack surface enumeration 為 PEM 面向 [G-IR] | —（EASM 市場定義待驗證） | EASM 與清冊差集 → 未知資產指標 |
| 曝險管理 | 曝險管理的未來是先制型 [G21][G22][G32] | Morphisec [V8]、Picus 對 G24 的引用 | 時間窗口指標 |
| 攻擊路徑分析 | Impact Radar："anticipate attack paths" [G-IR]（網頁摘錄中未見） | XM Cyber、AI 生成報告 [U1][U2] 的 choke point 方法 | 路徑假設（S4） |
| 安全控制評估（ASCA）| Impact Radar：結合資產脈絡、弱點與情資可「preemptively address and prioritize mitigation of deficiencies prior to breach」[G-IR] | — | 設定偏差與控制覆蓋因子（S3） |
| 安全驗證 | AEV 定義 [G28b]；CTEM 第四階段 [G8]；AAE 在低容錯產業受限 [G-IR] | Picus「轉折點」說法 [V4] | 模型只提案；兩旗標決定方法 |
| 欺敵 | 命名能力、三個 D 之一 [G1][G3]；Impact Radar 定義與「質量低」評估 [G-IR] | CounterCraft [V2] | 作為補償控制選項 |
