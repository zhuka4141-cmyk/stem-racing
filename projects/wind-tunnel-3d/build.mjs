import { build } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shared = join(here, '..', '..', 'shared');

// 项目要自包含：把共用文件 vendor 进来，不跨目录引用
for (const f of ['reel-export.js']) copyFileSync(join(shared, f), join(here, 'src', f));
copyFileSync(join(shared, 'design-tokens.css'), join(here, 'design-tokens.css'));
copyFileSync(join(shared, 'reel-export.js'), join(here, 'src', 'reel-export.js'));

mkdirSync(join(here, 'dist'), { recursive: true });

// IIFE 格式：file:// 协议下能直接跑，不需要 http 服务器，也不需要 import map
await build({
  entryPoints: [join(here, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome110'],
  minify: true,
  sourcemap: false,
  outfile: join(here, 'dist', 'app.js'),
  logLevel: 'info',
});

console.log('build ok → dist/app.js');
