# 示範評分規則（本專案推論，非 Gartner 公式）

使用者若提供自己的風險模型，改用之並在輸出 `meta.scoring_rules` 說明。

欄位對應：範例資料的 `epss_sim`、`kev_sim` 視同 `epss`、`kev`（模擬值）。

## 1. 可能性（likelihood，0–10）

| 因子 | 加減分 | 輸入來源 |
|---|---|---|
| 對外曝露 `internet_exposed=true` | +3 | assets |
| EASM 有 `issues` | +0.5 | exposures |
| 公開利用程式 `exploit_public=true` | +2 | vulnerabilities |
| EPSS | +3 × epss | vulnerabilities |
| KEV（已知遭利用）| +3 | vulnerabilities |
| 身分弱點（連結帳號無 MFA、部分 MFA、或 > 90 天未登入）| +0.8 × min(2, 數量) | identities |
| 設定偏差（status=fail）| +0.8 × min(1.5, 數量 × 0.75) | misconfigurations |
| 既有控制覆蓋 | −0.8 × min(2, 數量 × 0.6) | controls.coverage_assets |
| 控制缺口 | +0.8 × min(1.5, 數量 × 0.4) | controls.gaps |
| 威脅情資命中（`exploits_vuln_ids` 含此 vuln_id）| +2（行為者 confidence high）／+1.5（medium）／+1（low）| threat_intel |

缺 EPSS/KEV 時：改用 `cvss_base / 10 × 1.5`，並標示「改用 CVSS 近似」。

## 2. 影響（impact，0–10）

`impact = clamp(business_criticality × 1.4 + data_weight + 2 × [crown_jewel] + 2 × [可達 crown jewel 之入口], 0, 10)`，其中 data_weight：Restricted 3、Confidential 2、Internal 1、Public 0。

## 3. 分數與分級

`score = likelihood × impact`（0–100）。

| 風險胃納 | P1 | P2 | P3 |
|---|---|---|---|
| 嚴格 | ≥ 50 | ≥ 30 | ≥ 15 |
| 平衡（預設）| ≥ 60 | ≥ 40 | ≥ 20 |
| 寬鬆 | ≥ 70 | ≥ 50 | ≥ 25 |

## 3a. 驗證計畫的授權標示

`scope.authorized_scope.active_testing_authorized` 與 `external_scanning_authorized` 任一為 false → 驗證計畫每項標「尚未授權主動測試」；涉及對外驗證（入口 `internet_exposed=true`）的項目需兩旗標皆 true 才可標「已授權」。

## 4. 攻擊路徑可行性（0–10）

`feasibility = clamp(entry_likelihood × 0.5 + weakest_node_likelihood × 0.3 + (identity 或 misconfig 邊數) × 1.0 − (hops − 1) × 0.6, 0, 10)`

- 入口：`edges` 中 `from = "internet"` 的節點。
- 節點可能性：該資產有發現者取其最高 likelihood（可為 0）；完全沒有任何發現的節點取 3（未知）。
- 只走 `in_scope_assets` 內的節點；最多 5 跳；不重複節點。
- 每條路徑列出「可能阻斷控制」：路徑上任一節點的 `controls.coverage_assets` 與 `trust` 類型對應（identity → MFA／特權管理；network → 網段隔離；misconfig → 設定修正；exposed → 修補／WAF）。

## 5. 追蹤指標（至少 6 項）

1. 對外曝露且 P1 的發現數（目標 0，7 天內）
2. P1/P2 總數（目標每週下降）
3. 可達 crown jewel 的路徑假設數（目標每條至少一個已驗證阻斷點）
4. 高信心輸出比例（目標 ≥ 80%）
5. 資產清冊完整度估計（目標 ≥ 95%）
6. 未納入清冊的對外資產數（目標 0）
7. （選用）P1 平均修補天數、驗證完成率

## 6. 缺漏替代規則

| 缺少 | 替代 | 標示 |
|---|---|---|
| exposures | 以 `internet_exposed` 近似 | 「未經 EASM 確認」 |
| epss/kev | CVSS 近似 | 「改用 CVSS 近似」 |
| identities | 不計身分因子；路徑中的 identity 邊標「未知」 | 「未納入身分資料」 |
| misconfigurations | 不計設定因子 | 「未納入設定資料」 |
| controls | 假設無補償控制 | 「假設無既有控制（保守）」 |
| threat_intel | 不加權 | 「未納入威脅情資」 |
| topology | 跳過路徑假設（計為缺一類，信心下修） | 「無拓樸，僅單資產排序」 |
| business_criticality | 以資料等級推估：Restricted→5、Confidential→3、Internal→2 | 「重要性為推估」 |
