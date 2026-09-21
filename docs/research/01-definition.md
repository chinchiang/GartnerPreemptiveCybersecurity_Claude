---
title: 1. 定義、目標、適用範圍與傳統偵測回應的關係
order: 1
summary: Gartner 明確提出的定義、能力類別、數字預測與「取代獨立偵測回應」的主張；並區分本專案的解讀。
---

## 1.1 Gartner 的定義（Gartner 明確陳述）

Gartner 在 2025 年 9 月 18 日的新聞稿中給出目前最常被引用的定義 [G1]（多來源逐字）：

> "Preemptive cybersecurity technologies use advanced AI and machine learning (ML) to anticipate and neutralize threats before they materialize. It includes capabilities such as predictive threat intelligence, advanced deception and automated moving target defense."

中譯（本專案）：先制型資安技術運用進階 AI 與機器學習，在威脅成形之前預測並中和威脅；其能力包括預測性威脅情資（predictive threat intelligence）、進階欺敵（advanced deception）與自動化移動目標防禦（automated moving target defense，AMTD）。

同一份新聞稿的標題本身就是主張：「在 GenAI 時代，先制能力而非偵測與回應，才是資安的未來」。

2024 年的付費研究公開摘要（經 Morphisec、CYFIRMA 轉載）用了較早的名稱「preemptive cyber defense」[G12]：

> "Preemptive cyber defense is an emerging category of cybersecurity technologies designed to prevent, stop or deter cyberattacks from achieving their objectives."

2025 年廠商轉載的另一份研究 [G22] 把先制型資安定位為 proactive 的**子集合**：

> "Preemptive cybersecurity is a subset of proactive security approaches focused on defending against cyberthreats by identifying and mitigating likely attack vectors and related vulnerabilities before they can be exploited."

**本專案解讀**：三段文字的共同核心是「在利用（exploitation）發生前行動」，而不是「更快地偵測與回應」。這是本站流程設計的第一原則。

## 1.2 Gartner 的目標與主張（Gartner 明確陳述）

| 主張 | 原文（摘錄）| 來源 |
|---|---|---|
| 取代獨立偵測回應 | "By 2030, preemptive cybersecurity solutions will account for 50% of IT security spending, up from less than 5% in 2024, replacing standalone detection and response (DR) solutions as the preferred approach" | [G1] |
| 嵌入既有 DR 產品 | "By 2030, preemptive cybersecurity technologies will be included in 75% of security solutions that are currently focused solely on detection and response." | [G3] |
| DR 不足以對抗 AI 攻擊者 | Carl Manion："DR-based cybersecurity will no longer be enough to keep assets safe from AI-enabled attackers. Organizations will need to deploy additional countermeasures that act preemptively and independently of humans to neutralize potential attackers before they strike." | [G1] |
| 全球攻擊面網格 | Manion："Preemptive cybersecurity will soon be the new gold standard for every entity operating on, in, or through the various interconnected layers of the global attack surface grid (GASG)." | [G1] |
| CVE 爆量 | "by 2030 there will be over 1 million documented cybersecurity Common Vulnerabilities and Exposures (CVEs), up 300% from approximately 277,000 in 2025." | [G1] |
| 走向專用化與 agentic AI | "a shift from broad, one-size-fits-all DR security platforms toward more targeted and effective preemptive cybersecurity solutions, many of which will be based on agentic AI and domain-specific language models (DSLMs)." | [G1] |
| 2026 年十大策略科技趨勢 | Tori Paulman："Preemptive cybersecurity is about acting before attackers strike using AI-powered SecOps, programmatic denial and deception. This is a world where prediction is protection." | [G4] |
| 三個 D | "Preemptive cybersecurity solutions must deny, deceive and disrupt would-be attackers... 1) Deny attackers the opportunity to initiate attacks or access desired resources; 2) Disrupt ongoing attacks as they occur, and 3) Deceive attackers to divert them from critical assets." | [G3]（單一摘錄逐字） |
| 以預防而非反應建立韌性 | "Preemptive cybersecurity technologies build resilience against attacks by focusing on prevention, not reaction." | [G3] |

