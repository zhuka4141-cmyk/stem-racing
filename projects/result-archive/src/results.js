/* 历史成绩 · 本地常量
   这是示例数据，换成自己队记的表：改这个文件，然后 node build.mjs。
   字段：
     date  比赛日期 YYYY-MM-DD
     event 赛事名
     car   车号
     time  20 m 直线用时，秒，三位小数
     place 名次
   数值是按队内记录的量级编的，不是实测。 */

export const RESULTS = [
  { date: '2025-09-20', event: '校内测试 #1', car: '07', time: 1.318, place: 3 },
  { date: '2025-10-18', event: '校内测试 #2', car: '07', time: 1.274, place: 2 },
  { date: '2025-11-15', event: '区赛 预赛', car: '12', time: 1.241, place: 4 },
  { date: '2025-12-06', event: '区赛 决赛', car: '12', time: 1.208, place: 3 },
  { date: '2026-03-14', event: '校内测试 #3', car: '07', time: 1.186, place: 1 },
  { date: '2026-04-11', event: '校际对抗', car: '21', time: 1.172, place: 5 },
  { date: '2026-05-16', event: '市级选拔 一组', car: '07', time: 1.149, place: 2 },
  { date: '2026-06-13', event: '市级选拔 决赛', car: '07', time: 1.124, place: 1 },
  { date: '2026-07-04', event: '暑期计时赛', car: '21', time: 1.098, place: 3 },
  { date: '2026-09-05', event: '校内测试 #4', car: '12', time: 1.081, place: 2 },
  { date: '2026-09-26', event: '省赛资格赛', car: '07', time: 1.062, place: 1 },
  { date: '2026-10-17', event: '省赛 决赛', car: '07', time: 1.042, place: 1 },
];
