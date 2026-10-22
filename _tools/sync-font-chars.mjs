// 把项目 main.js 里出现过的中文（以及几个希腊字母/符号）同步进 tests/fonts.mjs 的补充字符表。
// 背景：fonts.mjs 只能扫 DOM 文本，画布上画的字扫不到，必须手工补。
// 用法: node _tools/sync-font-chars.mjs projects/replay-telemetry
import { readFileSync, writeFileSync } from 'node:fs';

const dir = process.argv[2];
if (!dir) {
  console.error('用法: node _tools/sync-font-chars.mjs <项目目录>');
  process.exit(1);
}

const src = readFileSync(`${dir}/src/main.js`, 'utf8');
const set = new Set();
for (const ch of src) {
  if (/[\u3400-\u9FFF\u3000-\u303F]/.test(ch)) set.add(ch);
}
// 画布上还会画出这些非中文符号
for (const ch of '²·—ρν') set.add(ch);
const chars = [...set].join('');

const path = `${dir}/tests/fonts.mjs`;
let t = readFileSync(path, 'utf8');
const re = /for \(const s of \['[^']*'\]\) \{/;
if (!re.test(t)) {
  console.error('没找到补充字符那一行，fonts.mjs 结构变了');
  process.exit(1);
}
t = t.replace(re, `for (const s of ['${chars}']) {`);
writeFileSync(path, t);
console.log(`已同步 ${chars.length} 个字符 → ${path}`);
