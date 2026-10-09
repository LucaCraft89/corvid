import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildCatalog } from '../modules/catalog.ts';
import type { ModuleManifest } from '../modules/manifest.ts';
import { DEFAULT_PRESET, PRESETS, presetCopy } from './defaults.ts';
import { allSlots, findSlot, type Layout } from './model.ts';
import { addComponent, addressBarPosition, setAddressBarPosition, moveSlot, nudgeSlot, removeSlot, resizeRegion, resizeSlot, setTabPosition, setVisible, moveFloating } from './ops.ts';
import { LayoutStore } from './store.ts';
import { LayoutPersistence, exportLayout, importLayout, layoutNameForWidth, type LayoutStorage, type Scheduler } from './persistence.ts';
import { checkGuardRails, checkSemantics, loadLayout, sanitize, validateStructure } from './validate.ts';
import { dropTarget, type DropInput } from './dnd.ts';

const MODULES = fileURLToPath(new URL('../../modules/', import.meta.url));
const manifests: ModuleManifest[] = readdirSync(MODULES, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(MODULES, d.name, 'module.json')))
  .map((d) => JSON.parse(readFileSync(join(MODULES, d.name, 'module.json'), 'utf8')));
const catalog = buildCatalog(manifests);

function memStorage(initial: string | null = null) {
  const s = { data: initial, writes: 0, backups: [] as string[] };
  const storage: LayoutStorage = {
    read: async () => s.data,
    write: async (d) => { s.data = d; s.writes++; },
    backupCorrupt: async (d) => void s.backups.push(d),
  };
  return { s, storage };
}
function fakeScheduler() {
  const q = new Map<number, () => void>();
  let n = 0;
  const sch: Scheduler = { set: (fn) => { q.set(++n, fn); return n; }, clear: (h) => void q.delete(h as number) };
  return { sch, run: () => { const fns = [...q.values()]; q.clear(); fns.forEach((f) => f()); }, size: () => q.size };
}
async function boot(storage: LayoutStorage, sch: Scheduler) {
  const p = new LayoutPersistence({ storage, catalog: () => catalog, scheduler: sch, delayMs: 400 });
  const restored = await p.load();
  const store = new LayoutStore({ layout: restored.layout, defaults: () => p.defaultsFor(), catalog: () => catalog });
  p.attach(store);
  return { p, store, restored };
}
const region = (l: Layout, c: string) => allSlots(l).find((s) => s.slot.component === c)?.region;
const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));

test('all presets pass schema, semantics, and guard rails', () => {
  for (const [name, l] of Object.entries(PRESETS)) {
    assert.equal(l.name, name);
    const s = validateStructure(l);
    assert.ok(s.ok, `${name}: ${s.ok ? '' : JSON.stringify(s.problems)}`);
    assert.deepEqual(checkSemantics(l, catalog), [], name);
    assert.deepEqual(checkGuardRails(l, catalog), [], name);
  }
  assert.deepEqual(Object.keys(PRESETS).sort(), ['compact', 'desktop-classic', 'desktop-vertical-tabs', 'mobile']);
});

test('schema rejects invalid layouts', () => {
  const l = presetCopy('compact');
  const bad: Array<[string, unknown]> = [
    ['version', { ...l, version: 2 }],
    ['missing region', { ...l, regions: { ...l.regions, floating: undefined } }],
    ['extra property', { ...l, hacks: true }],
    ['zero size', (() => { const c = presetCopy('compact'); c.regions.right.slots[0]!.size = { unit: 'rem', value: 0 }; return c; })()],
    ['bad unit', (() => { const c = presetCopy('compact') as unknown as Layout; (c.regions.right.slots[0] as { size: unknown }).size = { unit: 'px', value: 5 }; return c; })()],
    ['bad component', (() => { const c = presetCopy('compact'); c.regions.top.slots[0]!.component = 'nohyphen'; return c; })()],
    ['bad position', (() => { const c = presetCopy('compact'); c.regions.top.slots[0]!.position = { x: 2, y: 0 }; return c; })()],
    ['null', null], ['array', []], ['string', 'x'],
  ];
  for (const [why, v] of bad) assert.equal(validateStructure(v).ok, false, why);
});

