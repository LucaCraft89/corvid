import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildSections, coerce, parseSettingsRoute } from './settings-model.ts';
import type { ModuleManifest } from '../../modules/manifest.ts';

const MODULES = fileURLToPath(new URL('../../../modules/', import.meta.url));
const manifests: ModuleManifest[] = readdirSync(MODULES, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(MODULES, d.name, 'module.json')))
  .map((d) => JSON.parse(readFileSync(join(MODULES, d.name, 'module.json'), 'utf8')));

test('sections are generated from manifests with defaults', () => {
  const secs = buildSections(manifests, () => undefined);
  const theme = secs.find((s) => s.moduleId === 'corvid.theme')!;
  assert.ok(theme.fields.some((f) => f.key === 'theme.seed' && f.control === 'color'));
  assert.ok(theme.fields.some((f) => f.key === 'theme.mode' && f.control === 'select' && f.options!.includes('dark')));
  const priv = secs.find((s) => s.moduleId === 'corvid.privacy')!;
  const w = priv.fields.find((f) => f.key === 'privacy.webrtcIpHandling')!;
  assert.equal(w.value, 'default_public_interface_only', 'protective WebRTC default');
  assert.deepEqual(buildSections(manifests, (m, k) => (k === 'theme.mode' ? 'dark' : undefined)).find((s) => s.moduleId === 'corvid.theme')!.fields[0]!.value, 'dark');
});

test('coerce validates types', () => {
  const num = { key: 'a.b', type: 'number' as const, default: 1, min: 0, max: 5 };
  assert.deepEqual(coerce(num, '3'), { ok: true, value: 3 });
  assert.equal(coerce(num, '9').ok, false);
  assert.equal(coerce(num, '').ok, false);
  assert.deepEqual(coerce({ key: 'a.b', type: 'boolean', default: false }, true), { ok: true, value: true });
  assert.equal(coerce({ key: 'a.b', type: 'color', default: '#000000' }, 'blue').ok, false);
  assert.equal(coerce({ key: 'a.b', type: 'enum', default: 'x', values: ['x', 'y'] }, 'z').ok, false);
});

test('settings routes: layout#reset is always routable', () => {
  assert.deepEqual(parseSettingsRoute('/layout', '#reset'), { section: 'layout', action: 'reset-layout' });
  assert.deepEqual(parseSettingsRoute('/appearance', ''), { section: 'appearance' });
  assert.deepEqual(parseSettingsRoute('/nonsense', ''), { section: 'general' });
  assert.deepEqual(parseSettingsRoute('', ''), { section: 'general' });
});
