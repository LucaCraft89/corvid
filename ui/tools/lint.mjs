// Corvid UI lint (no dependencies):
//  1. no raw hex colors in ui/ source (theme tokens only);
//  2. no hard-coded user-visible text in html`` templates (use the i18n catalog);
//  3. every i18n key used in code or referenced from module.json exists in ui/i18n/en.json;
//  4. every catalog key is used (warning only).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const errors = [];
const warnings = [];

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const uiFiles = walk(join(root, 'ui')).filter((f) => /\.(ts|html|css)$/.test(f) && !/\.test\.ts$/.test(f) && !f.includes('/tools/'));
const catalog = JSON.parse(readFileSync(join(root, 'ui/i18n/en.json'), 'utf8'));
const used = new Set();
const prefixes = new Set();

function stripExprs(line) {
  let out = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '$' && line[i + 1] === '{') {
      let depth = 0, j = i + 1;
      for (; j < line.length; j++) {
        if (line[j] === '{') depth++;
        else if (line[j] === '}' && --depth === 0) break;
      }
      out += '\u0000';
      i = j;
    } else out += line[i];
  }
  return out;
}

for (const f of uiFiles) {
  const rel = relative(root, f);
  const text = readFileSync(f, 'utf8');
  let inHtml = false;
  text.split('\n').forEach((line, i) => {
    const at = `${rel}:${i + 1}`;
    if (/(^|[^&\w])#[0-9a-fA-F]{3,8}\b/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line) && !/#x[0-9a-f]+;/i.test(line.replace(/&#x[0-9a-f]+;/gi, ''))) {
      errors.push(`${at}: raw hex color (use --cv-* tokens)`);
    }
    if (f.endsWith('.ts')) {
      const ticks = (line.match(/`/g) || []).length;
      const starts = line.includes('html`');
      if (inHtml || starts) {
        const s = stripExprs(line).replace(/=>/g, '');
        for (const m of s.matchAll(/>([^<>\u0000`]*[A-Za-z]{2,}[^<>\u0000`]*)</g)) if (!/^(&[#\w]+;|\s)+$/.test(m[1])) errors.push(`${at}: hard-coded text "${m[1].trim()}" (use t())`);
        // also text at end of line after a tag (multi-line templates)
        const tail = />([^<>\u0000`]*[A-Za-z]{2,}[^<>\u0000`]*)$/.exec(s);
        if (tail && !s.includes('<' + tail[1])) errors.push(`${at}: hard-coded text "${tail[1].trim()}" (use t())`);
      }
      if (starts) inHtml = ticks % 2 === 1; else if (inHtml && ticks % 2 === 1) inHtml = false;
    }
  });
  for (const m of text.matchAll(/\bt\(\s*(['"`])([^'"`]+)\1/g)) {
    if (m[2].includes('${')) prefixes.add(m[2].slice(0, m[2].indexOf('${'))); else used.add(m[2]);
  }
  for (const m of text.matchAll(/\bt\(\s*`([^`]*\$\{[^`]*)`/g)) prefixes.add(m[1].slice(0, m[1].indexOf('${')));
  for (const m of text.matchAll(/(?:summaryKey|descriptionKey|hintKeys)[^\n]*?['"`]([a-z]+\.[A-Za-z.${}]+)['"`]/g)) {
    if (m[1].includes('${')) prefixes.add(m[1].slice(0, m[1].indexOf('${'))); else used.add(m[1]);
  }
  for (const m of text.matchAll(/['"]((?:error|permission)\.[A-Za-z.]+)['"]/g)) used.add(m[1]);
}

// manifests
const modDir = join(root, 'modules');
for (const f of walk(modDir).filter((p) => p.endsWith('module.json'))) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const refs = [];
  const visit = (o) => { if (typeof o === 'string') { if (o.startsWith('i18n:')) refs.push(o.slice(5)); } else if (o && typeof o === 'object') Object.values(o).forEach(visit); };
  visit(j);
  for (const r of refs) used.add(r);
}

for (const k of used) if (!(k in catalog)) errors.push(`i18n: missing key "${k}"`);
for (const p of prefixes) if (!Object.keys(catalog).some((k) => k.startsWith(p))) errors.push(`i18n: no keys with prefix "${p}"`);
for (const k of Object.keys(catalog)) {
  const base = k.replace(/\.(one|other|few|many|zero|two)$/, '');
  if (!used.has(k) && !used.has(base) && ![...prefixes].some((p) => k.startsWith(p))) warnings.push(`i18n: unused key "${k}"`);
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);
console.log(`lint: ${uiFiles.length} files, ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
