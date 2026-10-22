import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
// Pull shared sources fresh on every build; edit ../../shared, not the project copy.
copyFileSync('../../shared/reel-export.js', 'src/reel-export.js');
copyFileSync('../../shared/svg-artboard.js', 'src/svg-artboard.js');
copyFileSync('../../shared/design-tokens.css', 'design-tokens.css');

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',          // file:// has no module CORS, so bundle to IIFE
  target: ['chrome110'],
  minify: false,
  sourcemap: false,
  outfile: 'dist/app.js',
  logLevel: 'error',
});
console.log('build ok -> dist/app.js');
