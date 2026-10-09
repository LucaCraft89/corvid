// Manifest slot declarations -> layout component catalog.
import type { Catalog, ComponentInfo, RegionId } from '../layout/model.ts';
import type { ModuleManifest, SlotName } from './manifest.ts';

export function regionOf(slot: SlotName): RegionId {
  return slot.slice('window.'.length) as RegionId;
}

export function componentsOf(m: ModuleManifest): ComponentInfo[] {
  return (m.slots ?? []).map((s) => {
    const movable = s.movable ?? true;
    const defaultRegion = regionOf(s.slot);
    const allowed = movable ? (s.allowedSlots ?? (['window.top', 'window.bottom', 'window.left', 'window.right', 'window.floating'] as SlotName[])).map(regionOf) : [defaultRegion];
    const info: ComponentInfo = {
      moduleId: m.id,
      component: s.component,
      title: s.title ?? s.component,
      defaultRegion,
      allowedRegions: allowed.includes(defaultRegion) ? allowed : [defaultRegion, ...allowed],
      movable,
      resizable: s.resizable ?? false,
      hideable: s.hideable ?? true,
    };
    if (s.role) info.role = s.role;
    if (s.minSize !== undefined) info.minSize = s.minSize;
    if (s.maxSize !== undefined) info.maxSize = s.maxSize;
    if (s.defaultSize !== undefined) info.defaultSize = s.defaultSize;
    return info;
  });
}

export function buildCatalog(manifests: Iterable<ModuleManifest>): Map<string, ComponentInfo> {
  const out = new Map<string, ComponentInfo>();
  for (const m of manifests) for (const c of componentsOf(m)) out.set(c.component, c);
  return out;
}

export type { Catalog };
