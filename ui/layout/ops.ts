// Pure layout operations. Each returns a new layout or a refusal; guard rails are enforced here.
import { allSlots, cloneLayout, findSlot, type Catalog, type Layout, type RegionId, type Size, type SlotInstance } from './model.ts';
import { checkGuardRails, clampSize } from './validate.ts';

export type OpResult = { ok: true; layout: Layout } | { ok: false; reason: string };
const fail = (reason: string): OpResult => ({ ok: false, reason });

function finish(l: Layout, cat: Catalog): OpResult {
  const g = checkGuardRails(l, cat);
  return g.length ? fail(g[0]!.message) : { ok: true, layout: l };
}

const isBar = (r: RegionId) => r === 'top' || r === 'bottom';

export interface MoveOptions {
  /** top/bottom only: put the slot on a new row instead of joining its neighbors' row. */
  newRow?: boolean;
}

export function moveSlot(layout: Layout, cat: Catalog, slotId: string, to: RegionId, index: number, opts: MoveOptions = {}): OpResult {
  const found = findSlot(layout, slotId);
  if (!found) return fail(`no slot ${slotId}`);
  const info = cat.get(found.slot.component);
  if (info && !info.movable && found.region !== to) return fail(`${found.slot.component} is not movable`);
  if (info && !info.allowedRegions.includes(to)) return fail(`${found.slot.component} cannot be placed in ${to}`);
  const l = cloneLayout(layout);
  const from = l.regions[found.region].slots;
  const [slot] = from.splice(found.index, 1) as [SlotInstance];
  const target = l.regions[to].slots;
  // When moving within one region, `index` is relative to the list without the moved slot.
  const at = Math.max(0, Math.min(index, target.length));
  if (isBar(to)) {
    if (opts.newRow) slot.row = Math.min(15, Math.max(-1, ...target.map((s) => s.row ?? 0)) + 1);
    else slot.row = target[at]?.row ?? target[at - 1]?.row ?? 0;
  } else delete slot.row;
  if (to !== 'floating') delete slot.position;
  else slot.position ??= { x: 0.1, y: 0.1 };
  target.splice(at, 0, slot);
  return finish(l, cat);
}

export function setVisible(layout: Layout, cat: Catalog, slotId: string, visible: boolean): OpResult {
  const found = findSlot(layout, slotId);
  if (!found) return fail(`no slot ${slotId}`);
  const info = cat.get(found.slot.component);
  if (!visible && info && !info.hideable) return fail(`${found.slot.component} cannot be hidden`);
  const l = cloneLayout(layout);
  findSlot(l, slotId)!.slot.visible = visible;
  return finish(l, cat);
}

export function resizeSlot(layout: Layout, cat: Catalog, slotId: string, size: Size): OpResult {
  const found = findSlot(layout, slotId);
  if (!found) return fail(`no slot ${slotId}`);
  const info = cat.get(found.slot.component);
  if (info && !info.resizable) return fail(`${found.slot.component} is not resizable`);
  if (!(size.value > 0) || !Number.isFinite(size.value)) return fail('size must be positive');
  const l = cloneLayout(layout);
  const s = findSlot(l, slotId)!.slot;
  s.size = { unit: size.unit, value: size.unit === 'rem' ? clampSize(info, size.value) : size.value };
  return { ok: true, layout: l };
}

export function resizeRegion(layout: Layout, region: RegionId, size: Size): OpResult {
  if (!(size.value > 0) || !Number.isFinite(size.value)) return fail('size must be positive');
  const l = cloneLayout(layout);
  l.regions[region].size = { ...size };
  return { ok: true, layout: l };
}

export function setRegionCollapsed(layout: Layout, region: RegionId, collapsed: boolean): OpResult {
  const l = cloneLayout(layout);
  l.regions[region].collapsed = collapsed;
  return { ok: true, layout: l };
}

