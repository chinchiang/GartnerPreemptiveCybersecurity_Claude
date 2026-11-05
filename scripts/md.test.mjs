// md.test.mjs — 站內 Markdown 渲染器（assets/md.js）連結白名單的單元測試
// assets/md.js 是瀏覽器用的 IIFE（掛在 window.MD），這裡以 vm 載入後直接呼叫 inline()。
// 預期值是改動前的實際輸出（#170），新規則（// 與 /\ 開頭不輸出成連結）另外寫成字面值。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../assets/md.js', import.meta.url), 'utf8'), context);
const { inline } = context.window.MD;

test('http(s) 連結：照常輸出，另開分頁並加上 rel="noopener noreferrer"', () => {
  assert.equal(inline('[a](https://example.com/x)'), '<a href="https://example.com/x" target="_blank" rel="noopener noreferrer">a</a>');
  assert.equal(inline('[a](http://example.com/x)'), '<a href="http://example.com/x" target="_blank" rel="noopener noreferrer">a</a>');
});

test('mailto、站內 hash 與相對路徑：照常輸出，在同一個分頁開啟', () => {
  for (const href of ['mailto:x@example.com', '#/sources', './x.md', '../x.md', '/docs/x.md', 'docs/guides/x.md', 'downloads/skills.zip']) {
    assert.equal(inline(`[a](${href})`), `<a href="${href}">a</a>`, href);
  }
});

test('javascript:、data:、vbscript: 等其他協定（不分大小寫）：不輸出成連結，只留文字', () => {
  for (const href of ['javascript:alert1', 'JaVaScRiPt:alert1', 'data:text/html,x', 'vbscript:x']) {
    assert.equal(inline(`[a](${href})`), 'a', href);
  }
});

test('// 開頭的協定相對網址（以及瀏覽器也當成 // 的 /\\）：不當成站內相對路徑，不輸出成連結（#170）', () => {
  // 當成相對路徑的話，會在同一個分頁開啟站外網站，也沒有 target 與 rel
  assert.equal(inline('[a](//evil.example/x)'), 'a');
  assert.equal(inline('[a](/\\evil.example/x)'), 'a');
  // 單一個 / 開頭的站內路徑照舊
  assert.equal(inline('[a](/docs/x.md)'), '<a href="/docs/x.md">a</a>');
});
