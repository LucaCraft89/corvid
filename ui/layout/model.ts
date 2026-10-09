// Layout data model. Mirrors ui/layout/layout.schema.json.

export const REGION_IDS = ['top', 'bottom', 'left', 'right', 'floating'] as const;
export type RegionId = (typeof REGION_IDS)[number];

export type SizeUnit = 'rem' | 'fr' | '%';
export interface Size { unit: SizeUnit; value: number }

export interface SlotInstance {
  id: string;
  moduleId: string;
  /** Custom element tag name. */
  component: string;
  visible: boolean;
  /** top/bottom regions: consecutive slots with equal row share a horizontal row. */
  row?: number;
  size?: Size;
  /** Floating region only: fractions of the viewport. */
  position?: { x: number; y: number };
}

export interface Region {
  slots: SlotInstance[];
  size?: Size;
  collapsed?: boolean;
}

export interface Breakpoint { maxWidth: number; layout: string }

export interface Layout {
  version: 1;
  name: string;
  regions: Record<RegionId, Region>;
  breakpoints?: Breakpoint[];
}

/** Guard-rail roles: every valid layout keeps >=1 visible component for each. */
export const REQUIRED_ROLES = ['tabs', 'addressbar', 'layout-menu'] as const;
export type Role = (typeof REQUIRED_ROLES)[number];

/** What the layout engine knows about a placeable component (derived from module manifests). */
export interface ComponentInfo {
  moduleId: string;
  component: string;
  title: string;
  defaultRegion: RegionId;
  allowedRegions: RegionId[];
  movable: boolean;
  resizable: boolean;
  hideable: boolean;
  role?: Role;
  minSize?: number;
  maxSize?: number;
  defaultSize?: number;
}

export type Catalog = ReadonlyMap<string, ComponentInfo>; // key: component tag

export function cloneLayout(l: Layout): Layout {
  return structuredClone(l);
}

export function allSlots(l: Layout): Array<{ region: RegionId; index: number; slot: SlotInstance }> {
  const out: Array<{ region: RegionId; index: number; slot: SlotInstance }> = [];
  for (const region of REGION_IDS) l.regions[region].slots.forEach((slot, index) => out.push({ region, index, slot }));
  return out;
}

export function findSlot(l: Layout, id: string) {
  return allSlots(l).find((s) => s.slot.id === id);
}
