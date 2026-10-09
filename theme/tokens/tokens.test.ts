import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { allTokens, defaultStylesheet, kebab, staticTokens } from './css.ts';
import { DEFAULT_SEED } from '../engine/scheme.ts';
import { springToLinear } from './static.ts';

const SNAP = fileURLToPath(new URL('./seeds.snapshot.json', import.meta.url));
const CSS = fileURLToPath(new URL('./tokens.css', import.meta.url));
const SEEDS = ['#6750a4', '#3584e4', '#e62d42', '#3a944a'];

function build() {
  const out: Record<string, Record<string, string>> = {};
  for (const seed of SEEDS) for (const mode of ['light', 'dark'] as const) out[`${seed}/${mode}`] = allTokens({ seed, mode });
  return out;
}

test('token snapshot for a set of seeds (UPDATE_SNAPSHOTS=1 to regenerate)', () => {
  const cur = build();
  if (process.env.UPDATE_SNAPSHOTS === '1' || !existsSync(SNAP)) {
    writeFileSync(SNAP, JSON.stringify(cur, null, 1) + '\n');
  }
  assert.deepEqual(cur, JSON.parse(readFileSync(SNAP, 'utf8')));
});

test('committed tokens.css matches generator', () => {
  assert.equal(readFileSync(CSS, 'utf8'), defaultStylesheet(DEFAULT_SEED));
});

test('kebab', () => {
  assert.equal(kebab('onSurfaceVariant'), 'on-surface-variant');
  assert.equal(kebab('surfaceContainerLowest'), 'surface-container-lowest');
});

test('static tokens: shape scale includes expressive increased sizes, emphasized type heavier than baseline', () => {
  const t = staticTokens();
  assert.ok(t['--cv-shape-large-increased'] && t['--cv-shape-extra-extra-large']);
  assert.ok(Number(t['--cv-type-emphasized-title-large-weight']) > Number(t['--cv-type-title-large-weight']));
  assert.match(t['--cv-motion-default-spatial-easing']!, /^linear\(/);
});

test('springToLinear ends at 1 and starts at 0', () => {
  const s = springToLinear({ damping: 0.9, stiffness: 700 }, 600);
  const nums = s.slice(7, -1).split(', ').map(Number);
  assert.equal(nums[0], 0);
  assert.equal(nums.at(-1), 1);
});
