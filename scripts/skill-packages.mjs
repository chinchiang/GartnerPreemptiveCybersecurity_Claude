/**
 * skill-packages.mjs
 * 技能包組裝器（見 GLOSSARY.md）：決定每個技能包包含哪些母本、複本、嵌入區塊與依賴。
 * interface 以純函式為主——輸入 repo 檔案內容（母本與含嵌入區塊的手寫檔）、回傳結果，
 * 寫檔交給呼叫端（build-data.mjs、build-worker.mjs），因此不碰磁碟就能測試（scripts/skill-packages.test.mjs）。
 * 純 Node 內建模組，無第三方相依。所有輸入只認 LF 換行：呼叫端讀檔後須先把 CRLF 正規化為 LF。
 */

const SHARED_DIR = 'skills/shared/';
const CORE_PROMPT = `${SHARED_DIR}core-prompt.md`;
const EXAMPLES_DIR = 'examples/synthetic-org/';
const platformDir = (platform) => `skills/${platform}/`;
const referencePath = (platform, name) => `${platformDir(platform)}preemptive-exposure-analysis/references/${name}`;
// 建置寫入的標註（HTML 註解，網站渲染時 md.js 會略過）：複本放檔首，嵌入區塊放在區塊正上方
const MARKER_SOURCE = 'scripts/build-data.mjs';
const markerPrefix = (lead) => `<!-- ${lead}由 ${MARKER_SOURCE} `;
const marker = (lead, master) => `${markerPrefix(lead)}從 ${master} 產生，請改母本後執行 npm run build，勿手動編輯 -->`;

// 核心提示詞＝core-prompt.md 裡第一個 ```text 區塊；找不到就拋錯，讓建置中止。
export function extractCorePrompt(md) {
  const m = md.match(/```text\n([\s\S]*?)\n```/);
  if (!m) throw new Error('找不到 core-prompt.md 內的 ```text 區塊');
  return m[1];
}

// 對照表：skills/ 底下每個目錄一列。
// needs＝腳本執行時讀取的母本（ZIP 維持 repo 目錄結構，腳本不用改）；examples＝附上合成範例資料（腳本的預設輸入）；
// copies＝要複製進 preemptive-exposure-analysis/references/ 的母本（skills/shared/ 下的檔名），讓技能包脫離 repo 時仍可讀；
// embeds＝含核心提示詞嵌入區塊的手寫檔（file 相對於 skills/<平臺>/）與區塊所在的標題：標題行以 heading 開頭（前綴比對），全檔只能有一行。
const SCRIPT_NEEDS = [CORE_PROMPT, `${SHARED_DIR}output-schema.json`]; // 四支 api-workflow.py 共同讀取
// 改用分析工作流程核心的平臺另外需要核心本身，以及核心用來推導守門規則的 input-schema.json
const WORKFLOW_NEEDS = [...SCRIPT_NEEDS, `${SHARED_DIR}input-schema.json`, `${SHARED_DIR}analysis_workflow.py`];
const REFERENCES = ['acceptance.md', 'input-schema.json', 'output-schema.json', 'scoring-rules.md', 'task-spec.md'];
const SYSTEM_PROMPT_EMBED = { file: 'system-prompt.md', heading: '## 可直接複製的提示詞' };
const SKILL_MD_EMBED = { file: 'preemptive-exposure-analysis/SKILL.md', heading: '## 核心指令' }; // SKILL.md 內逐字的核心指令
const PACKAGES = {
  chatgpt:  { needs: SCRIPT_NEEDS, examples: true, copies: REFERENCES, embeds: [] },
  claude:   { needs: [], examples: true,                // 沒有 api-workflow.py；範例資料給 validate_inputs.py 當預設輸入
              copies: REFERENCES.filter(n => n !== 'task-spec.md'), embeds: [] }, // SKILL.md 不引用 task-spec
  deepseek: { needs: WORKFLOW_NEEDS, examples: true, copies: REFERENCES, embeds: [SYSTEM_PROMPT_EMBED, SKILL_MD_EMBED] },
  glm:      { needs: WORKFLOW_NEEDS, examples: true, copies: REFERENCES, embeds: [SYSTEM_PROMPT_EMBED, SKILL_MD_EMBED] },
  grok:     { needs: WORKFLOW_NEEDS, examples: true, copies: [], embeds: [SYSTEM_PROMPT_EMBED] }, // 沒有原生 skills，也就沒有 references/
  shared:   { needs: [], examples: false, copies: [], embeds: [] } // 母本本身，不是平臺；沿用現狀，skills-shared.zip 照舊只放母本
};

