/* 版面探针 —— 没有视觉模型时用像素统计代替「亲眼看」
   1. 安全区按横带切分，报告每带墨量，找出空的横带
   2. 左右页边距里有多少墨（>0 说明有东西越界了）
   3. 连续 150px 空行（真正的死区）
   跑法：node tests/probe.mjs */
import { open, SAFE } from './platform.mjs';

const { browser, page, errors } = await open();

const r = await page.evaluate((S) => {
  const cv = window.__app.canvas;
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const lum = (x, y) => {
    const i = (y * cv.width + x) * 4;
    return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  };

  const bandInk = (y0, y1, x0, x1) => {
    let ink = 0, tot = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        tot++;
        if (lum(x, y) > 24) ink++;
      }
    }
    return tot ? +((ink / tot) * 100).toFixed(2) : 0;
  };

  const bands = [];
  for (let y = S.y0; y < S.y1; y += 120) {
    const y1 = Math.min(y + 120, S.y1);
    bands.push({ y0: y, y1, pct: bandInk(y, y1, S.x0, S.x1) });
  }

  // 每行的墨量，用来找连续空行
  const rows = [];
  for (let y = S.y0; y < S.y1; y += 5) {
    let ink = 0;
    for (let x = S.x0; x < S.x1; x += 3) if (lum(x, y) > 24) ink++;
    rows.push({ y, ink });
  }
  let run = 0, worst = { len: 0, at: 0 };
  for (const row of rows) {
    if (row.ink === 0) { run += 5; if (run > worst.len) worst = { len: run, at: row.y - run }; }
    else run = 0;
  }

  return {
    bands,
    left: bandInk(S.y0, S.y1, 0, S.x0 - 4),
    right: bandInk(S.y0, S.y1, S.x1 + 4, cv.width),
    worst,
    total: bandInk(S.y0, S.y1, S.x0, S.x1),
  };
}, SAFE);

await browser.close();

console.log('横带墨量：');
for (const b of r.bands) {
  const bar = '█'.repeat(Math.round(b.pct / 2)).padEnd(26, '·');
  console.log(`  y ${String(b.y0).padStart(4)}–${String(b.y1).padStart(4)}  ${bar} ${String(b.pct).padStart(5)}%`);
}
console.log(`\n安全区总墨量 ${r.total}%`);
console.log(`左页边距墨量 ${r.left}%   右页边距墨量 ${r.right}%${r.left + r.right > 0.05 ? '  ← 有越界' : '  （干净）'}`);
console.log(`最长连续空行 ${r.worst.len}px${r.worst.len >= 150 ? `  ← 从 y=${r.worst.at} 开始，是死区` : '  （< 150px，正常留白）'}`);
if (errors.length) console.log(`\n运行期报错 ${errors.length} 条：\n  ` + errors.slice(0, 5).join('\n  '));
