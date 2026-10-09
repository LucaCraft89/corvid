// Pure drop-target computation for edit-mode drag and drop (kept DOM-free for testing).
import type { RegionId } from './model.ts';

export interface Rect { left: number; top: number; right: number; bottom: number }
export interface SlotRect { id: string; region: RegionId; row?: number | undefined; rect: Rect }
export interface DropInput {
  regions: Record<RegionId, Rect>;
  /** All rendered slots, in layout order (per region). */
  slots: SlotRect[];
  dragging: string;
  point: { x: number; y: number };
}
export interface DropTarget { region: RegionId; index: number; newRow: boolean }

const inside = (r: Rect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
const area = (r: Rect) => (r.right - r.left) * (r.bottom - r.top);

export function dropTarget(inp: DropInput): DropTarget | undefined {
  const { x, y } = inp.point;
  const hits = (Object.entries(inp.regions) as Array<[RegionId, Rect]>).filter(([, r]) => inside(r, x, y));
  if (hits.length === 0) return undefined;
  // Smallest region wins; floating always wins over bars it overlaps.
  hits.sort((a, b) => (a[0] === 'floating' ? -1 : b[0] === 'floating' ? 1 : area(a[1]) - area(b[1])));
  const region = hits[0]![0];
  const list = inp.slots.filter((s) => s.region === region && s.id !== inp.dragging);
  if (list.length === 0) return { region, index: 0, newRow: false };
  if (region === 'floating') return { region, index: list.length, newRow: false };

  const cy = (s: SlotRect) => (s.rect.top + s.rect.bottom) / 2;
  const cx = (s: SlotRect) => (s.rect.left + s.rect.right) / 2;

  if (region === 'left' || region === 'right') {
    return { region, index: list.filter((s) => cy(s) < y).length, newRow: false };
  }
  // top/bottom: consecutive equal rows form groups.
  const groups: Array<{ start: number; slots: SlotRect[]; top: number; bottom: number }> = [];
  list.forEach((s, i) => {
    const g = groups.at(-1);
    if (g && (g.slots[0]!.row ?? 0) === (s.row ?? 0)) {
      g.slots.push(s); g.top = Math.min(g.top, s.rect.top); g.bottom = Math.max(g.bottom, s.rect.bottom);
    } else groups.push({ start: i, slots: [s], top: s.rect.top, bottom: s.rect.bottom });
  });
  const first = groups[0]!;
  const last = groups.at(-1)!;
  if (y < first.top) return { region, index: 0, newRow: true };
  if (y > last.bottom) return { region, index: list.length, newRow: true };
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    if (y >= g.top && y <= g.bottom) return { region, index: g.start + g.slots.filter((s) => cx(s) < x).length, newRow: false };
    const next = groups[i + 1];
    if (next && y > g.bottom && y < next.top) return { region, index: next.start, newRow: true };
  }
  return { region, index: list.length, newRow: false };
}
