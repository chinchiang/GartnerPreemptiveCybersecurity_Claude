// screenshot-diff.mjs — CI 的 browser job 列出跟已提交版本不同的截圖：只列出，不讓 job 失敗
// 用法：node scripts/screenshot-diff.mjs <執行目錄>（scripts/verification-run.mjs 寫入 GITHUB_OUTPUT 的 run-directory）
//
// 比對「執行目錄的 verify-screenshots/」與「HEAD 已提交的 verify-screenshots/」（git ls-tree／git show），
// 不看工作樹：verification-run.mjs 用 cpSync 把截圖覆蓋到 verify-screenshots/，不會刪掉這次沒有產生的檔案。
// 有不同時印一行 ::warning::，job summary（$GITHUB_STEP_SUMMARY；沒有設定時印到 stdout）放每張的 md5 與像素差異。
// 只印數字，不判定是不是雜訊：同一個 commit 的截圖偶爾有零星的反鋸齒差異，判定方式見 docs/agents/workflow.md 的截圖交叉比對。
// 只在 CI 跑：本機字型跟 CI 不同，比出來沒有意義。
// 結束碼：比對完就是 0，某張截圖解不開也是（原因寫進那一列）；參數有誤是 2；讀不到 git 或執行目錄時非零（CI 那一步設 continue-on-error）。
// PNG 用 node:zlib 解碼（#265）：unit job 只有 Node 內建模組，沒有 Playwright。
import { readdirSync, readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const DIR = 'verify-screenshots';

// 兩張同尺寸圖的差異：不同像素數、最大的單一色彩通道差、差異範圍 [x0, y0, x1, y1]（含端點；沒有不同時是 null）
// 只比 RGB，不比 alpha：截圖都是不透明的，只差 alpha 不算不同（#265）。尺寸不同由呼叫端先處理。
export function pixelDiff(a, b) {
  const { width } = a, pa = a.data, pb = b.data;
  let count = 0, maxDelta = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let i = 0; i < pa.length; i += 4) {
    const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
    if (!d) continue;
    count++;
    maxDelta = Math.max(maxDelta, d);
    const x = (i / 4) % width, y = Math.floor(i / 4 / width);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { count, maxDelta, bbox: count ? [x0, y0, x1, y1] : null };
}

// PNG → { width, height, data: RGBA }。只支援 Playwright 截圖會用的格式：8-bit RGB／RGBA、不交錯；其他格式拋出錯誤。
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('不是 PNG 檔（開頭的簽章不符）');
  let pos = 8, width, height, channels;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      const [bitDepth, colorType, , , interlace] = data.subarray(8);
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
        throw new Error(`不支援的 PNG 格式（bit depth ${bitDepth}、color type ${colorType}、interlace ${interlace}）`);
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (width === undefined) throw new Error('PNG 沒有 IHDR');
  const raw = inflateSync(Buffer.concat(idat)), stride = width * channels;
  if (raw.length < (stride + 1) * height) throw new Error(`PNG 的像素資料不足（需要 ${(stride + 1) * height} 位元組，只有 ${raw.length}）`);
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? px[y * stride + i - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= channels ? px[(y - 1) * stride + i - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      if (predictor === undefined) throw new Error(`不支援的 PNG filter ${filter}`);
      px[y * stride + i] = (row[i] + predictor) & 0xff;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    for (let k = 0; k < 3; k++) data[p * 4 + k] = px[p * channels + k];
    data[p * 4 + 3] = channels === 4 ? px[p * channels + 3] : 255;
  }
  return { width, height, data };
}

const md5 = (buf) => createHash('md5').update(buf).digest('hex');

// 每張不同的截圖一列：[檔名, 已提交的 md5, 這次的 md5, 不同像素數, 最大通道差, 差異範圍]；位元組相同的不列
export function compareScreenshots(committed, produced) {
  const rows = [];
  for (const name of [...new Set([...committed.keys(), ...produced.keys()])].sort()) {
    const old = committed.get(name), now = produced.get(name);
    if (!now) { rows.push([name, md5(old), '—', '已提交但這次沒有產生', '—', '—']); continue; }
    if (!old) { rows.push([name, '—', md5(now), '新增', '—', '—']); continue; }
    if (old.equals(now)) continue;
    rows.push([name, md5(old), md5(now), ...pixelColumns(old, now)]);
  }
  return rows;
}

// 像素那三欄：[不同像素數, 最大通道差, 差異範圍]。位元組不同、像素相同時也列出：交叉比對兩次執行要靠 md5。
// 一張解不開時把原因寫進第一欄，不中斷其他截圖的比對（結束碼一律 0）
function pixelColumns(old, now) {
  let a, b;
  try { a = decodePng(old); b = decodePng(now); } catch (e) { return [`無法解碼：${e.message}`, '—', '—']; }
  if (a.width !== b.width || a.height !== b.height) return [`尺寸不同：${a.width}×${a.height} → ${b.width}×${b.height}`, '—', '—'];
  const { count, maxDelta, bbox } = pixelDiff(a, b);
  if (!count) return ['像素相同，只有編碼不同', '—', '—']; // 例如 filter 或壓縮方式不同
  return [String(count), String(maxDelta), `(${bbox[0]}, ${bbox[1]})–(${bbox[2]}, ${bbox[3]})`];
}

function readCommitted(cwd) {
  const git = (args, encoding) => execFileSync('git', args, { cwd, encoding, maxBuffer: 256 * 1024 * 1024 });
  // -z：不加 -z 時，git 會把非 ASCII 的檔名加上引號、轉成八進位（core.quotePath）
  const names = git(['ls-tree', '-z', '--name-only', 'HEAD', `${DIR}/`], 'utf8').split('\0').filter(n => n.endsWith('.png'));
  return new Map(names.map(n => [n.slice(DIR.length + 1), git(['show', `HEAD:${n}`])]));
}

function readProduced(runDir) {
  const dir = join(runDir, DIR);
  return new Map(readdirSync(dir).filter(n => n.endsWith('.png')).map(n => [n, readFileSync(join(dir, n))]));
}

// 連結用這次執行的 commit（GITHUB_SHA）：PR 合併前，main 上可能還沒有那一節
export function renderSummary(rows, env = process.env) {
  if (!rows.length) return '截圖都跟已提交的版本相同\n';
  const link = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/blob/${env.GITHUB_SHA}/docs/agents/workflow.md#截圖交叉比對`;
  return [
    `### ${rows.length} 張截圖跟已提交的版本不同`,
    '',
    '| 檔名 | 已提交的 md5 | 這次的 md5 | 不同像素數 | 最大通道差 | 差異範圍 |',
    '|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.join(' | ')} |`),
    '',
    `下載這次的截圖：\`gh run download ${env.GITHUB_RUN_ID} -n verify-report-and-screenshots\``,
    '',
    `單次執行分不出雜訊。判定方式見 \`docs/agents/workflow.md\` 的[截圖交叉比對](${link})。`,
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runDir = process.argv[2];
  if (!runDir || !existsSync(join(runDir, DIR))) {
    console.error(`用法：node scripts/screenshot-diff.mjs <執行目錄>（底下要有 ${DIR}/）`);
    process.exit(2);
  }
  const rows = compareScreenshots(readCommitted(process.cwd()), readProduced(runDir));
  const summary = renderSummary(rows);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  else process.stdout.write(summary);
  if (rows.length) console.log(`::warning::${rows.length} 張截圖跟已提交的版本不同，見 job summary`);
}