export function moveFloating(layout: Layout, slotId: string, x: number, y: number): OpResult {
  const found = findSlot(layout, slotId);
  if (!found || found.region !== 'floating') return fail(`${slotId} is not floating`);
  const l = cloneLayout(layout);
  findSlot(l, slotId)!.slot.position = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  return { ok: true, layout: l };
}

export function addComponent(layout: Layout, cat: Catalog, component: string, region?: RegionId, index?: number): OpResult {
  const info = cat.get(component);
  if (!info) return fail(`unknown component ${component}`);
  const to = region ?? info.defaultRegion;
  if (!info.allowedRegions.includes(to)) return fail(`${component} cannot be placed in ${to}`);
  if (allSlots(layout).some(({ slot }) => slot.component === component)) return fail(`${component} is already in the layout`);
  const l = cloneLayout(layout);
  const used = new Set(allSlots(l).map(({ slot }) => slot.id));
  const base = component.replace(/^corvid-/, '');
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  const slot: SlotInstance = { id, moduleId: info.moduleId, component, visible: true };
  if (info.defaultSize !== undefined && info.resizable) slot.size = { unit: 'rem', value: info.defaultSize };
  if (to === 'floating') slot.position = { x: 0.1, y: 0.1 };
  const list = l.regions[to].slots;
  const at = Math.max(0, Math.min(index ?? list.length, list.length));
  if (isBar(to)) slot.row = list[at]?.row ?? list[at - 1]?.row ?? 0;
  list.splice(at, 0, slot);
  return finish(l, cat);
}

export function removeSlot(layout: Layout, cat: Catalog, slotId: string): OpResult {
  const found = findSlot(layout, slotId);
  if (!found) return fail(`no slot ${slotId}`);
  const info = cat.get(found.slot.component);
  if (info && !info.hideable) return fail(`${found.slot.component} cannot be removed`);
  const l = cloneLayout(layout);
  l.regions[found.region].slots.splice(found.index, 1);
  return finish(l, cat);
}

function setRolePosition(layout: Layout, cat: Catalog, role: 'tabs' | 'addressbar', position: RegionId): OpResult {
  const found = allSlots(layout).find(({ slot }) => cat.get(slot.component)?.role === role);
  if (!found) return fail(`no ${role} component in layout`);
  // Leads its bar: index 0, own row.
  return moveSlot(layout, cat, found.slot.id, position, 0, { newRow: position === 'top' || position === 'bottom' });
}

/** Convenience for the `tabstrip.position` setting: move the tabs component to a region. */
export function setTabPosition(layout: Layout, cat: Catalog, position: 'top' | 'left' | 'right' | 'bottom'): OpResult {
  return setRolePosition(layout, cat, 'tabs', position);
}

/**
 * `addressbar.position` setting: the address bar lives in the top or bottom bar (desktop and Android).
 * Other regions are refused by the manifest's allowedSlots; the component can never be hidden or removed.
 */
export function setAddressBarPosition(layout: Layout, cat: Catalog, position: 'top' | 'bottom'): OpResult {
  return setRolePosition(layout, cat, 'addressbar', position);
}

/** Current address bar side, for the settings page / Android wiring. */
export function addressBarPosition(layout: Layout, cat: Catalog): 'top' | 'bottom' | undefined {
  const f = allSlots(layout).find(({ slot }) => cat.get(slot.component)?.role === 'addressbar');
  return f && (f.region === 'top' || f.region === 'bottom') ? f.region : undefined;
}

/** Keyboard reordering: move one position earlier/later within the slot's region. */
export function nudgeSlot(layout: Layout, cat: Catalog, slotId: string, dir: -1 | 1): OpResult {
  const f = findSlot(layout, slotId);
  if (!f) return fail(`no slot ${slotId}`);
  const n = layout.regions[f.region].slots.length;
  const to = f.index + dir;
  if (to < 0 || to >= n) return fail('already at the edge');
  return moveSlot(layout, cat, slotId, f.region, to);
}
