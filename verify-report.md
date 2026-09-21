# 驗證報告

執行時間：2026-09-21T07:22:50.499Z
模式：full
結果：102/102 通過

| 檢查 | 結果 | 說明 |
|---|---|---|
| 載入 data/manifest.js | ✅ |  |
| 載入 data/research.js | ✅ |  |
| 載入 data/guides.js | ✅ |  |
| 載入 data/skills.js | ✅ |  |
| 載入 data/case.js | ✅ |  |
| 載入 data/process.js | ✅ |  |
| 載入 data/io.js | ✅ |  |
| 載入 data/platforms.js | ✅ |  |
| 載入 data/sources.js | ✅ |  |
| 載入 data/extra.js | ✅ |  |
| 研究文件 ≥ 7 章 | ✅ | 8 章 |
| 五個平台教學 + 部署文件 | ✅ | chatgpt,claude,grok,glm,deepseek,deployment |
| Skills 涵蓋五平台 + shared | ✅ | chatgpt,claude,deepseek,glm,grok,shared |
| 每個平台都有 SKILL.md 或 system-prompt.md | ✅ |  |
| 所有引用的來源 ID 都存在於來源表 | ✅ | 57 個 ID |
| 每筆來源都有 verification、url（可為 null）、date、accessed | ✅ |  |
| 待驗證清單每項都有合法 status | ✅ |  |
| 待驗證項目都寫出了下一步（how） | ✅ | 15 項待處理 |
| 已完成項目都有 resolvedAt 日期 | ✅ | 1 項已完成 |
| 證據檔已嵌入網站 | ✅ | 3 份 |
| 流程步驟 derivedFrom 指向存在的步驟 | ✅ |  |
| 流程步驟引用的 I/O 都存在 | ✅ |  |
| JSON 有效 skills/shared/input-schema.json | ✅ |  |
| JSON 有效 skills/shared/output-schema.json | ✅ |  |
| JSON 有效 skills/grok/tool-definitions.json | ✅ |  |
| JSON 有效 skills/glm/claude-code-settings.example.json | ✅ |  |
| 驗收 2：vpn-gw-01/SYN-2026-0101 為 P1 且含四項依據 | ✅ | P1 86 |
| 驗收 3：存在 internet → vpn-gw-01 → ad-dc-01 → erp-db-01 | ✅ |  |
| 驗收 4：驗證計畫每項標「尚未授權主動測試」 | ✅ |  |
| 驗收 5：管理摘要 ≤ 300 字且含「決策請求」「限制」 | ✅ | 243 字 |
| 驗收 7：缺 scope 時拒絕分析並列出必要欄位 | ✅ |  |
| 缺拓樸：信心下修且無路徑假設 | ✅ |  |
| 清冊 < 80%：信心「低」 | ✅ |  |
| 驗證計畫：外部驗證需兩個授權旗標 | ✅ |  |
| 引擎 JSON 符合 output-schema 結構 | ✅ | required、block 欄位、items 必填鍵、摘要長度 |
| 驗收 6：移除情資後信心下修並標示 | ✅ |  |
| 示範引擎輸出與 examples/demo-snapshot.txt 一致 | ✅ | 50 行 |
| 驗收腳本接受符合 schema 的 baseline array／A01 fixture | ✅ |  |
| 驗收腳本接受誠實的 no-intel 8-file fixture | ✅ |  |
| 驗收腳本拒絕未宣告缺漏的假 no-intel 輸出 | ✅ |  |
| 引擎 JSON 通過驗收腳本（baseline） | ✅ |  |
| 引擎 JSON 通過驗收腳本（no-intel） | ✅ |  |
| index.html 有 CSP meta 且允許 inline style（app.js 用 style 屬性） | ✅ |  |
| index.html 有 OG／Twitter 卡片與 canonical | ✅ |  |
| 站點檔案存在 robots.txt | ✅ |  |
| 站點檔案存在 sitemap.xml | ✅ |  |
| 站點檔案存在 .nojekyll | ✅ |  |
| 站點檔案存在 404.html | ✅ |  |
| canonical、og:url、sitemap.xml、robots.txt 的網址一致 | ✅ |  |
| 下載檔存在 downloads/skills-chatgpt.zip | ✅ |  |
| 下載檔存在 downloads/skills-claude.zip | ✅ |  |
| 下載檔存在 downloads/skills-deepseek.zip | ✅ |  |
| 下載檔存在 downloads/skills-glm.zip | ✅ |  |
| 下載檔存在 downloads/skills-grok.zip | ✅ |  |
| 下載檔存在 downloads/skills-shared.zip | ✅ |  |
| 下載檔存在 downloads/skills-all-platforms.zip | ✅ |  |
| 下載檔存在 downloads/synthetic-example-data.zip | ✅ |  |
| 無 API 金鑰樣式字串 | ✅ |  |
| 首頁渲染 | ✅ |  |
| 導覽 #/methodology | ✅ | 方法論導覽 |
| 導覽 #/process | ✅ | 可執行流程（本專案推論框架） |
| 導覽 #/io | ✅ | Inputs／Outputs 對照 |
| 導覽 #/platforms | ✅ | 平台比較 |
| 導覽 #/skills | ✅ | Skills 專區 |
| 導覽 #/guides | ✅ | 安裝與使用教學 |
| 導覽 #/case | ✅ | 案例互動展示：Northwind Precision（合成資 |
| 導覽 #/sources | ✅ | 證據與來源 |
| 導覽 #/deploy | ✅ | 部署與維護 |
| 方法論章節切換 | ✅ | /methodology?doc=01-definition |
| 目錄錨點：同章且元素存在 | ✅ | 1-2-gartner-的目標與主張-gartner-明確陳述 scrollY=100 |
| Tabs 方向鍵切換 | ✅ | /methodology?doc=02-relations |
| Skip link 不改變頁面 | ✅ |  |
| 全站搜尋回傳結果 | ✅ | 12 筆 |
| 搜尋 ARIA：aria-expanded 更新且結果為 option | ✅ |  |
| 搜尋鍵盤導覽：aria-activedescendant | ✅ |  |
| 搜尋片段含 mark | ✅ |  |
| I/O 必要性篩選 | ✅ | 16 → 7 |
| I/O 階段篩選 | ✅ |  |
| Skills 一鍵複製（剪貼簿） | ✅ | 3707 字元 |
| Skills 檔案下載 | ✅ | SKILL.md |
| Skills ZIP 下載 | ✅ |  |
| Skills 原始／渲染切換 | ✅ |  |
| 教學平台切換 Grok | ✅ |  |
| 案例：移除情資後顯示缺漏警示 | ✅ |  |
| 案例：移除拓樸後無路徑假設 | ✅ |  |
| 案例：清冊完整度調整 | ✅ |  |
| 案例：風險胃納切換改變 P1 數 | ✅ | 10 → 12 |
| 案例：輸出 JSON 下載 | ✅ |  |
| 案例：複製報告 Markdown | ✅ |  |
| 來源頁所有連結為 http(s) | ✅ | 55 個連結 |
| 來源頁類型篩選 | ✅ |  |
| 來源頁查證等級篩選 | ✅ |  |
| 來源頁：證據檔附錄可展開 | ✅ |  |
| 部署頁：標題層級無跳級 | ✅ |  |
| 行動裝置 390px：所有路由無水平捲動 | ✅ |  |
| 行動裝置 320px：無水平捲動 | ✅ |  |
| 行動裝置：漢堡選單開啟 | ✅ |  |
| 無障礙：skip link、lang、aria-current | ✅ |  |
| 對比：主要按鈕 ≥ 4.5 | ✅ | 6.53 |
| 對比：深色主題強調色元素 ≥ 4.5 | ✅ | 8.54 |
| 儲存庫連結顯示狀態符合 REPO_PUBLIC=true | ✅ | 實際 顯示 |
| 無 JS 執行錯誤 | ✅ |  |
