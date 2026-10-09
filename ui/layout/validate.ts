// Layout validation: JSON schema, semantic checks, sanitization, guard rails.
import { Ajv } from 'ajv';
import schema from './layout.schema.json' with { type: 'json' };
import { REGION_IDS, REQUIRED_ROLES, allSlots, cloneLayout, type Catalog, type ComponentInfo, type Layout, type RegionId, type SlotInstance } from './model.ts';

export interface Problem { path: string; message: string }

const ajv = new Ajv({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

export type StructureResult = { ok: true; layout: Layout } | { ok: false; problems: Problem[] };

export function validateStructure(raw: unknown): StructureResult {
  if (validateSchema(raw)) return { ok: true, layout: raw as unknown as Layout };
  return { ok: false, problems: (validateSchema.errors ?? []).map((e) => ({ path: e.instancePath || '/', message: e.message ?? 'invalid' })) };
}

/** Errors that make a layout unusable even after sanitize(). */
export function checkSemantics(l: Layout, cat: Catalog): Problem[] {
  const out: Problem[] = [];
  const ids = new Set<string>();
  for (const { region, index, slot } of allSlots(l)) {
    const at = `/regions/${region}/slots/${index}`;
    if (ids.has(slot.id)) out.push({ path: at, message: `duplicate slot id ${slot.id}` });
    ids.add(slot.id);
    const info = cat.get(slot.component);
    if (!info) {
      if (isBuiltinModule(slot.moduleId)) out.push({ path: at, message: `unknown builtin component ${slot.component}` });
      continue;
    }
    if (info.moduleId !== slot.moduleId) out.push({ path: at, message: `component ${slot.component} belongs to ${info.moduleId}, not ${slot.moduleId}` });
    if (!info.allowedRegions.includes(region)) out.push({ path: at, message: `${slot.component} not allowed in ${region}` });
    if (!info.hideable && !slot.visible) out.push({ path: at, message: `${slot.component} cannot be hidden` });
  }
  return out;
}

/** Every layout must keep at least one visible component for each required role. */
export function checkGuardRails(l: Layout, cat: Catalog): Problem[] {
  const have = new Set<string>();
  for (const { slot } of allSlots(l)) {
    const info = cat.get(slot.component);
    if (info?.role && slot.visible) have.add(info.role);
  }
  return REQUIRED_ROLES.filter((r) => !have.has(r)).map((r) => ({ path: '/', message: `no visible component with role "${r}"` }));
}

export function isBuiltinModule(moduleId: string): boolean {
  return moduleId.startsWith('corvid.');
}

export function clampSize(info: ComponentInfo | undefined, value: number): number {
  let v = value;
  if (info?.minSize !== undefined) v = Math.max(info.minSize, v);
  if (info?.maxSize !== undefined) v = Math.min(info.maxSize, v);
  return v;
}

export interface SanitizeResult { layout: Layout; changes: string[] }

/**
 * Repairs recoverable damage: drops unknown builtin components and duplicate ids, moves slots out of
 * disallowed regions, un-hides non-hideable components, clamps sizes, and re-adds missing role components.
 * Unknown non-builtin (ui-mod) slots are kept: the mod may simply not be loaded yet.
 */
export function sanitize(input: Layout, cat: Catalog): SanitizeResult {
  const l = cloneLayout(input);
  const changes: string[] = [];
  const seen = new Set<string>();
  const seenComponents = new Set<string>();
  const moved: Array<{ slot: SlotInstance; to: RegionId }> = [];

  for (const region of REGION_IDS) {
    const kept: SlotInstance[] = [];
    for (const slot of l.regions[region].slots) {
      const info = cat.get(slot.component);
      if (seen.has(slot.id)) { changes.push(`dropped duplicate slot id ${slot.id}`); continue; }
      if (seenComponents.has(slot.component)) { changes.push(`dropped second instance of ${slot.component}`); continue; }
      seenComponents.add(slot.component);
      if (!info) {
        if (isBuiltinModule(slot.moduleId)) { changes.push(`dropped unknown component ${slot.component}`); continue; }
        seen.add(slot.id); kept.push(slot); continue;
      }
      seen.add(slot.id);
      if (info.moduleId !== slot.moduleId) { slot.moduleId = info.moduleId; changes.push(`fixed moduleId of ${slot.id}`); }
      if (!info.allowedRegions.includes(region)) { moved.push({ slot, to: info.defaultRegion }); changes.push(`moved ${slot.id} from ${region} to ${info.defaultRegion}`); continue; }
      if (!info.hideable && !slot.visible) { slot.visible = true; changes.push(`unhid ${slot.id}`); }
      if (slot.size && slot.size.unit === 'rem' && (info.minSize !== undefined || info.maxSize !== undefined)) {
        const c = clampSize(info, slot.size.value);
        if (c !== slot.size.value) { slot.size.value = c; changes.push(`clamped size of ${slot.id}`); }
      }
      if (region !== 'floating') delete slot.position;
      kept.push(slot);
    }
    l.regions[region].slots = kept;
  }
  for (const m of moved) {
    delete m.slot.position;
    l.regions[m.to].slots.push(m.slot);
  }

  // Re-add missing role components (visible), in their default region.
  for (const role of REQUIRED_ROLES) {
    const has = allSlots(l).some(({ slot }) => slot.visible && cat.get(slot.component)?.role === role);
    if (has) continue;
    const info = [...cat.values()].find((c) => c.role === role);
    if (!info) continue; // no provider in catalog: checkGuardRails will fail -> fallback layout
    const existing = allSlots(l).find(({ slot }) => slot.component === info.component);
    if (existing) { existing.slot.visible = true; changes.push(`restored ${role}`); continue; }
    let id = info.component.replace(/^corvid-/, '');
    while (seen.has(id)) id += '_';
    seen.add(id);
    l.regions[info.defaultRegion].slots.push({ id, moduleId: info.moduleId, component: info.component, visible: true, ...(info.defaultRegion === 'top' || info.defaultRegion === 'bottom' ? { row: 0 } : {}) });
    changes.push(`re-added required ${role} component`);
  }
  return { layout: l, changes };
}

export type LoadSource = 'saved' | 'default';
export interface LoadResult { layout: Layout; source: LoadSource; problems: Problem[]; repaired: string[] }

/** Parse + validate + repair untrusted layout data. Never throws; falls back to `fallback`. */
export function loadLayout(raw: unknown, cat: Catalog, fallback: Layout): LoadResult {
  const fb = (problems: Problem[]): LoadResult => ({ layout: cloneLayout(fallback), source: 'default', problems, repaired: [] });
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch (e) { return fb([{ path: '/', message: `not valid JSON: ${(e as Error).message}` }]); }
  }
  const s = validateStructure(data);
  if (!s.ok) return fb(s.problems);
  const { layout, changes } = sanitize(s.layout, cat);
  const bad = [...checkSemantics(layout, cat), ...checkGuardRails(layout, cat)];
  if (bad.length) return fb(bad);
  return { layout, source: 'saved', problems: [], repaired: changes };
}
