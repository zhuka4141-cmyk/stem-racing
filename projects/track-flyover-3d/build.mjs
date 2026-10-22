import { build } from 'esbuild';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shared = join(here, '..', '..', 'shared');
const from = (f) => join(shared, f);

// shared 是唯一真源，每次构建覆盖，禁止在项目里改这两个文件
copyFileSync(from('reel-export.js'), join(here, 'src', 'reel-export.js'));
copyFileSync(from('design-tokens.css'), join(here, 'design-tokens.css'));

mkdirSync(join(here, 'dist'), { recursive: true });

// three r160 之后只有 ESM；file:// 下 ESM 会被 CORS 拦死，所以必须打 IIFE
await build({
  entryPoints: [join(here, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome110'],
  minify: true,
  sourcemap: false,
  outfile: join(here, 'dist', 'app.js'),
  logLevel: 'error',
});

const bytes = statSync(join(here, 'dist', 'app.js')).size;
console.log(`build ok -> dist/app.js  ${(bytes / 1024).toFixed(0)} KB`);
