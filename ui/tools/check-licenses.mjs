// Fails if any installed npm package (prod or dev) uses a license outside the allow-list
// (AGENTS.md rule 6: BSD/MIT/Apache only; ask the user otherwise). ISC and 0BSD are treated as MIT-equivalent
// and reported so they can be confirmed with the user.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ALLOWED = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause']);
const NOTE = new Set(['ISC', '0BSD']);
const seen = new Map();

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n.startsWith('.') || !statSync(p).isDirectory()) continue;
    if (existsSync(join(p, 'package.json'))) {
      const j = JSON.parse(readFileSync(join(p, 'package.json'), 'utf8'));
      if (j.name) seen.set(`${j.name}@${j.version}`, typeof j.license === 'string' ? j.license : JSON.stringify(j.license ?? j.licenses ?? null));
    }
    walk(p.endsWith('node_modules') || n === 'node_modules' || n.startsWith('@') ? p : join(p, 'node_modules'));
  }
}
walk(join(root, 'node_modules'));

let bad = 0;
const notes = [];
for (const [pkg, lic] of [...seen].sort()) {
  if (ALLOWED.has(lic)) continue;
  if (NOTE.has(lic)) { notes.push(`${pkg}: ${lic}`); continue; }
  console.error(`DISALLOWED ${pkg}: ${lic}`);
  bad++;
}
for (const n of notes) console.warn(`note ${n} (MIT-equivalent; confirm)`);
console.log(`licenses: ${seen.size} packages, ${bad} disallowed`);
process.exit(bad ? 1 : 0);
