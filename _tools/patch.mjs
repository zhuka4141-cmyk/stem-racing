/* Literal-file patcher.

   Why this exists: the workspace sits on OneDrive, which keeps touching file
   mtimes, so any tool that guards writes behind "did you re-read this file"
   fails more often than it succeeds. A patcher that compares content instead of
   timestamps sidesteps the whole thing.

   Usage:  node _tools/patch.mjs <patch.json> [--dry]

   patch.json:
     { "edits": [ { "file": "path/to/x.js", "old": "...", "new": "...", "all": false } ] }

   Every edit must match exactly once unless "all" is true. Anything else aborts
   the whole run before a single byte is written, so a typo cannot leave the tree
   half-patched. */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , specPath, flag] = process.argv;
if (!specPath) {
  console.error('usage: node _tools/patch.mjs <patch.json> [--dry]');
  process.exit(2);
}

const dry = flag === '--dry';
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const edits = spec.edits || [];
if (!edits.length) {
  console.error('patch file has no edits');
  process.exit(2);
}

const staged = new Map();   // file -> text after all edits applied
const problems = [];

for (const [i, e] of edits.entries()) {
  const tag = `edit ${i} (${e.file})`;
  if (staged.has(e.file)) continue;   // already loaded for an earlier edit

  let text;
  try {
    text = readFileSync(e.file, 'utf8');
  } catch (err) {
    problems.push(`${tag}: cannot read — ${err.message}`);
    continue;
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  staged.set(e.file, text);
}

for (const [i, e] of edits.entries()) {
  const tag = `edit ${i} (${e.file})`;
  if (!staged.has(e.file)) continue;

  const text = staged.get(e.file);
  const count = text.split(e.old).length - 1;

  if (count === 0) {
    problems.push(`${tag}: old text not found`);
    continue;
  }
  if (count > 1 && !e.all) {
    problems.push(`${tag}: old text matches ${count} times, needs to be unique`);
    continue;
  }

  staged.set(e.file, e.all ? text.split(e.old).join(e.new) : text.replace(e.old, e.new));
  console.log(`  ${tag}: ${count} match${count === 1 ? '' : 'es'} → replaced`);
}

if (problems.length) {
  console.error('\nPATCH ABORTED, nothing written:');
  problems.forEach((p) => console.error('  ' + p));
  process.exit(1);
}

if (dry) {
  console.log('\ndry run: all edits matched, nothing written');
  process.exit(0);
}

for (const [file, text] of staged) {
  writeFileSync(file, text, 'utf8');
  console.log(`  wrote ${file}`);
}
console.log('patch ok');
