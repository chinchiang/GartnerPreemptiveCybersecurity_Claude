/**
 * skill-packages.mjs
 * 技能包組裝器（見 GLOSSARY.md）：決定每個技能包包含哪些母本、複本與依賴。
 * interface 以純函式為主——輸入母本內容、回傳結果，寫檔交給呼叫端（build-data.mjs、build-worker.mjs），
 * 因此不碰磁碟就能測試（scripts/skill-packages.test.mjs）。純 Node 內建模組，無第三方相依。
 */

// 核心提示詞＝skills/shared/core-prompt.md 裡第一個 ```text 區塊；找不到就拋錯，讓建置中止。
// 只認 LF 換行：呼叫端讀檔後須先把 CRLF 正規化為 LF。
export function extractCorePrompt(md) {
  const m = md.match(/```text\n([\s\S]*?)\n```/);
  if (!m) throw new Error('找不到 core-prompt.md 內的 ```text 區塊');
  return m[1];
}

// 對照表：skills/ 底下每個目錄一列。
// needs＝腳本執行時讀取的母本（ZIP 維持 repo 目錄結構，腳本不用改）；examples＝附上合成範例資料（腳本的預設輸入）；
// copies＝要複製進 preemptive-exposure-analysis/references/ 的母本（skills/shared/ 下的檔名），讓技能包脫離 repo 時仍可讀。
const SCRIPT_NEEDS = ['skills/shared/core-prompt.md', 'skills/shared/output-schema.json']; // 四支 api-workflow.py 共同讀取
const REFERENCES = ['acceptance.md', 'input-schema.json', 'output-schema.json', 'scoring-rules.md', 'task-spec.md'];
const PACKAGES = {
  chatgpt:  { needs: SCRIPT_NEEDS, examples: true, copies: REFERENCES },
  claude:   { needs: [], examples: true,                // 沒有 api-workflow.py；範例資料給 validate_inputs.py 當預設輸入
              copies: REFERENCES.filter(n => n !== 'task-spec.md') },   // SKILL.md 不引用 task-spec
  deepseek: { needs: SCRIPT_NEEDS, examples: true, copies: REFERENCES },
  glm:      { needs: SCRIPT_NEEDS, examples: true, copies: REFERENCES },
  grok:     { needs: SCRIPT_NEEDS, examples: true, copies: [] },        // 沒有原生 skills，也就沒有 references/
  shared:   { needs: [], examples: false, copies: [] }  // 母本本身，不是平臺；沿用現狀，skills-shared.zip 照舊只放母本
};
const EXAMPLES_DIR = 'examples/synthetic-org/';

// 回傳某個技能包 ZIP 要放的檔案。files：repo 檔案清單 [{ path, content }]，path 以 / 分隔、相對於 repo 根目錄。
export function packageFiles(platform, files) {
  const pkg = PACKAGES[platform];
  if (!pkg) throw new Error(`技能包對照表沒有 skills/${platform}/ 這一列，請在 scripts/skill-packages.mjs 的 PACKAGES 補上`);
  const missing = pkg.needs.filter(n => !files.some(f => f.path === n));
  if (missing.length) throw new Error(`${platform} 技能包需要的母本不存在：${missing.join('、')}`);
  const wanted = (f) => f.path.startsWith(`skills/${platform}/`) || pkg.needs.includes(f.path) || (pkg.examples && f.path.startsWith(EXAMPLES_DIR));
  return files.filter(wanted).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// .md 複本加一行 HTML 註解，提醒改母本（網站渲染時 md.js 會略過 HTML 註解）；.json 不能加註解，與母本位元組相同。
// 有 frontmatter 時標註放在它之後，build-data.mjs 的 parseFrontmatter 才讀得到標題。
function copyContent(name, content) {
  if (!name.endsWith('.md')) return content;
  const marker = `<!-- 由 scripts/build-data.mjs 從 skills/shared/${name} 產生，請改母本後執行 npm run build，勿手動編輯 -->\n`;
  const fm = content.match(/^---\n[\s\S]*?\n---\n/);
  return fm ? fm[0] + marker + content.slice(fm[0].length) : marker + content;
}

// 回傳所有要由建置寫入的複本 [{ path, content }]。files：至少要含 skills/shared/ 的母本。
// 複本放在 skills/<平臺>/preemptive-exposure-analysis/references/<檔名>。
export function generateCopies(files) {
  const copies = [];
  for (const [platform, pkg] of Object.entries(PACKAGES)) {
    for (const name of pkg.copies) {
      const master = files.find(f => f.path === `skills/shared/${name}`);
      if (!master) throw new Error(`${platform} 技能包要複製的母本不存在：skills/shared/${name}`);
      copies.push({ path: `skills/${platform}/preemptive-exposure-analysis/references/${name}`, content: copyContent(name, master.content) });
    }
  }
  return copies;
}
