/* 回归门禁 · race-calendar
   跑法：node tests/gate.mjs

   这个项目最怕的是「今天」不一样、卡面就不一样，所以门禁先把日期钉死，
   在几个关键日期上验状态和倒计时，最后再放开让它回到真实时间。

   通用部分（静态扫描、插桩、截图、导出、外站资源、外网请求）在 ./core.mjs。 */

import { gate } from './core.mjs';

await gate('race-calendar', async ({ page, fail, notes, guard }) => {
  /* 把「今天」钉在 2026-10-22 中午。用浏览器自己的本地时间构造，避免时区差一天。 */
  await guard('钉日期', () => page.evaluate(() => {
    window.__app.setNow(new Date(2026, 9, 22, 12, 0, 0).getTime());
  }));

  /* 1. 这一天应该是 2 场已完赛 / 1 场进行中 / 6 场待开赛 */
  const d0 = await guard('默认状态', () => page.evaluate(() => ({
    ...window.__app.stats(), self: window.__app.selfTest(), rows: window.__app.rows(),
    cw: window.__app.canvas.width, ch: window.__app.canvas.height,
  })));
  if (d0) {
    if (d0.ymd !== '2026-10-22') fail(`钉的日期变成了 ${d0.ymd}`);
    if (d0.total !== 9) fail(`赛季里有 ${d0.total} 场，数据里是 9 场`);
    if (d0.shown !== 9) fail(`全部筛选下只显示 ${d0.shown} 场`);
    if (d0.done !== 2) fail(`已完赛 ${d0.done} 场，10-22 这天应该是 2 场`);
    if (d0.live !== 1) fail(`进行中 ${d0.live} 场，应该正好 1 场`);
    if (d0.next !== 6) fail(`待开赛 ${d0.next} 场，应该 6 场`);
    if (d0.done + d0.live + d0.next !== 9) fail('三种状态加起来不等于总场次');
    if (!d0.self.ok) fail(`selfTest: ${d0.self.errs.slice(0, 3).join(' / ')}`);
    if (d0.cw !== 1080 || d0.ch !== 1920) fail(`画布 ${d0.cw}x${d0.ch}，应该 1080x1920`);
    notes.push(`2026-10-22：已完赛 ${d0.done} / 进行中 ${d0.live} / 待开赛 ${d0.next}`);
  }

  /* 2. 倒计时和状态文字都要对得上 */
  if (d0) {
    const live = d0.rows.find(r => r.status === 'live');
    const next1 = d0.rows.find(r => r.status === 'next');

    if (!live) fail('没有找到进行中的那场');
    else {
      if (live.name !== '内部计时 + 轴检') fail(`进行中的是「${live.name}」，应该是内部计时 + 轴检`);
      if (live.span !== '10/22–10/23') fail(`两天赛事的日期显示成「${live.span}」`);
      if (live.right !== '第 1 / 2 天') fail(`进行中第 2 天写成「${live.right}」`);
    }
    if (!next1) fail('没有找到待开赛的那场');
    else if (next1.right !== '还有 23 天') fail(`11-14 距 10-22 是 23 天，写成了「${next1.right}」`);

    const first = d0.rows.find(r => r.name === '校内测试 #1');
    if (!first) fail('找不到第一场');
    else if (first.right !== '40 天前') fail(`09-12 距 10-22 是 40 天，写成了「${first.right}」`);

    notes.push(`倒计时：进行中「${live ? live.right : '?'}」/ 下一场「${next1 ? next1.right : '?'}」`);
  }

  /* 3. 换个日期，状态要跟着走（不能是写死的） */
  const moved = await guard('推进日期', () => page.evaluate(() => {
    window.__app.setNow(new Date(2026, 11, 5, 12, 0, 0).getTime());
    const a = window.__app.stats();
    const liveName = (window.__app.rows().find(r => r.status === 'live') || {}).name;
    const liveRight = (window.__app.rows().find(r => r.status === 'live') || {}).right;
    window.__app.setNow(new Date(2027, 6, 1, 12, 0, 0).getTime());
    const b = window.__app.stats();
    return { a, liveName, liveRight, b };
  }));
  if (moved) {
    if (moved.a.done !== 4) fail(`12-05 时已完赛 ${moved.a.done} 场，应该 4 场`);
    if (moved.a.live !== 1) fail(`12-05 时进行中 ${moved.a.live} 场，应该 1 场`);
    if (moved.liveName !== '区赛 决赛') fail(`12-05 进行中的是「${moved.liveName}」`);
    if (moved.liveRight !== '第 1 / 1 天') fail(`单天赛事写成「${moved.liveRight}」，应该是第 1 / 1 天`);
    if (moved.b.done !== 9 || moved.b.live !== 0 || moved.b.next !== 0) {
      fail(`2027-07-01 应该全部已完赛，实际 ${moved.b.done}/${moved.b.live}/${moved.b.next}`);
    }
    notes.push(`换成 12-05 → 进行中「${moved.liveName}」；换成 2027-07-01 → 全部已完赛`);
  }

  /* 4. 筛选出一个空结果时，卡面不能是空的 */
  const empty = await guard('空结果', () => page.evaluate(() => {
    window.__app.setNow(new Date(2027, 6, 1, 12, 0, 0).getTime());
    window.__app.setFilter('next');
    return { ...window.__app.stats(), ink: window.__app.inkPct() };
  }));
  if (empty) {
    if (empty.shown !== 0) fail(`赛季结束后「待开赛」还有 ${empty.shown} 场`);
    if (empty.ink < 8) fail(`空结果卡面墨量只有 ${empty.ink}%，等于一张空卡`);
    /* 筛空了，汇总三列也必须是 0，不许出 NaN / Infinity，也不许还是全量 */
    for (const k of ['done', 'live', 'next']) {
      if (!Number.isFinite(empty[k])) fail(`空结果时汇总「${k}」是 ${empty[k]}`);
      else if (empty[k] !== 0) fail(`空结果时汇总「${k}」还是 ${empty[k]}，没跟着筛选走`);
    }
    notes.push(`筛不到时墨量 ${empty.ink}%（要求 ≥8%），汇总 ${empty.done}/${empty.live}/${empty.next}`);
  }

  /* 5. 三个筛选各自的人数 */
  const counts = await guard('筛选', () => page.evaluate(() => {
    window.__app.setNow(new Date(2026, 9, 22, 12, 0, 0).getTime());
    const out = {};
    for (const f of ['done', 'live', 'next', 'all']) {
      window.__app.setFilter(f);
      out[f] = window.__app.stats().shown;
    }
    return out;
  }));
  if (counts) {
    if (counts.done !== 2 || counts.live !== 1 || counts.next !== 6 || counts.all !== 9) {
      fail(`筛选计数 ${JSON.stringify(counts)}，应该是 done2 live1 next6 all9`);
    }
  }

  /* 5b. 汇总数字必须跟着筛选走，三列加起来要等于显示场次 */
  const linked = await guard('汇总联动', () => page.evaluate(() => {
    window.__app.setNow(new Date(2026, 9, 22, 12, 0, 0).getTime());
    const out = {};
    for (const f of ['all', 'done', 'live', 'next']) {
      window.__app.setFilter(f);
      const s = window.__app.stats();
      out[f] = { done: s.done, live: s.live, next: s.next, shown: s.shown, header: s.header };
    }
    window.__app.setFilter('all');
    return out;
  }));
  if (linked) {
    const key = s => `${s.done}/${s.live}/${s.next}/${s.shown}`;
    const hk = s => `抬头${s.header}`;
    for (const [f, s] of Object.entries(linked)) {
      const sum = s.done + s.live + s.next;
      if (sum !== s.shown) fail(`筛选「${f}」三列加起来 ${sum}，但显示 ${s.shown} 场`);
      if (s.header !== s.shown) fail(`筛选「${f}」抬头写的是 ${s.header}，但只显示了 ${s.shown} 场`);
      for (const k of ['done', 'live', 'next', 'shown', 'header']) {
        if (!Number.isFinite(s[k])) fail(`筛选「${f}」的 ${k} 是 ${s[k]}`);
      }
    }
    for (const f of ['done', 'live', 'next']) {
      if (key(linked[f]) === key(linked.all)) {
        fail(`切到「${f}」之后汇总还是 ${key(linked.all)}，没跟着筛选走`);
      }
    }
    if (hk(linked.all) === hk(linked.next)) fail(`切换筛选后抬头还是「${hk(linked.all)}」，没跟着筛选走`);
    notes.push(`汇总联动 全部 ${key(linked.all)} / 已完赛 ${key(linked.done)} / 进行中 ${key(linked.live)} / 待开赛 ${key(linked.next)}`);
  }

  /* 6. 刷新之后必须回到真实时间、回到「全部」 */
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__app && window.__app.canvas, null, { timeout: 20000 })
    .catch(() => fail('刷新后没拿到 window.__app'));
  const after = await page.evaluate(() => {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return {
      ...window.__app.stats(),
      realYmd: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    };
  }).catch(() => null);
  if (after) {
    if (after.filter !== 'all') fail(`刷新后筛选还停在「${after.filter}」`);
    if (after.ymd !== after.realYmd) fail(`刷新后日期是 ${after.ymd}，本机是 ${after.realYmd}`);
    if (after.done + after.live + after.next !== 9) fail('刷新后三种状态加起来不等于 9');
  }

  return `${empty ? empty.ink : '?'}% 空结果墨量 / 9 场 3 态 / 汇总联动 ${linked ? 'OK' : '?'}`;
});