test('ops: move tab strip top -> left, hide bookmarks bar, resize side panel', () => {
  let l = presetCopy('desktop-classic');
  let r = moveSlot(l, catalog, 'tabstrip', 'left', 0); ok(r); if (r.ok) l = r.layout;
  assert.equal(region(l, 'corvid-tabstrip'), 'left');
  assert.equal(findSlot(l, 'tabstrip')!.slot.row, undefined, 'row is dropped outside bars');
  r = setVisible(l, catalog, 'bookmarksbar', false); ok(r); if (r.ok) l = r.layout;
  assert.equal(findSlot(l, 'bookmarksbar')!.slot.visible, false);
  r = resizeSlot(l, catalog, 'sidepanel', { unit: 'rem', value: 30 }); ok(r); if (r.ok) l = r.layout;
  assert.deepEqual(findSlot(l, 'sidepanel')!.slot.size, { unit: 'rem', value: 30 });
  r = resizeSlot(l, catalog, 'sidepanel', { unit: 'rem', value: 500 }); ok(r); if (r.ok) l = r.layout;
  assert.equal(findSlot(l, 'sidepanel')!.slot.size!.value, 48, 'clamped to manifest maxSize');
  assert.deepEqual(checkGuardRails(l, catalog), []);
  assert.deepEqual(checkSemantics(l, catalog), []);
});

test('ops do not mutate their input', () => {
  const l = presetCopy('desktop-classic');
  const before = JSON.stringify(l);
  moveSlot(l, catalog, 'tabstrip', 'left', 0);
  setVisible(l, catalog, 'bookmarksbar', false);
  assert.equal(JSON.stringify(l), before);
});

test('guard rails: required components cannot be hidden, removed, or lost', () => {
  const l = presetCopy('desktop-classic');
  for (const id of ['addressbar', 'tabstrip', 'layout-menu']) {
    assert.equal(setVisible(l, catalog, id, false).ok, false, `hide ${id}`);
    assert.equal(removeSlot(l, catalog, id).ok, false, `remove ${id}`);
  }
  assert.equal(moveSlot(l, catalog, 'addressbar', 'left', 0).ok, false, 'address bar not allowed in left region');
  assert.equal(moveSlot(l, catalog, 'nope', 'left', 0).ok, false);
  assert.equal(resizeSlot(l, catalog, 'toolbar', { unit: 'rem', value: 3 }).ok, false, 'not resizable');
  assert.equal(resizeSlot(l, catalog, 'sidepanel', { unit: 'rem', value: -1 }).ok, false);
  assert.equal(addComponent(l, catalog, 'corvid-toolbar').ok, false, 'already in layout');
  assert.equal(addComponent(l, catalog, 'ghost-widget').ok, false);
});

test('ops: add/remove/nudge/setTabPosition/floating/region', () => {
  let l = presetCopy('compact');
  let r = addComponent(l, catalog, 'corvid-bookmarksbar', 'bottom'); assert.equal(r.ok, false, 'already present in compact (hidden)');
  r = removeSlot(l, catalog, 'bookmarksbar'); ok(r); if (r.ok) l = r.layout;
  r = addComponent(l, catalog, 'corvid-bookmarksbar', 'bottom'); ok(r); if (r.ok) l = r.layout;
  assert.equal(region(l, 'corvid-bookmarksbar'), 'bottom');
  r = nudgeSlot(l, catalog, 'toolbar', -1); ok(r); if (r.ok) l = r.layout;
  assert.equal(nudgeSlot(l, catalog, 'tabstrip', -1).ok || nudgeSlot(l, catalog, 'bookmarksbar', 1).ok, false, 'edges refuse');
  r = setTabPosition(l, catalog, 'bottom'); ok(r); if (r.ok) l = r.layout;
  assert.equal(region(l, 'corvid-tabstrip'), 'bottom');
  r = moveSlot(l, catalog, 'sidepanel', 'floating', 0); ok(r); if (r.ok) l = r.layout;
  assert.ok(findSlot(l, 'sidepanel')!.slot.position);
  r = moveFloating(l, 'sidepanel', 5, -3); ok(r); if (r.ok) l = r.layout;
  assert.deepEqual(findSlot(l, 'sidepanel')!.slot.position, { x: 1, y: 0 });
  assert.equal(moveFloating(l, 'tabstrip', 0, 0).ok, false);
  r = resizeRegion(l, 'left', { unit: 'rem', value: 12 }); ok(r); if (r.ok) l = r.layout;
  assert.equal(l.regions.left.size!.value, 12);
  assert.deepEqual(checkSemantics(l, catalog), []);
});

