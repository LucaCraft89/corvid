// Bundles every ui/pages/<name>/ that has an index.html into <out>/<name>/{index.html,<name>.js} plus
// <out>/shared/tokens.css, for embedding by src-overlay/corvid/webui (apply-patches.sh runs this).
// Usage: node ui/tools/bundle.mjs <outdir>
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.argv[2];
if (!out) { console.error('usage: bundle.mjs <outdir>'); process.exit(2); }
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'shared'), { recursive: true });
cpSync(join(root, 'theme/tokens/tokens.css'), join(out, 'shared/tokens.css'));

const pagesDir = join(root, 'ui/pages');
const pages = readdirSync(pagesDir).filter((n) => existsSync(join(pagesDir, n, 'index.html')) && existsSync(join(pagesDir, n, `${n}.ts`)));
for (const name of pages) {
  await build({
    stdin: { contents: `import '../shared/bootstrap.ts';\nimport './${name}.ts';\n`, resolveDir: join(pagesDir, name), sourcefile: `${name}-entry.ts`, loader: 'ts' },
    bundle: true, format: 'esm', target: 'chrome140', minify: true, outfile: join(out, name, `${name}.js`), logLevel: 'warning',
  });
  const html = readFileSync(join(pagesDir, name, 'index.html'), 'utf8').replaceAll('chrome://resources/corvid/tokens.css', './tokens.css');
  writeFileSync(join(out, name, 'index.html'), html);
}
console.log(`bundled ${pages.length} page(s): ${pages.join(' ')}`);