**注意**：50% 是「IT 資安支出占比」的預測，不是市場金額；廠商常把它當市場規模使用，這是**其他來源**的延伸用法。

## 1.3 Gartner 命名的能力類別（Gartner 明確陳述）

| 能力 | Gartner 公開描述 | 來源 |
|---|---|---|
| Predictive threat intelligence（PTI） | PTI 平台 "continuously collect information from a wide variety of sources — like security alerts, public online discussions, the dark web and records of past cyberattacks"，使組織能 "address vulnerabilities and exposures to boost your defenses before an attack even happens"；"serves as an early warning system to anticipate future attacks and prioritize preemptive mitigation" | [G3]、[G12] |
| Automated moving target defense（AMTD） | "AMTD leverages automation to dynamically adjust system configurations, ensuring a continuous and unpredictable environment."；Peer Insights 市場定義："a set of technologies and methods to make unpredictable automated changes to an IT environment, making it significantly harder for attackers to identify and exploit vulnerabilities" | [G3]、[G28] |
| Advanced deception | "Advanced cyber deception is often combined with moving target defense to add even more layers of 'moving targets.'"；"can shift the balance against attackers, and empower a preemptive cyber defense strategy" | [G3]、[G12] |
| 2026 年五大支柱 | "preemptive exposure management, adversary management and threat intelligence, adversary disruption, posture and policy management, and services and capabilities maturity" | [G27]（付費研究公開摘要） |
| 2026 年技術描述 | "Preemptive cybersecurity techniques include concealing assets, confusing attackers, and forecasting likely exploits" | [G25]（經廠商轉載） |

**待驗證（不列入明確陳述）**：一句在搜尋摘錄中出現、但頁面歸屬未能確認的描述——"This preemptive approach shifts security from 'detect-and-respond' to prevention, embedding predictive analytics, continuous exposure management and automated mitigations into operating systems, networks, applications and services."（單一摘錄；疑似出自 [G3]，見證據頁待驗證清單第 1 項）。

## 1.4 適用範圍（Gartner 明確陳述 + 本專案推論）

- **Gartner 的受眾**：2025 年的新聞稿與「Emerging Tech」系列主要面向**產品領導者與技術／服務提供者**（例如 "Product leaders must incorporate preemptive cyber defense capabilities" [G11]）；2026 年策略科技趨勢則面向 CIO（"enables CIOs to proactively defend assets" [G5]）。
- **本專案推論**：對終端企業而言，先制型資安不是一個可購買的單一產品，而是把「預測、曝險降低、欺敵、自動化變動」等能力嵌入既有安全計畫；最務實的切入點是曝險管理（見第 2 章）。
- **本專案推論**：語言模型在其中的角色是資料整合、規則化推理、假設生成與文件撰寫，不是 AMTD 或欺敵技術本身。

## 1.5 與傳統預防、偵測與回應的關係

**Gartner 明確陳述**：

- 先制型「取代**獨立的** DR 解決方案成為首選」[G1]，並將「嵌入 75% 目前只做 DR 的產品」[G3]。也就是 Gartner 的說法是「DR 不再足夠、需要額外的先制對策」，而不是「不再需要偵測與回應」。
- 一份 2025 年研究標題直接說明兩者關係：「Preemptive Cybersecurity Is Now Critical for Effective Detection and Response」[G19]，摘要要求產品領導者 "shift investment priorities from reactive threat detection and response to preemptive cybersecurity"。
- Hype Cycle for Security Operations 2026 的公開摘要定義安全營運為 "identify, validate and manage threats and exposures" [G26]，把「曝險」與「威脅」並列。

