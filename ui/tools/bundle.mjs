// Bundles every ui/pages/<name>/ that has an index.html into <out>/<name>/{index.html,<name>.js} plus
// <out>/shared/tokens.css, for embedding by src-overlay/corvid/webui (apply-patches.sh runs this).
// Usage: node ui/tools/bundle.mjs <outdir>
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.argv[2];
if (!out) { console.error('usage: bundle.mjs <outdir>'); process.exit(2); }
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'shared'), { recursive: true });
cpSync(join(root, 'theme/tokens/tokens.css'), join(out, 'shared/tokens.css'));

// WebUI pages run under a CSP without 'unsafe-eval', and Ajv compiles schemas with new Function(). Replace the runtime
// compiler by Ajv's standalone output, generated here from the same schema and options ui/modules/manifest.ts uses.
const require = createRequire(import.meta.url);
const { Ajv } = require('ajv');
const standaloneCode = require('ajv/dist/standalone').default;
const manifestSchema = JSON.parse(readFileSync(join(root, 'modules/schema/module.schema.json'), 'utf8'));
const ajvStandalone = {
  name: 'ajv-standalone',
  setup(b) {
    b.onResolve({ filter: /^ajv$/ }, () => ({ path: 'ajv', namespace: 'ajv-standalone' }));
    b.onResolve({ filter: /^corvid-manifest-validator$/ }, () => ({ path: 'v', namespace: 'ajv-validator' }));
    b.onLoad({ filter: /.*/, namespace: 'ajv-standalone' }, () => ({
      contents: "import validate from 'corvid-manifest-validator'; export class Ajv { compile() { return validate; } }",
      resolveDir: root,
    }));
    b.onLoad({ filter: /.*/, namespace: 'ajv-validator' }, () => {
      const ajv = new Ajv({ allErrors: true, strict: true, code: { source: true } });
      return { contents: standaloneCode(ajv, ajv.compile(manifestSchema)), loader: 'js', resolveDir: join(root, 'node_modules/ajv') };
    });
  },
};

const pagesDir = join(root, 'ui/pages');
const pages = readdirSync(pagesDir).filter((n) => existsSync(join(pagesDir, n, 'index.html')) && existsSync(join(pagesDir, n, `${n}.ts`)));
for (const name of pages) {
  await build({
    stdin: { contents: `import '../shared/bootstrap.ts';\nimport './${name}.ts';\n`, resolveDir: join(pagesDir, name), sourcefile: `${name}-entry.ts`, loader: 'ts' },
    bundle: true, plugins: [ajvStandalone], format: 'esm', target: 'chrome140', minify: true, outfile: join(out, name, `${name}.js`), logLevel: 'warning',
  });
  const html = readFileSync(join(pagesDir, name, 'index.html'), 'utf8').replaceAll('chrome://resources/corvid/tokens.css', './tokens.css');
  writeFileSync(join(out, name, 'index.html'), html);
}
console.log(`bundled ${pages.length} page(s): ${pages.join(' ')}`);
