/* 最後更新時間：index.html 的 <meta name="last-updated"> 由部署流程寫入 HEAD commit 的時間
   （scripts/stamp-last-updated.mjs；repo 裡提交的是空的）。固定換算成臺北時間，臺北沒有日光節約時間，所以就是 UTC+8。
   「什麼樣的時間算合法」只在這裡定義：瀏覽器（assets/app.js）、部署時的寫入工具與 Node 的測試（scripts/last-updated.test.mjs）共用。 */
(function () {
  const COMMIT_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})[+-](\d{2}):(\d{2})$/;   // git log --format=%cI 的格式

  /** 是 %cI 的格式，而且是真的日期與時刻：Date 會把 2 月 30 日、24:00 進位成別的時間，所以換算回字串要和原文一致。 */
  function isCommitTime(iso) {
    const m = COMMIT_TIME.exec(iso);
    if (!m) return false;
    const [y, mo, d, h, mi, s, oh, om] = m.slice(1).map(Number);
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString().slice(0, 19) === iso.slice(0, 19) && oh <= 14 && om < 60;
  }

  /** 'YYYY-MM-DD HH:mm（UTC+8）'，秒數捨去；空的或不是合法的時間時回 null，畫面上就整個不顯示。 */
  function formatLastUpdated(iso) {
    if (!isCommitTime(iso)) return null;
    const t = new Date(Date.parse(iso) + 8 * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}（UTC+8）`;
  }

  const api = { isCommitTime, formatLastUpdated };
  if (typeof window !== 'undefined') window.LAST_UPDATED = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