test('moveSlot rows: join neighbor row vs new row', () => {
  const l = presetCopy('desktop-classic');
  const r = moveSlot(l, catalog, 'bookmarksbar', 'top', 1);
  assert.ok(r.ok);
  if (r.ok) assert.equal(findSlot(r.layout, 'bookmarksbar')!.slot.row, 1, 'joins the row of the slot now at that index (toolbar row)');
  const r2 = moveSlot(l, catalog, 'toolbar', 'top', 0, { newRow: true });
  assert.ok(r2.ok);
  if (r2.ok) assert.equal(findSlot(r2.layout, 'toolbar')!.slot.row, 3);
});

test('undo/redo and reset', () => {
  const store = new LayoutStore({ layout: presetCopy('desktop-classic'), defaults: () => presetCopy('desktop-classic'), catalog: () => catalog });
  const start = JSON.stringify(store.layout);
  store.apply((l, c) => moveSlot(l, c, 'tabstrip', 'left', 0));
  store.apply((l, c) => setVisible(l, c, 'bookmarksbar', false));
  assert.equal(store.canUndo, true);
  assert.equal(store.canRedo, false);
  const edited = JSON.stringify(store.layout);
  store.undo(); store.undo();
  assert.equal(JSON.stringify(store.layout), start);
  assert.equal(store.canRedo, true);
  store.redo(); store.redo();
  assert.equal(JSON.stringify(store.layout), edited);
  store.reset();
  assert.equal(JSON.stringify(store.layout), start);
  store.undo();
  assert.equal(JSON.stringify(store.layout), edited, 'reset itself is undoable');
  assert.equal(store.undo() && store.undo() && store.undo(), false, 'history exhausted');
  const refused = store.apply((l, c) => setVisible(l, c, 'addressbar', false));
  assert.equal(refused.ok, false);
  assert.equal(store.canRedo, true, 'a refused op does not clear redo');
});

test('history is bounded and new ops clear redo', () => {
  const store = new LayoutStore({ layout: presetCopy('compact'), defaults: () => presetCopy('compact'), catalog: () => catalog, maxHistory: 3 });
  for (let i = 0; i < 10; i++) store.apply((l, c) => setVisible(l, c, 'bookmarksbar', i % 2 === 0));
  let n = 0; while (store.undo()) n++;
  assert.equal(n, 3);
  store.redo();
  store.apply((l, c) => setVisible(l, c, 'toolbar', true));
  assert.equal(store.canRedo, false);
});

test('edit mode toggles and notifies', () => {
  const store = new LayoutStore({ layout: presetCopy('compact'), defaults: () => presetCopy('compact'), catalog: () => catalog });
  const seen: boolean[] = [];
  store.onEditMode((e) => seen.push(e));
  store.toggleEditMode(); store.setEditMode(true); store.toggleEditMode();
  assert.deepEqual(seen, [true, false]);
});

