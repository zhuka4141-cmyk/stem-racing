import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
// shared 是唯一真源，每次构建覆盖，避免各项目各改一份
copyFileSync('../../shared/reel-export.js', 'src/reel-export.js');
copyFileSync('../../shared/racing-core.js', 'src/racing-core.js');
copyFileSync('../../shared/plotkit.js', 'src/plotkit.js');
copyFileSync('../../shared/plot.js', 'src/plot.js');
copyFileSync('../../shared/design-tokens.css', 'design-tokens.css');

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',          // file:// 下 ESM 会被 CORS 拦死，必须 IIFE
  target: ['chrome110'],
  minify: false,           // 保留可读性，出问题好查
  sourcemap: false,
  outfile: 'dist/app.js',
  logLevel: 'error',
});
console.log('build ok → dist/app.js');
