// frontmatter 的判斷規則只有一份（scripts/frontmatter.mjs）：建置用它讀標題，也用它算出 Skills 專區渲染檢視的正文起點。
// 前半段是 parseFrontmatter 的單元測試（純函式，不碰磁碟）；後半段是整合檢查，讀已提交的建置產物 data/skills.js
// 與 skills/ 底下的檔案，確認建置真的替每份 .md 記下正確的 bodyStart、原文沒有被改動。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseFrontmatter } from './frontmatter.mjs';

test('有 frontmatter：拆出欄位，正文從結尾的 --- 之後開始，bodyStart 是 frontmatter 的長度', () => {
  const md = '---\nname: preemptive-exposure-analysis\ndescription: "先制型曝險分析"\n---\n\n# 標題\n\n內文\n';
  const { meta, body, bodyStart } = parseFrontmatter(md);
  assert.deepEqual(meta, { name: 'preemptive-exposure-analysis', description: '先制型曝險分析' });
  assert.equal(body, '\n# 標題\n\n內文\n');
  assert.equal(md.slice(bodyStart), body);
});

test('沒有 frontmatter：沒有欄位，正文是全文，bodyStart 為 0', () => {
  const md = '# 標題\n\n內文\n';
  assert.deepEqual(parseFrontmatter(md), { meta: {}, body: md, bodyStart: 0 });
});

test('正文中間的 --- 是水平線，不是 frontmatter', () => {
  const md = '# 標題\n\n---\nkey: value\n---\n';
  assert.deepEqual(parseFrontmatter(md), { meta: {}, body: md, bodyStart: 0 });
});

test('檔首的 --- 沒有閉合時不是 frontmatter（整份都是正文）', () => {
  const md = '---\n\n# 標題\n\n內文\n';
  assert.deepEqual(parseFrontmatter(md), { meta: {}, body: md, bodyStart: 0 });
});

test('CRLF 換行一樣認得，bodyStart 指向原文（含 CR）的正文起點', () => {
  const md = '---\r\ntitle: 平臺說明\r\nrole: readme\r\n---\r\n# 標題\r\n';
  const { meta, body, bodyStart } = parseFrontmatter(md);
  assert.deepEqual(meta, { title: '平臺說明', role: 'readme' });
  assert.equal(body, '# 標題\r\n');
  assert.equal(md.slice(bodyStart), body);
});

// 建置產物 data/skills.js：Skills 專區的每個 .md 檔都帶 bodyStart，與 parseFrontmatter 的判斷相同；原文 content 不變
const loadSkillFiles = () => {
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL('../data/skills.js', import.meta.url), 'utf8'), ctx);
  return ctx.window.SKILL_FILES;
};

test('data/skills.js 的 .md 檔帶 bodyStart：從那裡切開就是正文；原文仍含 frontmatter', () => {
  const md = loadSkillFiles().filter(f => f.ext === 'md');
  const withFrontmatter = md.filter(f => f.bodyStart > 0);
  // 已知正確值：skills/ 底下 29 份 .md，其中 19 份有 frontmatter（含 Claude 的 SKILL.md）
  assert.equal(md.length, 29);
  assert.equal(withFrontmatter.length, 19);
  assert.ok(withFrontmatter.some(f => f.path === 'skills/claude/preemptive-exposure-analysis/SKILL.md'), 'Claude 的 SKILL.md 有 frontmatter');
  for (const f of md) {
    assert.equal(typeof f.bodyStart, 'number', `${f.path} 沒有 bodyStart`);
    assert.equal(f.content, readFileSync(new URL(`../${f.path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'), `${f.path} 的原文與檔案相同（原始碼檢視、複製、下載用）`);
    if (f.bodyStart > 0) {
      const front = f.content.slice(0, f.bodyStart);
      assert.ok(front.startsWith('---\n') && front.endsWith('\n---\n'), `${f.path} 的 bodyStart 之前應恰好是 frontmatter`);
    } else {
      assert.ok(!f.content.startsWith('---\n'), `${f.path} 以 --- 開頭，bodyStart 卻是 0`);
    }
  }
});
