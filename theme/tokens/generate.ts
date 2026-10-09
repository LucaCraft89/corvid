// Build-time token generation. Usage: node theme/tokens/generate.ts [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SEED } from '../engine/scheme.ts';
import { defaultStylesheet } from './css.ts';

export const OUT = fileURLToPath(new URL('./tokens.css', import.meta.url));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const css = defaultStylesheet(DEFAULT_SEED);
  if (process.argv.includes('--check')) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (cur !== css) {
      console.error('theme/tokens/tokens.css is stale; run: node theme/tokens/generate.ts');
      process.exit(1);
    }
    console.log('tokens.css up to date');
  } else {
    writeFileSync(OUT, css);
    console.log(`wrote ${OUT}`);
  }
}
