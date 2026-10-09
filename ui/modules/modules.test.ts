import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { validateManifest, validateSettingValue, type ModuleManifest } from './manifest.ts';
import { ModuleHost, ModuleLoadError, ModuleUnloadedError, type HostBackend, type KeyValueStore, type ModuleCode } from './host.ts';
import { PermissionDeniedError, PermissionBroker, type Permission } from './permissions.ts';
import { buildCatalog } from './catalog.ts';

const MODULES = fileURLToPath(new URL('../../modules/', import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

function builtinManifests(): ModuleManifest[] {
  return readdirSync(MODULES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(MODULES, d.name, 'module.json')))
    .map((d) => readJson(join(MODULES, d.name, 'module.json')));
}

const base = (over: Record<string, unknown> = {}) => ({ id: 'example.thing', version: '1.0.0', apiVersion: 0, name: 'Thing', kind: 'ui-mod', entry: 'index.js', ...over });

test('all shipped module.json files validate', () => {
  const all = [...builtinManifests(), readJson(join(MODULES, 'examples/sample-panel/module.json'))];
  assert.ok(all.length >= 10);
  for (const m of all) {
    const r = validateManifest(m);
    assert.ok(r.ok, `${m.id}: ${r.ok ? '' : r.errors.join('; ')}`);
  }
});

test('builtin module ids are unique and component tags are unique', () => {
  const ms = builtinManifests();
  assert.equal(new Set(ms.map((m) => m.id)).size, ms.length);
  const tags = ms.flatMap((m) => (m.slots ?? []).map((s) => s.component));
  assert.equal(new Set(tags).size, tags.length);
});

test('schema rejects malformed manifests', () => {
  const bad: Array<[string, unknown]> = [
    ['missing id', { ...base(), id: undefined }],
    ['bad id', base({ id: 'Bad Id' })],
    ['bad semver', base({ version: '1' })],
    ['unknown field', base({ extra: 1 })],
    ['unknown permission', base({ permissions: ['root.everything'] })],
    ['unknown slot', base({ slots: [{ slot: 'window.middle', component: 'a-b' }] })],
    ['component without hyphen', base({ slots: [{ slot: 'window.top', component: 'panel' }] })],
    ['entry traversal', base({ entry: '../evil.js' })],
    ['absolute entry', base({ entry: '/etc/x.js' })],
    ['enum without values', base({ settings: [{ key: 'example.mode', type: 'enum', default: 'a' }] })],
    ['not an object', 'str'],
  ];
  for (const [why, m] of bad) assert.equal(validateManifest(m).ok, false, why);
});

test('semantic rules', () => {
  const errs = (m: unknown) => { const r = validateManifest(m); return r.ok ? [] : r.errors.join('|'); };
  assert.match(String(errs(base({ apiVersion: 7 }))), /not supported/);
  assert.match(String(errs(base({ id: 'corvid.sneaky' }))), /reserved/);
  assert.match(String(errs(base({ kind: 'builtin', id: 'example.x' }))), /corvid\. namespace/);
  assert.match(String(errs(base({ permissions: ['internal.shell'] }))), /reserved for builtin/);
  assert.match(String(errs(base({ entry: undefined }))), /entry/);
  assert.match(String(errs(base({ slots: [{ slot: 'window.top', component: 'x-y', role: 'addressbar' }] }))), /role is reserved/);
  assert.match(String(errs(base({ permissions: ['tabs.read'], optionalPermissions: ['tabs.read'] }))), /also required/);
  assert.match(String(errs(base({ settings: [{ key: 'thing.a', type: 'boolean', default: 'yes' }] }))), /expected boolean/);
  assert.match(String(errs(base({ settings: [{ key: 'thing.a', type: 'enum', values: ['x'], default: 'y' }] }))), /expected one of/);
  assert.match(String(errs(base({ settings: [{ key: 'other.a', type: 'boolean', default: true }] }))), /must start with "thing\."/);
  assert.match(String(errs(base({ slots: [{ slot: 'window.top', component: 'x-y', allowedSlots: ['window.left'] }] }))), /not in allowedSlots/);
  assert.match(String(errs(base({ slots: [{ slot: 'window.top', component: 'x-y', minSize: 5, maxSize: 2 }] }))), /minSize > maxSize/);
  assert.equal(errs(base({ settings: [{ key: 'thing.a', type: 'number', default: 5, min: 1, max: 9 }] })).length, 0);
});

test('validateSettingValue', () => {
  assert.equal(validateSettingValue({ key: 'a.b', type: 'number', default: 1, min: 0, max: 10 }, 11), 'above max 10');
  assert.equal(validateSettingValue({ key: 'a.b', type: 'color', default: '#000000' }, 'red') !== undefined, true);
  assert.equal(validateSettingValue({ key: 'a.b', type: 'number', default: 1 }, NaN) !== undefined, true);
});

test('catalog derives from slots; non-movable pins to default region', () => {
  const cat = buildCatalog([...builtinManifests()]);
  const tab = cat.get('corvid-tabstrip')!;
  assert.equal(tab.role, 'tabs');
  assert.equal(tab.hideable, false);
  assert.deepEqual([...tab.allowedRegions].sort(), ['bottom', 'left', 'right', 'top']);
  const c = buildCatalog([validateOk(base({ slots: [{ slot: 'window.left', component: 'x-y', movable: false }] }))]).get('x-y')!;
  assert.deepEqual(c.allowedRegions, ['left']);
});

function validateOk(m: unknown): ModuleManifest {
  const r = validateManifest(m);
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.manifest;
}

// ---------- host ----------

function memKv(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return { data, get: async (k) => data.get(k), set: async (k, v) => void data.set(k, v), remove: async (k) => void data.delete(k) };
}

function fakeBackend() {
  const listeners = { tabs: new Set<() => void>(), theme: new Set<() => void>() };
  const calls: string[] = [];
  const placed: string[] = [];
  const backend: HostBackend = {
    tabs: {
      list: async () => { calls.push('tabs.list'); return [{ id: 1, title: 'A', url: 'https://a.test/', active: true }]; },
      create: async (url) => { calls.push(`tabs.create ${url}`); return { id: 2, title: '', url, active: false }; },
      close: async (id) => void calls.push(`tabs.close ${id}`),
      activate: async (id) => void calls.push(`tabs.activate ${id}`),
      onChanged: (cb) => { listeners.tabs.add(cb); return () => listeners.tabs.delete(cb); },
    },
    bookmarks: { list: async () => [], add: async (title, url) => ({ id: 'b1', title, url }) },
    theme: { tokens: () => ({ '--cv-color-primary': '#000000' }), onChange: (cb) => { listeners.theme.add(cb); return () => listeners.theme.delete(cb); } },
    layout: { get: () => ({}), placeComponent: (m, c) => void placed.push(`${m}/${c}`), removeComponent: (c) => void placed.push(`removed ${c}`) },
    notifications: { show: () => {} },
    internal: { shell: { reset: () => 'shell' } },
  };
  return { backend, listeners, calls, placed };
}

function makeHost(opts: { grant?: Permission[]; code?: ModuleCode | ((m: ModuleManifest) => ModuleCode); } = {}) {
  const fb = fakeBackend();
  const prompts: Permission[][] = [];
  const state = memKv();
  const host = new ModuleHost({
    backend: fb.backend,
    storage: memKv(),
    state,
    prompter: async (req) => { prompts.push(req.required); return opts.grant ?? [...req.required, ...req.optional]; },
    loadCode: async (m) => (typeof opts.code === 'function' ? opts.code(m) : opts.code ?? {}),
  });
  return { host, fb, prompts, state };
}

test('sample ui-mod installs and runs from its real files without a build step', async () => {
  // Minimal DOM stand-ins (no jsdom: its dependency tree is not BSD/MIT/Apache only).
  const rendered: string[] = [];
  class FakeEl {
    children: FakeEl[] = []; textContent = ''; innerHTML = ''; tag = '';
    attachShadow() { return this; }
    querySelector() { return this; }
    replaceChildren(...c: FakeEl[]) { this.children = c; rendered.splice(0, rendered.length, ...c.map((x) => x.textContent)); }
    remove() { rendered.push('removed'); }
  }
  const registry = new Map<string, unknown>();
  Object.assign(globalThis, {
    HTMLElement: FakeEl,
    customElements: { get: (n: string) => registry.get(n), define: (n: string, c: unknown) => void registry.set(n, c) },
    document: { createElement: (tag: string) => { const C = registry.get(tag) as (new () => FakeEl) | undefined; const e = C ? new C() : new FakeEl(); e.tag = tag; return e; } },
  });
  const dir = join(MODULES, 'examples/sample-panel');
  const manifest = readJson(join(dir, 'module.json'));
  const code = (await import(pathToFileURL(join(dir, manifest.entry)).href)) as ModuleCode;
  const { host, fb } = makeHost({ code });
  host.install(manifest);
  await host.load('example.sample-panel');
  assert.ok(host.isLoaded('example.sample-panel'));
  assert.ok(host.catalog().has('sample-panel'), 'component becomes available to the layout palette');
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(rendered, ['A (https://a.test/)'], 'panel rendered tabs through the permission-gated API');
  assert.equal(fb.listeners.tabs.size, 1);
  await host.unload('example.sample-panel');
  assert.equal(fb.listeners.tabs.size, 0, 'unload frees the tab listener');
  assert.equal(host.resourceCount('example.sample-panel'), 0);
  assert.ok(rendered.includes('removed'));
});

test('denied required permission refuses the load and leaves nothing behind', async () => {
  const { host } = makeHost({ grant: [] });
  host.install(base({ permissions: ['tabs.read'] }));
  await assert.rejects(host.load('example.thing'), (e: unknown) => e instanceof PermissionDeniedError && e.permission === 'tabs.read');
  assert.equal(host.isLoaded('example.thing'), false);
  assert.equal(host.broker.list('example.thing').length, 0);
  assert.equal(host.catalog().size, 0);
});

test('granted-but-not-declared permissions are never granted', async () => {
  let ctxApi: import('./host.ts').ModuleApi | undefined;
  const { host } = makeHost({ grant: ['tabs.read', 'tabs.manage', 'internal.shell' as Permission], code: { onLoad: (c) => { ctxApi = c.api; } } });
  host.install(base({ permissions: ['tabs.read'] }));
  await host.load('example.thing');
  assert.equal(await (await ctxApi!.tabs.list()).length, 1);
  await assert.rejects(async () => ctxApi!.tabs.create('https://x.test'), PermissionDeniedError);
});

test('API calls are gated per permission (negative tests)', async () => {
  let api: import('./host.ts').ModuleApi | undefined;
  const { host, fb } = makeHost({ code: { onLoad: (c) => { api = c.api; } } });
  host.install(base({ permissions: ['tabs.read'], optionalPermissions: ['bookmarks.read'] }));
  await host.load('example.thing');
  await api!.tabs.list();
  const denied: Array<() => unknown> = [
    () => api!.tabs.create('https://x.test'), () => api!.tabs.close(1), () => api!.tabs.activate(1),
    () => api!.bookmarks.add('t', 'https://x.test'), () => api!.storage.get('k'), () => api!.theme.getTokens(),
    () => api!.layout.get(), () => api!.layout.placeSelf(), () => api!.notifications.show('a', 'b'),
  ];
  for (const f of denied) assert.throws(f, PermissionDeniedError);
  assert.deepEqual(fb.calls, ['tabs.list'], 'denied calls never reach the backend');
  assert.ok(await api!.bookmarks.list(), 'optional permission granted by prompter works');
});

test('builtin modules get declared permissions; internal services need internal.*', async () => {
  let ctx: import('./host.ts').ModuleContext | undefined;
  const { host, prompts } = makeHost({ code: { onLoad: (c) => { ctx = c; } } });
  host.install({ ...base({ kind: 'builtin', id: 'corvid.test', permissions: ['internal.shell'] }) });
  await host.load('corvid.test');
  assert.equal(prompts.length, 0, 'builtins are not prompted');
  assert.equal(typeof (ctx!.internal('shell') as { reset: unknown }).reset, 'function');
  assert.throws(() => ctx!.internal('extensions'), PermissionDeniedError);
});

test('unload frees listeners, timers, disposables; API goes dead', async () => {
  let ctx: import('./host.ts').ModuleContext | undefined;
  let unloaded = false;
  const { host, fb } = makeHost({
    code: { onLoad: (c) => {
      ctx = c;
      c.api.tabs.onChanged(() => {});
      c.api.theme.onChange(() => {});
      c.setInterval(() => {}, 10_000);
      c.setTimeout(() => {}, 10_000);
      c.addDisposable(() => {});
      c.api.settings.onChange(() => {});
    }, onUnload: () => { unloaded = true; } },
  });
  host.install(base({ permissions: ['tabs.read', 'theme.read'], slots: [{ slot: 'window.right', component: 'x-panel' }] }));
  await host.load('example.thing');
  assert.equal(fb.listeners.tabs.size, 1);
  assert.equal(fb.listeners.theme.size, 1);
  assert.equal(host.resourceCount('example.thing'), 5);
  assert.ok(host.catalog().has('x-panel'));
  const unloadedIds = await host.unload('example.thing');
  assert.deepEqual(unloadedIds, ['example.thing']);
  assert.ok(unloaded);
  assert.equal(fb.listeners.tabs.size + fb.listeners.theme.size, 0);
  assert.equal(host.resourceCount('example.thing'), 0);
  assert.equal(host.catalog().size, 0);
  assert.equal(host.broker.list('example.thing').length, 0);
  assert.ok(fb.placed.includes('removed x-panel'));
  assert.throws(() => ctx!.api.tabs.list(), ModuleUnloadedError);
});

test('failing onLoad rolls back and reports the error', async () => {
  const { host, fb } = makeHost({ code: { onLoad: (c) => { c.api.tabs.onChanged(() => {}); throw new Error('boom'); } } });
  host.install(base({ permissions: ['tabs.read'] }));
  await assert.rejects(host.load('example.thing'), /boom/);
  assert.equal(fb.listeners.tabs.size, 0);
  assert.equal(host.isLoaded('example.thing'), false);
});

test('requires: dependencies load first; unloading a dependency unloads dependents; cycles and missing deps rejected', async () => {
  const order: string[] = [];
  const { host } = makeHost({ code: (m) => ({ onLoad: () => void order.push(`load ${m.id}`), onUnload: () => void order.push(`unload ${m.id}`) }) });
  host.install(base({ kind: 'builtin', id: 'corvid.a' }));
  host.install(base({ kind: 'builtin', id: 'corvid.b', requires: ['corvid.a'] }));
  host.install(base({ kind: 'builtin', id: 'corvid.c', requires: ['corvid.missing'] }));
  host.install(base({ kind: 'builtin', id: 'corvid.d', requires: ['corvid.e'] }));
  host.install(base({ kind: 'builtin', id: 'corvid.e', requires: ['corvid.d'] }));
  await host.load('corvid.b');
  assert.deepEqual(order, ['load corvid.a', 'load corvid.b']);
  assert.deepEqual(await host.unload('corvid.a'), ['corvid.b', 'corvid.a']);
  await assert.rejects(host.load('corvid.c'), ModuleLoadError);
  await assert.rejects(host.load('corvid.d'), /cycle/);
});

test('install rejects invalid and duplicate manifests', () => {
  const { host } = makeHost();
  assert.throws(() => host.install({ id: 'x' }), ModuleLoadError);
  host.install(base());
  assert.throws(() => host.install(base()), /already installed/);
});

test('settings: validated, persisted, notify loaded module, restored on next load', async () => {
  const seen: Array<[string, unknown]> = [];
  const { host, state } = makeHost({ code: { onSettingsChanged: (k, v) => void seen.push([k, v]) } });
  host.install(base({ settings: [{ key: 'thing.size', type: 'number', default: 3, min: 1, max: 5 }] }));
  await host.load('example.thing');
  assert.equal(host.getSetting('example.thing', 'thing.size'), 3);
  await host.setSetting('example.thing', 'thing.size', 4);
  assert.deepEqual(seen, [['thing.size', 4]]);
  await assert.rejects(host.setSetting('example.thing', 'thing.size', 99), /above max/);
  await assert.rejects(host.setSetting('example.thing', 'nope.key', 1), /unknown setting/);
  assert.equal(state.data.get('setting:example.thing:thing.size'), 4);
  await host.unload('example.thing');
  await host.load('example.thing');
  assert.equal(host.getSetting('example.thing', 'thing.size'), 4);
  assert.equal(host.settingsSchema().length, 1);
});

test('stored consent is reused; revokeGrants re-prompts', async () => {
  const { host, prompts } = makeHost();
  host.install(base({ permissions: ['tabs.read'] }));
  await host.load('example.thing');
  await host.unload('example.thing');
  await host.load('example.thing');
  assert.equal(prompts.length, 1);
  await host.unload('example.thing');
  await host.revokeGrants('example.thing');
  await host.load('example.thing');
  assert.equal(prompts.length, 2);
});

test('PermissionBroker basics', () => {
  const b = new PermissionBroker();
  b.grant('m.x', ['tabs.read']);
  assert.ok(b.has('m.x', 'tabs.read'));
  assert.throws(() => b.require('m.x', 'tabs.manage'), PermissionDeniedError);
  b.revoke('m.x', 'tabs.read');
  assert.equal(b.has('m.x', 'tabs.read'), false);
});
