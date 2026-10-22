/**
 * 全量验收器
 *
 * 逐个项目跑 tests/gate.mjs，汇总成一张表。
 * 目的：不让「目录里有文件」冒充「项目做完了」。
 *
 *   node _tools/verify-all.mjs            跑全部
 *   node _tools/verify-all.mjs heat-bracket friction-loop
 *                                        只跑指定的
 */
import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PROJ = join(ROOT, 'projects');

const only = process.argv.slice(2);
const names = readdirSync(PROJ, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((n) => (only.length ? only.includes(n) : true))
  .sort();

const kb = (p) => {
  if (!existsSync(p)) return null;
  return Math.round(statSync(p).size / 1024);
};

const readText = (p) => {
  if (!existsSync(p)) return null;
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
};

// 脚手架模板的标记词。README 里还留着这些，说明没被真写过。
// 只查大小查不出来——模板也有 500 多字节。
const SCAFFOLD_MARKS = [/一句话说清这个项目/, /至少要写\s*3\s*条真实存在的缺陷/];

const rows = [];
let green = 0, red = 0, skip = 0;

for (const name of names) {
  const dir = join(PROJ, name);
  const html = existsSync(join(dir, 'index.html'));
  const readme = kb(join(dir, 'README.md'));
  const readmeTxt = readText(join(dir, 'README.md'));
  const scaffold = readmeTxt !== null && SCAFFOLD_MARKS.some((re) => re.test(readmeTxt));
  const mainB = kb(join(dir, 'src', 'main.js'));
  const gate = existsSync(join(dir, 'tests', 'gate.mjs'));

  if (!gate) {
    rows.push({ name, verdict: 'NO-GATE', detail: '没有 tests/gate.mjs', html, readme, mainB });
    skip++;
    continue;
  }

  const r = spawnSync('node', ['tests/gate.mjs'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 180000,
    shell: false,
  });

  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  const okLine = out.split('\n').filter((l) => /GATE OK|GATE PASS|通过|通過|PASS\s*\(/.test(l)).pop();
  const failLine = out.split('\n').filter((l) => /GATE FAIL|^\s*!|Error:|错误/.test(l)).pop();

  // main.js 小于 5KB 一律怀疑是脚手架空壳：
  // 空壳也能导出合格 PNG、selfTest 也返回 true，字节数和自检都证明不了内容。
  const shell = mainB !== null && mainB < 5;
  const isScaffold = readmeTxt === null || scaffold;

  if (r.status === 0 && okLine) {
    rows.push({
      name,
      verdict: isScaffold ? 'SCAFFOLD' : shell ? 'SHELL?' : 'GREEN',
      detail: okLine.replace(/\s+/g, ' ').slice(0, 96),
      html, readme, mainB,
    });
    if (isScaffold || shell) skip++; else green++;
  } else {
    const why = (failLine || out.split('\n').slice(-3).join(' ')).replace(/\s+/g, ' ').slice(0, 96);
    rows.push({ name, verdict: 'RED', detail: why, html, readme, mainB });
    red++;
  }
}

console.log('');
console.log('项目'.padEnd(22) + '结论'.padEnd(9) + 'html  readme  main   说明');
console.log('-'.repeat(104));
for (const r of rows) {
  console.log(
    r.name.padEnd(22) +
    r.verdict.padEnd(9) +
    (r.html ? 'Y' : '-').padEnd(6) +
    (r.readme ? r.readme + 'K' : '-').padEnd(8) +
    (r.mainB !== null ? r.mainB + 'K' : '-').padEnd(7) +
    r.detail
  );
}
console.log('-'.repeat(104));
console.log(`共 ${rows.length} 个：绿 ${green} / 红 ${red} / 无门禁 ${skip}`);
if (red) console.log('红的那些还没做完，不算交付。');
