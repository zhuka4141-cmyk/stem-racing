/* 本场数据点 · 本地常量
   换成本队自己的记录：改这个文件，然后 node build.mjs。
   splits 是 20 m 分四段的用时，加起来必须等于 time —— 门禁会查这一条。 */

export const RUN = {
  date: '2026-10-22',
  event: '内部计时 · 第 2 组',
  car: '07',
  lane: 2,
  time: 1.042,

  prev: 1.062,
  prevLabel: '10-17 省赛决赛',

  rival: { car: '12', lane: 4, time: 1.061 },

  splits: [0.286, 0.259, 0.251, 0.246],

  temp: 24.5,
  pressure: 6.2,
  track: '20 m 直线 · 室内',
};

/* 分段标签，和 splits 一一对应 */
export const SEGMENTS = ['0–5 m', '5–10 m', '10–15 m', '15–20 m'];