test('ACCEPTANCE-3 logic: edit, autosave, restart, restore; reset from corrupt file', async () => {
  const { s, storage } = memStorage();
  const fs = fakeScheduler();
  let { store } = await boot(storage, fs.sch);
  assert.equal(region(store.layout, 'corvid-tabstrip'), 'left', 'default preset is vertical tabs');
  store.apply((l, c) => setTabPosition(l, c, 'top'));
  store.apply((l, c) => setVisible(l, c, 'bookmarksbar', false));
  store.apply((l, c) => resizeSlot(l, c, 'sidepanel', { unit: 'rem', value: 30 }));
  store.apply((l, c) => setVisible(l, c, 'sidepanel', true));
  assert.equal(s.writes, 0, 'debounced: nothing written yet');
  assert.equal(fs.size(), 1, 'one pending timer despite four commits');
  fs.run();
  await new Promise((r) => setImmediate(r));
  assert.equal(s.writes, 1);
  const before = JSON.stringify(store.layout);

  // "restart"
  const second = await boot(storage, fakeScheduler().sch);
  assert.equal(second.restored.source, 'saved');
  assert.equal(JSON.stringify(second.restored.layout), before);
  assert.equal(region(second.restored.layout, 'corvid-tabstrip'), 'top');
  assert.equal(findSlot(second.restored.layout, 'bookmarksbar')!.slot.visible, false);
  assert.equal(findSlot(second.restored.layout, 'sidepanel')!.slot.size!.value, 30);

  // corrupt the file on disk, restart: default layout, original text backed up, nothing overwritten yet
  const good = s.data!;
  s.data = good.slice(0, good.length / 2);
  const third = await boot(storage, fakeScheduler().sch);
  assert.equal(third.restored.source, 'default');
  assert.ok(third.restored.problems.length > 0);
  assert.equal(third.p.corrupt, true);
  assert.deepEqual(s.backups, [good.slice(0, good.length / 2)]);
  assert.equal(JSON.stringify(third.restored.layout), JSON.stringify(PRESETS[DEFAULT_PRESET]));
  assert.equal(s.data, good.slice(0, good.length / 2), 'corrupt data untouched until a commit');
  store = third.store;

  // Reset layout from a good-but-edited state restores defaults and persists them
  const fs4 = fakeScheduler();
  const fourth = await boot({ read: async () => good, write: storage.write }, fs4.sch);
  assert.equal(region(fourth.store.layout, 'corvid-tabstrip'), 'top');
  fourth.store.reset();
  assert.equal(JSON.stringify(fourth.store.layout), JSON.stringify(PRESETS[DEFAULT_PRESET]));
  fs4.run(); await new Promise((r) => setImmediate(r));
  const fifth = await boot(storage, fakeScheduler().sch);
  assert.equal(JSON.stringify(fifth.restored.layout), JSON.stringify(PRESETS[DEFAULT_PRESET]));
});

test('deliberately corrupted layout files all fall back safely', async () => {
  const lib = (layout: unknown, active = 'desktop-classic') => JSON.stringify({ format: 1, active, layouts: { [active]: layout } });
  const noAddr = presetCopy('desktop-classic');
  noAddr.regions.top.slots = noAddr.regions.top.slots.filter((s) => s.id !== 'addressbar');
  const cases: Array<[string, string]> = [
    ['empty object', '{}'], ['array', '[]'], ['binary junk', '\u0000\u0001\u0002'], ['wrong format', JSON.stringify({ format: 9, active: 'x', layouts: {} })],
    ['layout wrong type', lib('nope')], ['version bump', lib({ ...presetCopy('compact'), version: 99 })],
    ['active points nowhere', JSON.stringify({ format: 1, active: 'ghost', layouts: {} })],
  ];
  for (const [why, text] of cases) {
    const { storage } = memStorage(text);
    const { restored } = await boot(storage, fakeScheduler().sch);
    assert.deepEqual(checkGuardRails(restored.layout, catalog), [], why);
    assert.deepEqual(checkSemantics(restored.layout, catalog), [], why);
    assert.equal(restored.source, 'default', why);
  }
  // Missing address bar is repaired rather than discarded.
  const { restored } = await boot(memStorage(lib(noAddr)).storage, fakeScheduler().sch);
  assert.equal(restored.source, 'saved');
  assert.ok(restored.repaired.some((c) => c.includes('addressbar')));
  assert.deepEqual(checkGuardRails(restored.layout, catalog), []);
});

test('sanitize: unknown builtin dropped, ui-mod kept, duplicates dropped, hidden required restored, disallowed region fixed', () => {
  const l = presetCopy('desktop-classic');
  l.regions.top.slots.push({ id: 'ghost', moduleId: 'corvid.ghost', component: 'corvid-ghost', visible: true });
  l.regions.right.slots.push({ id: 'sample', moduleId: 'example.sample-panel', component: 'sample-panel', visible: true });
  l.regions.bottom.slots.push({ id: 'dup', moduleId: 'corvid.toolbar', component: 'corvid-toolbar', visible: true });
  findSlot(l, 'tabstrip')!.slot.visible = false;
  l.regions.left.slots.push(...l.regions.top.slots.splice(l.regions.top.slots.findIndex((s) => s.id === 'addressbar'), 1));
  const { layout, changes } = sanitize(l, catalog);
  assert.ok(!findSlot(layout, 'ghost'));
  assert.ok(findSlot(layout, 'sample'));
  assert.equal(findSlot(layout, 'tabstrip')!.slot.visible, true);
  assert.equal(findSlot(layout, 'addressbar')!.region, 'top');
  assert.equal(allSlots(layout).filter((s) => s.slot.component === 'corvid-toolbar').length, 1, 'one instance per component');
  assert.ok(changes.length >= 3);
  assert.deepEqual(checkGuardRails(layout, catalog), []);
});

