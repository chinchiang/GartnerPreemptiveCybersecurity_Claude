/**
 * skill-packages.mjs — 技能包組裝器
 * 技能包組裝器（見 GLOSSARY.md）：決定每個技能包包含哪些母本、複本、嵌入區塊與依賴，並寫出規則說明行與其他嵌入區塊
 * （例如 assets/scope-gate.js 帶的 scope 定義）。
 * interface 以純函式為主——輸入 repo 檔案內容（母本與含嵌入區塊的手寫檔）、回傳結果，
 * 寫檔交給呼叫端（build-data.mjs、build-worker.mjs），因此不碰磁碟就能測試（scripts/skill-packages.test.mjs）。
 * 唯一的例外是 sourceFilesFrom(root)：從磁碟讀出建置的輸入，建置與對已提交產物的整合檢查共用，兩邊的輸入才會相同。
 * 純 Node 內建模組，無第三方相依。所有輸入只認 LF 換行：呼叫端讀檔後須先把 CRLF 正規化為 LF。
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { repoReader } from './repo-files.mjs';

const GATE = createRequire(import.meta.url)('../assets/scope-gate.js');

const SHARED_DIR = 'skills/shared/';
const CORE_PROMPT = `${SHARED_DIR}core-prompt.md`;
const INPUT_SCHEMA = `${SHARED_DIR}input-schema.json`;
const EXAMPLES_DIR = 'examples/synthetic-org/';
const platformDir = (platform) => `skills/${platform}/`;
const referencePath = (platform, name) => `${platformDir(platform)}preemptive-exposure-analysis/references/${name}`;
const scriptPath = (platform, name) => `${platformDir(platform)}preemptive-exposure-analysis/scripts/${name}`;
// 建置寫入的標註（.md 用 HTML 註解，網站渲染時 md.js 會略過；.py 用 # 註解）：複本放檔首，嵌入區塊放在區塊正上方
const MARKER_SOURCE = 'scripts/build-data.mjs';
const markerPrefix = (lead) => `<!-- ${lead}由 ${MARKER_SOURCE} `;
const markerText = (lead, master) => `${lead}由 ${MARKER_SOURCE} 從 ${master} 產生，請改母本後執行 npm run build，勿手動編輯`;
const marker = (lead, master) => `<!-- ${markerText(lead, master)} -->`;

// 核心提示詞＝core-prompt.md 裡第一個 ```text 區塊；找不到就拋錯，讓建置中止。
export function extractCorePrompt(md) {
  const m = md.match(/```text\n([\s\S]*?)\n```/);
  if (!m) throw new Error('找不到 core-prompt.md 內的 ```text 區塊');
  return m[1];
}

// 對照表：skills/ 底下每個目錄一列。
// needs＝腳本執行時讀取的母本（ZIP 維持 repo 目錄結構，腳本不用改）；examples＝附上合成資料（腳本的預設輸入）；
// copies＝要複製進 preemptive-exposure-analysis/references/ 的母本（skills/shared/ 下的檔名），讓技能包脫離 repo 時仍可讀；
// scripts＝要複製進 preemptive-exposure-analysis/scripts/ 的 Python 母本，讓技能資料夾單獨安裝時腳本仍可執行（見 ADR 0003、0006）；
// embeds＝含核心提示詞嵌入區塊的手寫檔（file 相對於 skills/<平臺>/）與區塊所在的標題：標題行以 heading 開頭（前綴比對），全檔只能有一行。
const SCRIPT_NEEDS = [CORE_PROMPT, `${SHARED_DIR}output-schema.json`]; // 五支 api-workflow.py 共同讀取
// 改用分析工作流程核心的平臺另外需要核心本身，以及核心用來推導守門規則的 input-schema.json
const WORKFLOW_NEEDS = [...SCRIPT_NEEDS, `${SHARED_DIR}input-schema.json`, `${SHARED_DIR}analysis_workflow.py`];
const REFERENCES = ['acceptance.md', 'input-schema.json', 'output-schema.json', 'scoring-rules.md', 'task-spec.md'];
const SYSTEM_PROMPT_EMBED = { file: 'system-prompt.md', heading: '## 可直接複製的提示詞' };
const SKILL_MD_EMBED = { file: 'preemptive-exposure-analysis/SKILL.md', heading: '## 核心指令' }; // SKILL.md 內逐字的核心指令
// 附 validate_inputs.py 的技能資料夾（Claude、Gemini；見 ADR 0003、0006）：SKILL.md 是手寫的精簡版、不引用 task-spec；
// scripts/ 放 validate_inputs.py 與它載入的核心，兩支都是 skills/shared/ 母本的複本，資料夾被單獨複製或上傳時仍可執行
const SKILL_FOLDER_REFERENCES = REFERENCES.filter(n => n !== 'task-spec.md');
const SKILL_FOLDER_SCRIPTS = ['analysis_workflow.py', 'validate_inputs.py'];
const PACKAGES = {
  chatgpt:  { needs: WORKFLOW_NEEDS, examples: true, copies: REFERENCES, embeds: [], scripts: [] },
  claude:   { needs: [], examples: true,                // 沒有 api-workflow.py；合成資料給 validate_inputs.py 當預設輸入
              copies: SKILL_FOLDER_REFERENCES, embeds: [], scripts: SKILL_FOLDER_SCRIPTS },
  deepseek: { needs: WORKFLOW_NEEDS, examples: true, copies: REFERENCES, embeds: [SYSTEM_PROMPT_EMBED, SKILL_MD_EMBED], scripts: [] },
  gemini:   { needs: WORKFLOW_NEEDS, examples: true,    // api-workflow.py 照 ADR 0002 讀母本；技能資料夾照 Claude 的寫法單獨運作
              copies: SKILL_FOLDER_REFERENCES, embeds: [], scripts: SKILL_FOLDER_SCRIPTS },
  glm:      { needs: WORKFLOW_NEEDS, examples: true, copies: REFERENCES, embeds: [SYSTEM_PROMPT_EMBED, SKILL_MD_EMBED], scripts: [] },
  grok:     { needs: WORKFLOW_NEEDS, examples: true, copies: [], embeds: [SYSTEM_PROMPT_EMBED], scripts: [] }, // 沒有原生 skills，也就沒有 references/
  shared:   { needs: [], examples: false, copies: [], embeds: [], scripts: [] } // 母本本身，不是平臺；沿用現狀，skills-shared.zip 照舊只放母本
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

// 回傳建置要寫入的所有產物 [{ path, content }]：各平臺 references/ 與 scripts/ 的複本，以及含嵌入區塊的手寫檔
// （含 assets/scope-gate.js 的 scope 定義）。建置在原地改寫、且會提交的檔案都從這裡產生。
// files：repo 檔案清單，須含 skills/shared/ 的母本、對照表 embeds 宣告的手寫檔，以及 assets/scope-gate.js。
export function generatedFiles(files) {
  const ruleNotes = ruleNoteFiles(files);
  const updated = files.map(f => ruleNotes.find(r => r.path === f.path) || f); // 核心提示詞先換好規則說明行，再嵌入各平臺
  return [...sharedCopies(updated), ...embeddedFiles(updated), ...ruleNotes, scopeGateFile(files)];
}

// 建置的輸入（generatedFiles 的 files）：整個 skills/ 加上 assets/scope-gate.js，讀成 [{ path, content }]，
// 路徑相對於 root、用 /，換行正規化成 LF（走訪與讀檔的規則見 repo-files.mjs）。
// system-prompt.md 的平臺說明是手寫的，所以要含整個 skills/；scope-gate.js 不在 skills/ 底下，另外放進來。
export function sourceFilesFrom(root) {
  const { relPosix, readText, walk } = repoReader(root);
  return [...walk(join(root, 'skills')).map(f => ({ path: relPosix(f), content: readText(f) })),
    { path: SCOPE_GATE, content: readText(join(root, SCOPE_GATE)) }];
}

// 每種改寫都要「恰好一處」：0 處表示找不到要換的地方，2 處以上不知道要換哪一處，都中止（不默默只換第一處）。
// 錯誤訊息由各種改寫自己提供（帶入實際的數量），說明要去哪裡找、怎麼修。
function exactlyOne(count, message) {
  if (count !== 1) throw new Error(message(count));
}
// pattern 須帶 g：先數符合幾處，恰好一處才替換。也 export 給 build-worker.mjs 改寫後端代理的模板（CORE_PROMPT 與 import GATE 兩個嵌入點），
// 以及 build-data.mjs 寫回部署指南第 1 節的 scripts/ 清單
export function replaceExactlyOnce(content, pattern, replacement, message) {
  exactlyOne([...content.matchAll(pattern)].length, message);
  return content.replace(pattern, replacement);
}

// 規則說明行（模型側守門的規則來源，見 docs/adr/0005）：核心提示詞母本與四份改寫版裡以固定開頭辨識的一行，
// 換成「開頭＋scope 定義的規則說明＋。」；說明由 assets/scope-gate.js 從 input-schema.json 的 scope 定義產生。
// 每個檔案須恰好一行，0 行或 2 行以上都中止。「勿手動編輯」的說明只手寫在核心提示詞與 Custom GPT 指示的 ```text 區塊外面
// （三份 SKILL.md 整份都會被模型讀到，所以不加），不由建置寫入；改了沒重建由測試與 CI 的 diff 擋下。
export const RULE_LINE_LEAD = '- scope 必填欄位的規則：';
export const RULE_NOTE_TARGETS = [CORE_PROMPT, 'skills/chatgpt/custom-gpt-instructions.md',
  'skills/chatgpt/preemptive-exposure-analysis/SKILL.md', 'skills/claude/preemptive-exposure-analysis/SKILL.md',
  'skills/gemini/preemptive-exposure-analysis/SKILL.md'];
function ruleNoteFiles(files) {
  const schema = files.find(f => f.path === INPUT_SCHEMA);
  if (!schema) throw new Error(`規則說明的母本不存在：${INPUT_SCHEMA}`);
  const ruleLine = `${RULE_LINE_LEAD}${GATE.ruleNoteAgainst(JSON.parse(schema.content).properties.scope)}。`;
  return RULE_NOTE_TARGETS.map(path => {
    const target = files.find(f => f.path === path);
    if (!target) throw new Error(path === CORE_PROMPT ? `要嵌入的母本不存在：${CORE_PROMPT}` : `${path} 不存在，但它要帶授權範圍的規則說明行`);
    return { path, content: replaceExactlyOnce(target.content, new RegExp(`^${escapeRe(RULE_LINE_LEAD)}[^\\n]*$`, 'gm'), () => ruleLine,
      n => `${path} 有 ${n} 行以「${RULE_LINE_LEAD}」開頭，必須恰好一行，才知道要換哪一行`) };
  });
}

// 複本：.json 與母本位元組相同；.py 檔首加一行 # 標註；.md 加一行標註，有 frontmatter 時放在它之後
// （build-data.mjs 的 parseFrontmatter 才讀得到標題）。
function sharedCopies(files) {
  const copies = [];
  for (const [platform, pkg] of Object.entries(PACKAGES)) {
    const wanted = [...pkg.copies.map(name => [name, referencePath(platform, name)]),
                    ...pkg.scripts.map(name => [name, scriptPath(platform, name)])];
    for (const [name, path] of wanted) {
      const master = files.find(f => f.path === `${SHARED_DIR}${name}`);
      if (!master) throw new Error(`${platform} 技能包要複製的母本不存在：${SHARED_DIR}${name}`);
      copies.push({ path, content: copyContent(name, master.content) });
    }
  }
  return copies;
}
function copyContent(name, content) {
  if (name.endsWith('.py')) return `# ${markerText('', `${SHARED_DIR}${name}`)}\n${content}`;
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
const coreBlock = (heading) => new RegExp(`^(${escapeRe(heading)}[^\\n]*\\n\\n+)(?:${escapeRe(markerPrefix('以下區塊'))}[^\\n]*-->\\n)?\`\`\`text\\n[\\s\\S]*?\\n\`\`\``, 'gm');
function embeddedFiles(files) {
  const master = files.find(f => f.path === CORE_PROMPT);
  if (!master) throw new Error(`要嵌入的母本不存在：${CORE_PROMPT}`);
  const core = extractCorePrompt(master.content);
  return Object.entries(PACKAGES).flatMap(([platform, pkg]) => pkg.embeds.map(({ file, heading }) => {
    const path = `${platformDir(platform)}${file}`;
    const target = files.find(f => f.path === path);
    if (!target) throw new Error(`${path} 不存在，但對照表宣告 ${platform} 要在它嵌入核心提示詞`);
    exactlyOne(target.content.split('\n').filter(line => line.startsWith(heading)).length,
      n => `${path} 有 ${n} 行以「${heading}」開頭的標題，必須恰好一行，才知道要換哪個 \`\`\`text 區塊`);
    return { path, content: replaceExactlyOnce(target.content, coreBlock(heading), (_, headingLine) => `${headingLine}${CORE_MARKER}\n\`\`\`text\n${core}\n\`\`\``,
      () => `${path} 找不到「${heading}」標題下緊接的 \`\`\`text 區塊`) };
  }));
}

// scope 定義（授權範圍守門的規則來源，見 docs/adr/0004）：把 input-schema.json 的 properties.scope 寫進 assets/scope-gate.js
// 標註下緊接的 const SCOPE_SCHEMA = …; 區塊，縮排沿用 const 那一行。標註行全檔須恰好一行（數的是標註，不是區塊，
// 多出一行沒接區塊的標註也要中止）；JSON 字串裡不會出現換行，所以區塊結尾的「;＋換行」不會誤判。
// input-schema.json 是否存在，generatedFiles 先跑的 ruleNoteFiles 已經檢查過。
const SCOPE_GATE = 'assets/scope-gate.js';
const scopeMarker = `// 以下區塊由 ${MARKER_SOURCE} 從 ${INPUT_SCHEMA}`;
const scopeBlock = () => new RegExp(`(${escapeRe(scopeMarker)}[^\\n]*\\n(\\s*)const SCOPE_SCHEMA = )[\\s\\S]*?;\\n`, 'g');
function scopeGateFile(files) {
  const gate = files.find(f => f.path === SCOPE_GATE);
  if (!gate) throw new Error(`${SCOPE_GATE} 不存在，但它要帶授權範圍守門的 scope 定義`);
  exactlyOne(gate.content.split('\n').filter(line => line.trimStart().startsWith(scopeMarker)).length,
    n => `${SCOPE_GATE} 有 ${n} 個 SCOPE_SCHEMA 的嵌入區塊標註，必須恰好一個，才知道要換哪個區塊`);
  const scope = JSON.parse(files.find(f => f.path === INPUT_SCHEMA).content).properties.scope;
  return { path: SCOPE_GATE, content: replaceExactlyOnce(gate.content, scopeBlock(),
    (_, head, indent) => `${head}${JSON.stringify(scope, null, 2).replace(/\n/g, `\n${indent}`)};\n`,
    () => `${SCOPE_GATE} 找不到 SCOPE_SCHEMA 的嵌入區塊標註下緊接的 const SCOPE_SCHEMA = …; 區塊`) };
}
