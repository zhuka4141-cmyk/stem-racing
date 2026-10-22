import { open } from '../tests/platform.mjs';

const { browser, page } = await open();
const m = await page.evaluate(() => {
  const g = window.__app.getMetrics();
  return {
    A: g.A, B: g.B, deltaT: g.deltaT,
    texts: window.__app.diffTexts ? window.__app.diffTexts() : null,
  };
});
await browser.close();

for (const k of ['A', 'B']) {
  const o = m[k];
  console.log(`CAR ${k}  params ${JSON.stringify(o.params)}`);
  console.log(`   Cd ${o.cd.toFixed(3)}  A ${(o.area * 1e4).toFixed(3)}e-4  m ${(o.totalMass * 1000).toFixed(2)} g  m_eq ${(o.mEq * 1000).toFixed(2)} g`);
  console.log(`   rot ${(o.rot * 1000).toFixed(2)} g  CoM ${(o.comX * 1000).toFixed(2)} mm  front ${(o.frontShare * 100).toFixed(1)}%`);
  console.log(`   t ${o.time.toFixed(4)} s  v ${o.speed.toFixed(3)} m/s  drag@end ${o.dragEnd.toFixed(4)} N`);
}
console.log(`deltaT ${m.deltaT.toFixed(4)} s`);
