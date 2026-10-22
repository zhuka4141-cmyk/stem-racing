/* 回归门禁 · result-archive
   跑法：node tests/gate.mjs
   通用部分（静态扫描、插桩、截图、导出、外站资源、外网请求）在 ./core.mjs，
   这里只写成绩档案特有的断言。 */

import { gate } from './core.mjs';

await gate('result-archive', async ({ page, fail, notes, guard }) => {
  /* 1. 默认状态 */
  const d0 = await guard('默认状态', () => page.evaluate(() => ({
    ...window.__app.stats(), self: window.__app.selfTest(),
    cw: window.__app.canvas.width, ch: window.__app.canvas.height,
  })));
  if (d0) {
    if (d0.total !== 12) fail(`默认 ${d0.total} 站记录，应该 12 站`);
    if (d0.shown !== 12) fail(`默认显示 ${d0.shown} 站，应该全部显示`);
    if (d0.sort !== 'date') fail(`默认排序是「${d0.sort}」，应该是 date`);
    if (!d0.self.ok) fail(`selfTest: ${d0.self.errs.join(' / ')}`);
    if (d0.cw !== 1080 || d0.ch !== 1920) fail(`画布 ${d0.cw}x${d0.ch}，应该 1080x1920`);
    notes.push(`默认 ${d0.total} 站记录，按日期从新到旧`);
  }

  /* 2. 三种排序各自都要满足自己的顺序，而且名次排序第一个必须是第 1 名
        注意：这里不能用「三种排序结果互不相同」来判，因为队里用时一直在进步，
        按日期和按用时排出来的顺序本来就几乎一样。只能验各自的单调性。 */
  const orders = await guard('排序', () => page.evaluate(() => {
    const out = {};
    for (const s of ['date', 'time', 'place']) {
      window.__app.setSort(s);
      out[s] = window.__app.rows();
    }
    window.__app.reset();
    return out;
  }));
  if (orders) {
    const { date, time, place } = orders;

    for (let i = 1; i < time.length; i++) {
      if (time[i].time < time[i - 1].time) { fail('按用时排没有从快到慢'); break; }
    }
    for (let i = 1; i < date.length; i++) {
      if (date[i].date > date[i - 1].date) { fail('按日期排没有从新到旧'); break; }
    }
    for (let i = 1; i < place.length; i++) {
      if (place[i].place < place[i - 1].place) { fail('按名次排没有从好到差'); break; }
    }
    if (place[0].place !== 1) fail(`按名次排第一个是第 ${place[0].place} 名`);
    if (time[0].time !== 1.042) fail(`按用时排第一个是 ${time[0].time} s，数据里最快是 1.042`);

    // 三种排序不能是同一个顺序，否则说明 setSort 根本没接线
    const key = a => a.map(r => r.date + r.event).join('|');
    const allSame = key(date) === key(time) && key(time) === key(place);
    if (allSame) fail('三种排序结果完全一致，setSort 可能没生效');

    notes.push(`排序：最快 ${time[0].time} s / 最早 ${date[date.length - 1].date} / 名次首位第 ${place[0].place} 名`);
  }

  /* 3. 搜索赛事名 */
  const byEvent = await guard('搜索赛事', () => page.evaluate(() => {
    window.__app.setQuery('省赛');
    const r = { n: window.__app.stats().shown, list: window.__app.getState().shown };
    window.__app.setQuery('');
    return r;
  }));
  if (byEvent) {
    if (byEvent.n !== 2) fail(`搜「省赛」出 ${byEvent.n} 条，应该 2 条`);
    if (byEvent.list.some(s => !s.includes('省赛'))) fail('搜「省赛」的结果里混进了别的赛事');
    notes.push(`搜「省赛」→ ${byEvent.n} 条`);
  }

  /* 4. 搜索车号 */
  const byCar = await guard('搜索车号', () => page.evaluate(() => {
    window.__app.setQuery('07');
    const r = window.__app.stats().shown;
    window.__app.setQuery('');
    return r;
  }));
  if (byCar !== null && byCar !== 7) fail(`搜车号 07 出 ${byCar} 条，数据里是 7 条`);

  /* 5. 搜不到时卡面不能是空的 */
  const empty = await guard('空结果', () => page.evaluate(() => {
    window.__app.setQuery('zzz不存在');
    return { shown: window.__app.stats().shown, ink: window.__app.inkPct() };
  }));
  if (empty) {
    if (empty.shown !== 0) fail(`无意义关键词居然匹配到 ${empty.shown} 条`);
    if (empty.ink < 8) fail(`空结果卡面墨量只有 ${empty.ink}%，等于一张空卡`);
    notes.push(`搜不到时墨量 ${empty.ink}%（要求 ≥8%）`);
  }

  /* 6. 重置 */
  const back = await guard('重置', () => page.evaluate(() => {
    window.__app.reset();
    return window.__app.stats();
  }));
  if (back && back.shown !== 12) fail(`重置后显示 ${back.shown} 条`);

  /* 7. 刷新回默认 */
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__app && window.__app.canvas, null, { timeout: 20000 })
    .catch(() => fail('刷新后没拿到 window.__app'));
  const after = await page.evaluate(() => window.__app.stats()).catch(() => null);
  if (after) {
    if (after.shown !== 12) fail(`刷新后显示 ${after.shown} 条，应该回到 12`);
    if (after.q !== '') fail(`刷新后搜索框还留着「${after.q}」`);
    if (after.sort !== 'date') fail(`刷新后排序还停在「${after.sort}」`);
  }

  return `${empty ? empty.ink : '?'}% 空结果墨量 / 12 站`;
});
