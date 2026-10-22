/* 回归门禁 · clip-factory
   跑法：node tests/gate.mjs

   这个项目最怕的是「四张卡其实是同一张」或者「有一张是空的」。
   所以：四张各出一遍 PNG，比 FNV 哈希必须四个都不一样；每张单独选中，量墨量。

   通用部分（静态扫描、插桩、截图、导出、外站资源、外网请求）在 ./core.mjs。 */

import { gate } from './core.mjs';

await gate('clip-factory', async ({ page, fail, notes, guard }) => {
  /* 1. 卡面清单 */
  const cards = await guard('卡面清单', () => page.evaluate(() => ({
    list: window.__app.cards(),
    cur: window.__app.current(),
    ...window.__app.stats(),
    self: window.__app.selfTest(),
    cw: window.__app.canvas.width,
    ch: window.__app.canvas.height,
  })));
  if (cards) {
    if (cards.list.length !== 4) fail(`卡面是 ${cards.list.length} 张，应该 4 张`);
    const ids = cards.list.map(c => c.id);
    if (new Set(ids).size !== 4) fail('卡面 id 有重复');
    if (!ids.includes('result') || !ids.includes('rival')) fail(`卡面缺项: ${ids.join(',')}`);
    if (cards.cur !== 'result') fail(`默认卡面是「${cards.cur}」，应该 result`);
    if (!cards.self.ok) fail(`selfTest: ${cards.self.errs.join(' / ')}`);
    if (cards.cw !== 1080 || cards.ch !== 1920) fail(`画布 ${cards.cw}x${cards.ch}，应该 1080x1920`);
    notes.push(`卡面 ${ids.join(' / ')}`);
  }

  /* 2. 四个数值必须自洽（分段加起来等于总用时、上次比这次慢、对手比我们慢） */
  const dv = await guard('数值自洽', () => page.evaluate(() => window.__app.derived()));
  if (dv) {
    if (Math.abs(dv.total - 1.042) > 0.0005) fail(`四段加起来 ${dv.total} s，总用时 1.042 s`);
    if (Math.abs(dv.faster - 0.020) > 0.0005) fail(`比上次快 ${dv.faster} s，应该是 0.020`);
    if (Math.abs(dv.vsRival - 0.019) > 0.0005) fail(`领先对手 ${dv.vsRival} s，应该是 0.019`);
    if (dv.best < 0 || dv.best > 3) fail(`最快分段下标 ${dv.best} 越界`);
    notes.push(`分段合计 ${dv.total} s（= 总用时）/ 快过上次 ${dv.faster} / 领先 ${dv.vsRival}`);
  }

  /* 3. 四张卡各出一遍 PNG，必须四个都不一样的图 */
  const all = await guard('批量出图', () => page.evaluate(() => window.__app.renderAll()));
  if (all) {
    if (all.length !== 4) fail(`renderAll 出了 ${all.length} 张`);
    for (const r of all) {
      if (!r.magic) fail(`${r.id} 不是 PNG`);
      if (r.size <= 4096) fail(`${r.id} 只有 ${r.size} B`);
      if (!r.hash) fail(`${r.id} 没有哈希`);
    }
    const hashes = new Set(all.map(r => r.hash));
    if (hashes.size !== all.length) {
      fail(`四张卡的哈希只有 ${hashes.size} 个不同值，说明有卡是同一张图`);
    }
    notes.push(`四张卡：${all.map(r => `${r.id} ${(r.size / 1024).toFixed(0)}KB`).join(' / ')}`);
  }

  /* 4. 每张单独选中，卡面都不能是空的 */
  const inks = await guard('逐张墨量', () => page.evaluate(() => {
    const out = {};
    for (const c of window.__app.cards()) {
      window.__app.select(c.id);
      out[c.id] = window.__app.inkPct();
    }
    window.__app.select('result');
    return out;
  }));
  if (inks) {
    for (const [id, v] of Object.entries(inks)) {
      if (v < 8) fail(`${id} 这张卡墨量只有 ${v}%，等于一张空卡`);
    }
    const min = Math.min(...Object.values(inks));
    const max = Math.max(...Object.values(inks));
    if (max - min < 1) fail('四张卡墨量几乎一样，可能没有真的画不同的内容');
    notes.push(`逐张墨量：${Object.entries(inks).map(([k, v]) => `${k} ${v}%`).join(' / ')}`);
  }

  /* 5. 切换卡面之后，面板和画布都要跟着变 */
  const swapped = await guard('切换', () => page.evaluate(() => {
    window.__app.select('split');
    const a = { cur: window.__app.current(), ink: window.__app.inkPct() };
    const pressed = [...document.querySelectorAll('#cards .chip')]
      .map(b => `${b.dataset.card}:${b.getAttribute('aria-pressed')}`);
    window.__app.select('result');
    return { a, pressed };
  }));
  if (swapped) {
    if (swapped.a.cur !== 'split') fail(`切换到 split 后当前卡是「${swapped.a.cur}」`);
    const on = swapped.pressed.filter(s => s.endsWith(':true'));
    if (on.length !== 1) fail(`有 ${on.length} 个芯片同时是按下状态`);
  }

  /* 6. 刷新之后回到第一张 */
  await page.evaluate(() => window.__app.select('sheet'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__app && window.__app.canvas, null, { timeout: 20000 })
    .catch(() => fail('刷新后没拿到 window.__app'));
  const after = await page.evaluate(() => window.__app.current()).catch(() => null);
  if (after !== 'result') fail(`刷新后当前卡是「${after}」，应该回到 result`);

  const minInk = inks ? Math.min(...Object.values(inks)) : '?';
  return `${minInk}% 最低单卡墨量 / 4 张全不同`;
});