**其他來源**：多家廠商把先制型資安對映到 Gartner 早年的「Predict–Prevent–Detect–Respond」框架 [G31]。但在本研究抓到的 2025–2026 Gartner 先制型資安文本中，**沒有**明確引用該框架；最接近的公開語句是 Paulman 的 "prediction is protection" [G4] 與 Morphisec 對 Impact Radar 的轉載摘要中的 "predict, prevent, and neutralize" [V8]（廠商轉述，Impact Radar 原文用語為 "deny, disrupt, and deceive" [G-IR]）。

**本專案推論**（下表）：

| 面向 | 傳統預防（prevention） | 偵測與回應（DR） | 先制型（preemptive） |
|---|---|---|---|
| 時間點 | 攻擊前，靜態 | 攻擊中／後 | 攻擊前，持續且動態 |
| 主要問題 | 「我們的控制是否到位？」 | 「我們被攻擊了嗎？多快能處理？」 | 「攻擊者最可能怎麼打？我們能不能先讓那條路不可行？」 |
| 典型輸入 | 基準、政策 | 日誌、告警、遙測 | 資產、曝險、身分、情資、拓樸、控制 |
| 典型輸出 | 設定、修補 | 事件、處置 | 優先序、路徑假設、阻斷／欺敵／變動措施、驗證計畫 |
| 與本專案流程的對應 | S5 改善建議 | 不在範圍（但 S8 指標回饋給 SOC） | S1–S8 |

## 1.6 Gartner《Emerging Tech Impact Radar: Preemptive Cybersecurity》（2025-10-07）— 已讀全文 [G-IR]

這是本研究唯一讀過全文的 Gartner 研究文件（使用者提供之授權轉載版）。它面向**產品領導者**，分析 11 項新興技術與趨勢的「範圍（range，距離早期多數採用的年數）」與「質量（mass，對市場的影響）」。以下皆為 Gartner 明確陳述。

**核心敘述**（第 2 頁）：

> "Preemptive cybersecurity (PCS) is an emerging trend and related set of advanced technologies that are quickly becoming recognized as a critical component for business resilience within the AI vendor race. ... Unlike traditional detection and response security solutions, they don't wait for cyberattacks to appear. Instead, they actively seek to prevent them through a combination of methods that are designed to deny, disrupt, and deceive attackers."

**三個主題**：Radar 把 11 項技術依影響所在分為 1) operations、2) intelligence、3) infrastructure。

**關鍵發現**（第 1 頁）：

- "AI and machine learning (ML) technologies must be used to anticipate attack paths and predict where an adversary is likely to strike to more effectively neutralize potential attacks before they begin."（**注意：這是 Gartner 在先制型資安文本中明確點名「攻擊路徑」的句子**，修正了本研究第 2 章原先依搜尋摘錄所做的判斷。）
- "The future of cybersecurity is defined not by static defenses, but by dynamic infrastructure. ... By implementing continuous, adaptive changes, organizations can make their infrastructure inherently more resilient and unpredictable, effectively neutralizing threats by denying attackers a stable target."

**給 C 級主管的建議**（第 2 頁）：把資本轉向能「analyze network behavior, simulate attacks, and continuously adapt technology infrastructures」的先制型方案；優先投資 predictive threat intelligence 與 intelligent simulation；從靜態防禦轉為持續適應。

**11 項技術的定義、範圍與質量**：

