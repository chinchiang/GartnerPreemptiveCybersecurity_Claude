/* 最後更新時間的顯示格式：index.html 的 <meta name="last-updated"> 由部署流程寫入 HEAD commit 的時間
   （scripts/stamp-last-updated.mjs；repo 裡提交的是空的）。固定換算成臺北時間，臺北沒有日光節約時間，所以就是 UTC+8。
   瀏覽器（assets/app.js）與 Node 的測試（scripts/last-updated.test.mjs）共用。 */
(function () {
  /** 'YYYY-MM-DD HH:mm（UTC+8）'，秒數捨去；空的或不是時間時回 null，畫面上就整個不顯示。 */
  function formatLastUpdated(iso) {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return null;
    const t = new Date(ms + 8 * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}（UTC+8）`;
  }

  const api = { formatLastUpdated };
  if (typeof window !== 'undefined') window.LAST_UPDATED = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