// 回傳某個技能包 ZIP 要放的檔案。files：repo 檔案清單 [{ path, content }]，path 以 / 分隔、相對於 repo 根目錄。
export function packageFiles(platform, files) {
  const pkg = PACKAGES[platform];
  if (!pkg) throw new Error(`技能包對照表沒有 skills/${platform}/ 這一列，請在 scripts/skill-packages.mjs 的 PACKAGES 補上`);
  const missing = pkg.needs.filter(n => !files.some(f => f.path === n));
  if (missing.length) throw new Error(`${platform} 技能包需要的母本不存在：${missing.join('、')}`);
  const wanted = (f) => f.path.startsWith(platformDir(platform)) || pkg.needs.includes(f.path) || (pkg.examples && f.path.startsWith(EXAMPLES_DIR));
  return files.filter(wanted).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// 回傳建置要寫入的所有產物 [{ path, content }]：各平臺 references/ 的複本，以及含嵌入區塊的手寫檔。
// files：repo 檔案清單，須含 skills/shared/ 的母本與對照表 embeds 宣告的手寫檔。
export function generatedFiles(files) {
  return [...referenceCopies(files), ...embeddedFiles(files)];
}

// 複本：.json 與母本位元組相同；.md 加一行標註，有 frontmatter 時放在它之後（build-data.mjs 的 parseFrontmatter 才讀得到標題）。
function referenceCopies(files) {
  const copies = [];
  for (const [platform, pkg] of Object.entries(PACKAGES)) {
    for (const name of pkg.copies) {
      const master = files.find(f => f.path === `${SHARED_DIR}${name}`);
      if (!master) throw new Error(`${platform} 技能包要複製的母本不存在：${SHARED_DIR}${name}`);
      copies.push({ path: referencePath(platform, name), content: copyContent(name, master.content) });
    }
  }
  return copies;
}
function copyContent(name, content) {
  if (!name.endsWith('.md')) return content;
  const line = `${marker('', `${SHARED_DIR}${name}`)}\n`;
  const fm = content.match(/^---\n[\s\S]*?\n---\n/);
  return fm ? fm[0] + line + content.slice(fm[0].length) : line + content;
}

// 嵌入區塊：手寫檔＋核心提示詞。以 heading 開頭的標題行全檔須恰好一行，只換掉它下面緊接的 ```text 區塊
// （同一檔案裡其他 ```text 區塊是手寫的；標題有 0 行、2 行以上，或標題下不是緊接區塊，都中止），
// 並在它正上方加標註；上一次建置寫入的標註連同區塊一起換掉，重複建置結果不變。
const CORE_MARKER = marker('以下區塊', CORE_PROMPT);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const coreBlock = (heading) => new RegExp(`^(${escapeRe(heading)}[^\\n]*\\n\\n+)(?:${escapeRe(markerPrefix('以下區塊'))}[^\\n]*-->\\n)?\`\`\`text\\n[\\s\\S]*?\\n\`\`\``, 'm');
function embeddedFiles(files) {
  const master = files.find(f => f.path === CORE_PROMPT);
  if (!master) throw new Error(`要嵌入的母本不存在：${CORE_PROMPT}`);
  const core = extractCorePrompt(master.content);
  return Object.entries(PACKAGES).flatMap(([platform, pkg]) => pkg.embeds.map(({ file, heading }) => {
    const path = `${platformDir(platform)}${file}`;
    const target = files.find(f => f.path === path);
    if (!target) throw new Error(`${path} 不存在，但對照表宣告 ${platform} 要在它嵌入核心提示詞`);
    const headings = target.content.split('\n').filter(line => line.startsWith(heading)).length;
    if (headings !== 1) throw new Error(`${path} 有 ${headings} 行以「${heading}」開頭的標題，必須恰好一行，才知道要換哪個 \`\`\`text 區塊`);
    const block = coreBlock(heading);
    if (!block.test(target.content)) throw new Error(`${path} 找不到「${heading}」標題下緊接的 \`\`\`text 區塊`);
    return { path, content: target.content.replace(block, (_, headingLine) => `${headingLine}${CORE_MARKER}\n\`\`\`text\n${core}\n\`\`\``) };
  }));
}