test('loadLayout accepts JSON text; invalid JSON falls back', () => {
  const fb = presetCopy('compact');
  assert.equal(loadLayout(JSON.stringify(presetCopy('mobile')), catalog, fb).source, 'saved');
  const r = loadLayout('{nope', catalog, fb);
  assert.equal(r.source, 'default');
  assert.equal(r.layout.name, 'compact');
});

test('persistence: library keeps per-name layouts, switchActive, breakpoints', async () => {
  const { s, storage } = memStorage();
  const fs = fakeScheduler();
  const { p, store } = await boot(storage, fs.sch);
  assert.equal(layoutNameForWidth(store.layout, 500), 'mobile');
  assert.equal(layoutNameForWidth(store.layout, 601), undefined);
  assert.equal(layoutNameForWidth(PRESETS['mobile']!, 100), undefined);
  store.apply((l, c) => setVisible(l, c, 'bookmarksbar', false));
  const next = p.switchActive('compact');
  store.switchTo(next);
  fs.run(); await new Promise((r) => setImmediate(r));
  const saved = JSON.parse(s.data!);
  assert.equal(saved.active, 'compact');
  assert.deepEqual(Object.keys(saved.layouts).sort(), ['compact', DEFAULT_PRESET].sort());
  assert.equal(Object.values(saved.layouts[DEFAULT_PRESET].regions as Record<string, { slots: Array<{ id: string; visible: boolean }> }>).flatMap((r) => r.slots).find((x) => x.id === 'bookmarksbar')!.visible, false);
  assert.deepEqual(p.list().sort(), ['compact', 'desktop-classic', 'desktop-vertical-tabs', 'mobile']);
});

test('export/import round trip; import rejects layouts that break guard rails', () => {
  const l = presetCopy('desktop-vertical-tabs');
  const r = importLayout(exportLayout(l), catalog);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.layout, l);
  const noTabs = presetCopy('compact');
  noTabs.regions.top.slots = noTabs.regions.top.slots.filter((s) => s.id !== 'tabstrip');
  // tabstrip gets re-added by sanitize, so import succeeds with a repair note
  const r2 = importLayout(JSON.stringify(noTabs), catalog);
  assert.ok(r2.ok && r2.repaired.some((x) => x.includes('tabs')));
  assert.equal(importLayout('{', catalog).ok, false);
  assert.equal(importLayout('{"version":1}', catalog).ok, false);
  // No provider for a role in the catalog: cannot repair.
  const limited = new Map([...catalog].filter(([k]) => k !== 'corvid-layout-menu'));
  assert.equal(importLayout(exportLayout(l), limited).ok, false);
});

// ---- drag and drop ----

const R = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
const dnd = (point: { x: number; y: number }, dragging = 'tabstrip'): DropInput => ({
  regions: { top: R(0, 0, 1000, 120), left: R(0, 120, 200, 800), right: R(800, 120, 1000, 800), bottom: R(0, 800, 1000, 840), floating: R(300, 300, 700, 600) },
  slots: [
    { id: 'tabstrip', region: 'top', row: 0, rect: R(0, 0, 1000, 40) },
    { id: 'toolbar', region: 'top', row: 1, rect: R(0, 40, 100, 80) },
    { id: 'addressbar', region: 'top', row: 1, rect: R(100, 40, 800, 80) },
    { id: 'menu', region: 'top', row: 1, rect: R(800, 40, 900, 80) },
    { id: 'bookmarksbar', region: 'top', row: 2, rect: R(0, 80, 1000, 120) },
    { id: 'a', region: 'left', rect: R(0, 120, 200, 300) },
    { id: 'b', region: 'left', rect: R(0, 300, 200, 500) },
  ],
  dragging, point,
});