| 技術 | Gartner 定義（摘錄） | 範圍 | 質量 |
|---|---|---|---|
| Preemptive exposure management（PEM） | "a critical shift from generalized proactive defense to a targeted and intelligence-driven strategy for reducing exposure risk before exploitation occurs. PEM solutions leverage artificial intelligence, intelligent simulation and analytics to accelerate one or more aspects of the continuous threat exposure management (CTEM) process, such as continuous attack surface enumeration, high-accuracy validation, or both automated and guided mitigation." | 1–3 年 | 極高 |
| Predictive threat intelligence（PTI） | "to forecast the likelihood of future cyberattacks and provide early insights on emerging threats ... PTI is a critical emerging technology that is foundational to preemptive cybersecurity strategies." PTI 會擴充 EAP、AEV、ASCA。 | 1–3 年 | 高 |
| Automated security control assessment（ASCA） | "continuously analyze, prioritize and optimize security control configurations to minimize threat exposure ... When combined with asset context, vulnerability data and threat intelligence, ASCA provides comprehensive security posture analysis, enabling organizations to preemptively address and prioritize mitigation of deficiencies prior to breach." | 1–3 年 | 高 |
| Advanced cyber deception | "uses deceptive techniques to proactively detect and counter cyberthreats ... automate the deployment of deceptive elements and adapt behavior based on how attackers interact with them" | 1–3 年 | 低（主流採用慢且產業差異大） |
| Secure software-defined storage（SSDS） | 在儲存層主動防禦資料（例如偵測大量刪除、未授權加密即阻斷存取） | 1–3 年 | 中 |
| Autonomous adversarial emulation（AAE） | "combines predictive machine learning models with historical and simulated threat actor behavior to perform real-time emulation and simulation of cyberattacks ... autonomously creating and executing tailored attack playbooks" | 3–6 年 | 高 |
| Cybersecurity precrime platforms | 以歷史資料、AI 與預測分析預測可能的網路犯罪 | 3–6 年 | 中 |
| Advanced obfuscation | 轉換程式碼／資料使其對人與工具不可理解但保留功能；具雙重用途 | 3–6 年 | 中 |
| Automated moving target defense（AMTD） | "dynamically change or move system resources, creating a constantly shifting attack surface ... shifting parameters like IP addresses, memory layouts and network configurations" | 3–6 年（文中）| 極高 |
| Quantum computing security / PQC | 後量子密碼移轉；"public key cryptographic algorithms will be broken between 2029 and 2031" 的預期 | 6–8 年 | 高 |
| Zero-trust stealth networking | 在零信任之上加「隱形」層，使關鍵資源對未授權者不可見 | 6–8 年 | 高 |

**Impact Radar 內的數字預測**（Gartner 明確陳述）：

- "by 2027, 40% of broad portfolio security providers will offer ASCA features, up from less than 5% today."
- "by 2029, predictive analytics will be a feature in 80% of threat intelligence solutions."
- "intelligent threat simulation will be embedded in 45% of exposure management solutions by 2027 and ... exposure validation will be an accepted alternative to traditional penetration testing by 2028."
- "stealth networking could represent 25% of the total zero-trust market by 2028."

**對本專案的意義**（本專案推論）：PEM 的定義直接把先制型資安錨定在「加速 CTEM 流程」；PTI「擴充 EAP／AEV／ASCA」的描述，與本專案把情資當作優先序加權因子、把設定偏差與控制覆蓋納入評分的設計一致。AAE 與 AMTD 屬 3–6 年技術，本專案流程只把它們列為「驗證方法選項」與「補償控制選項」，不假設組織已具備。

## 1.7 本章小結

- 可驗證的核心：定義（AI/ML 在威脅成形前預測並中和）、三個命名能力（PTI、deception、AMTD）、兩個 2030 年預測（50% 支出、75% 產品；50% 支出預測另見媒體轉載 [M1][M2]）、CVE 破百萬預測、「取代獨立 DR」的定位、Impact Radar 的「deny, disrupt, and deceive」[G-IR]。
- 需要小心的：「三個 D」在 [G3] 只有單一搜尋摘錄，仍待原頁核對；50% 不是市場金額；「predict–prevent–detect–respond」對映是他人詮釋；「35% by 2028」（僅見於 Silent Push 轉載頁與 Splunk 部落格 [V5]）、「ACIS 75%」等數字待驗證（見證據頁）。
- 已讀全文的 Impact Radar [G-IR] 補充了 11 項技術的定義、範圍與質量，並明確提到「anticipate attack paths」。
