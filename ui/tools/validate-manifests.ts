// CI check: every modules/**/module.json validates (schema + semantic rules); ids and components unique.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../modules/manifest.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (n === 'module.json') out.push(p);
  }
  return out;
}

let bad = 0;
const ids = new Map<string, string>();
const comps = new Map<string, string>();
const files = walk(join(root, 'modules'));
for (const f of files) {
  const rel = relative(root, f);
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { console.error(`FAIL ${rel}: ${(e as Error).message}`); bad++; continue; }
  const r = validateManifest(raw);
  if (!r.ok) { console.error(`FAIL ${rel}`); r.errors.forEach((e) => console.error(`  ${e}`)); bad++; continue; }
  const m = r.manifest;
  if (ids.has(m.id)) { console.error(`FAIL ${rel}: duplicate id ${m.id} (also ${ids.get(m.id)})`); bad++; }
  ids.set(m.id, rel);
  for (const s of m.slots ?? []) {
    if (comps.has(s.component)) { console.error(`FAIL ${rel}: duplicate component ${s.component} (also ${comps.get(s.component)})`); bad++; }
    comps.set(s.component, rel);
  }
  console.log(`ok   ${rel} (${m.id}@${m.version})`);
}
console.log(`${files.length} manifests, ${bad} failures`);
process.exit(bad ? 1 : 0);