test('dropTarget: rows, new rows, columns, floating, empty region, outside', () => {
  assert.deepEqual(dropTarget(dnd({ x: 50, y: 60 })), { region: 'top', index: 0, newRow: false }, 'left of toolbar in its row');
  assert.deepEqual(dropTarget(dnd({ x: 450, y: 60 })), { region: 'top', index: 1, newRow: false }, 'after toolbar (index among slots without the dragged one)');
  assert.deepEqual(dropTarget(dnd({ x: 950, y: 60 })), { region: 'top', index: 3, newRow: false });
  assert.deepEqual(dropTarget(dnd({ x: 500, y: 100 })), { region: 'top', index: 3, newRow: false }, 'inside bookmarks row, dragged slot excluded from indexes');
  assert.deepEqual(dropTarget(dnd({ x: 500, y: 20 }, 'bookmarksbar')), { region: 'top', index: 0, newRow: false });
  assert.deepEqual(dropTarget(dnd({ x: 100, y: 200 })), { region: 'left', index: 0, newRow: false });
  assert.deepEqual(dropTarget(dnd({ x: 100, y: 350 })), { region: 'left', index: 1, newRow: false });
  assert.deepEqual(dropTarget(dnd({ x: 100, y: 700 })), { region: 'left', index: 2, newRow: false });
  assert.deepEqual(dropTarget(dnd({ x: 900, y: 500 })), { region: 'right', index: 0, newRow: false });
  assert.deepEqual(dropTarget(dnd({ x: 500, y: 450 })), { region: 'floating', index: 0, newRow: false });
  assert.deepEqual(dropTarget(dnd({ x: 500, y: 820 })), { region: 'bottom', index: 0, newRow: false });
  assert.equal(dropTarget(dnd({ x: 5000, y: 5000 })), undefined);
});

test('dropTarget feeds moveSlot end to end', () => {
  const l = presetCopy('desktop-classic');
  const t = dropTarget(dnd({ x: 100, y: 450 }))!;
  const r = moveSlot(l, catalog, 'tabstrip', t.region, t.index, { newRow: t.newRow });
  assert.ok(r.ok);
  if (r.ok) assert.equal(region(r.layout, 'corvid-tabstrip'), 'left');
});

test('address bar can be moved to the bottom or top in every preset (desktop and mobile), never elsewhere, never removed', () => {
  for (const name of Object.keys(PRESETS)) {
    let l = presetCopy(name);
    const start = addressBarPosition(l, catalog);
    assert.ok(start === 'top' || start === 'bottom', `${name} starts in a bar`);
    for (const pos of ['bottom', 'top', 'bottom'] as const) {
      const r = setAddressBarPosition(l, catalog, pos); ok(r); if (r.ok) l = r.layout;
      assert.equal(addressBarPosition(l, catalog), pos, `${name} -> ${pos}`);
      assert.equal(findSlot(l, 'addressbar')!.slot.visible, true);
      assert.deepEqual(checkSemantics(l, catalog), [], name);
      assert.deepEqual(checkGuardRails(l, catalog), [], name);
    }
    for (const bad of ['left', 'right', 'floating'] as const) assert.equal(moveSlot(l, catalog, 'addressbar', bad, 0).ok, false, `${name}: address bar refused in ${bad}`);
    assert.equal(removeSlot(l, catalog, 'addressbar').ok, false);
    assert.equal(setVisible(l, catalog, 'addressbar', false).ok, false);
  }
});

test('address bar position persists across restart and survives reset semantics', async () => {
  const { s, storage } = memStorage();
  const fs = fakeScheduler();
  const first = await boot(storage, fs.sch);
  first.store.apply((l, c) => setAddressBarPosition(l, c, 'bottom'));
  fs.run(); await new Promise((r) => setImmediate(r));
  const second = await boot(storage, fakeScheduler().sch);
  assert.equal(addressBarPosition(second.restored.layout, catalog), 'bottom');
  second.store.reset();
  assert.equal(addressBarPosition(second.store.layout, catalog), addressBarPosition(PRESETS[DEFAULT_PRESET]!, catalog));
  assert.ok(s.writes >= 1);
});

test('drag and drop of the address bar onto the bottom bar works end to end', () => {
  const l = presetCopy('desktop-classic');
  const input = dnd({ x: 500, y: 820 }, 'addressbar');
  const t = dropTarget(input)!;
  assert.equal(t.region, 'bottom');
  const r = moveSlot(l, catalog, 'addressbar', t.region, t.index, { newRow: t.newRow });
  assert.ok(r.ok);
  if (r.ok) assert.equal(addressBarPosition(r.layout, catalog), 'bottom');
});

test('setting addressbar.position exists in the manifest with top/bottom only', () => {
  const m = manifests.find((x) => x.id === 'corvid.addressbar')!;
  const s = m.settings!.find((x) => x.key === 'addressbar.position')!;
  assert.deepEqual(s.values, ['top', 'bottom']);
  assert.equal(s.default, 'top');
});
