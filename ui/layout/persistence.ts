// Layout persistence: a small "library" file in the profile, debounced autosave, safe load.
// In the browser the LayoutStorage is backed by a Mojo handler writing <profile>/Corvid/layout.json
// (src-overlay/corvid/chrome_shell/layout_storage_handler.*).
import { DEFAULT_PRESET, PRESETS, presetCopy } from './defaults.ts';
import type { Catalog, Layout } from './model.ts';
import { cloneLayout } from './model.ts';
import { loadLayout, validateStructure, sanitize, checkGuardRails, checkSemantics, type Problem } from './validate.ts';
import type { LayoutStore } from './store.ts';

export interface LayoutStorage {
  read(): Promise<string | null>;
  write(data: string): Promise<void>;
  /** Optional: keep a copy of unreadable data before it is overwritten. */
  backupCorrupt?(data: string): Promise<void>;
}

export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const realScheduler: Scheduler = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

export interface Library {
  format: 1;
  active: string;
  layouts: Record<string, Layout>;
}

export interface Restored {
  layout: Layout;
  active: string;
  source: 'saved' | 'default';
  problems: Problem[];
  repaired: string[];
}

export interface PersistenceOptions {
  storage: LayoutStorage;
  catalog: () => Catalog;
  delayMs?: number;
  scheduler?: Scheduler;
}

export class LayoutPersistence {
  private opts: PersistenceOptions;
  private library: Library = { format: 1, active: DEFAULT_PRESET, layouts: {} };
  private timer: unknown;
  private pending = false;
  private detach: Array<() => void> = [];
  /** True when stored data was unreadable; the file is not overwritten until the user commits a change. */
  corrupt = false;

  constructor(opts: PersistenceOptions) {
    this.opts = opts;
  }

  get active(): string { return this.library.active; }

  /** Layout that "Reset layout" restores for the active name. */
  defaultsFor(name = this.library.active): Layout {
    return presetCopy(PRESETS[name] ? name : DEFAULT_PRESET);
  }

  async load(): Promise<Restored> {
    const cat = this.opts.catalog();
    let text: string | null = null;
    try { text = await this.opts.storage.read(); } catch { text = null; }
    if (text === null || text === '') {
      return { layout: presetCopy(DEFAULT_PRESET), active: DEFAULT_PRESET, source: 'default', problems: [], repaired: [] };
    }
    let lib: unknown;
    try { lib = JSON.parse(text); } catch (e) {
      return this.failed(text, [{ path: '/', message: `not valid JSON: ${(e as Error).message}` }]);
    }
    const o = lib as Partial<Library> | null;
    if (!o || typeof o !== 'object' || o.format !== 1 || typeof o.active !== 'string' || typeof o.layouts !== 'object' || o.layouts === null) {
      return this.failed(text, [{ path: '/', message: 'not a layout library' }]);
    }
    // Keep only layouts that survive validation; the rest are dropped silently from the library.
    const good: Record<string, Layout> = {};
    const problems: Problem[] = [];
    let repaired: string[] = [];
    for (const [name, raw] of Object.entries(o.layouts)) {
      const r = loadLayout(raw, cat, presetCopy(PRESETS[name] ? name : DEFAULT_PRESET));
      if (r.source === 'saved') { good[name] = r.layout; if (name === o.active) repaired = r.repaired; }
      else problems.push(...r.problems.map((p) => ({ path: `/layouts/${name}${p.path}`, message: p.message })));
    }
    this.library = { format: 1, active: o.active, layouts: good };
    const saved = good[o.active];
    if (saved) return { layout: cloneLayout(saved), active: o.active, source: 'saved', problems, repaired };
    // Active layout missing or invalid: fall back to the preset of that name (or the default).
    const name = PRESETS[o.active] ? o.active : DEFAULT_PRESET;
    this.library.active = name;
    return { layout: presetCopy(name), active: name, source: 'default', problems, repaired: [] };
  }

  private failed(text: string, problems: Problem[]): Restored {
    this.corrupt = true;
    void this.opts.storage.backupCorrupt?.(text);
    this.library = { format: 1, active: DEFAULT_PRESET, layouts: {} };
    return { layout: presetCopy(DEFAULT_PRESET), active: DEFAULT_PRESET, source: 'default', problems, repaired: [] };
  }

  /** Autosave on every committed change of `store` (debounced). */
  attach(store: LayoutStore): () => void {
    const off = store.onCommit((l) => this.schedule(l));
    this.detach.push(off);
    return () => { off(); this.detach = this.detach.filter((d) => d !== off); };
  }

  private schedule(l: Layout): void {
    this.library.layouts[this.library.active] = cloneLayout(l);
    this.pending = true;
    const sch = this.opts.scheduler ?? realScheduler;
    if (this.timer !== undefined) sch.clear(this.timer);
    this.timer = sch.set(() => { void this.flush(); }, this.opts.delayMs ?? 400);
  }

  /** Write now if there are unsaved changes. */
  async flush(): Promise<void> {
    const sch = this.opts.scheduler ?? realScheduler;
    if (this.timer !== undefined) { sch.clear(this.timer); this.timer = undefined; }
    if (!this.pending) return;
    this.pending = false;
    this.corrupt = false;
    await this.opts.storage.write(JSON.stringify(this.library, null, 2));
  }

  /** Change the active layout name (preset or custom). Returns the layout to display. */
  switchActive(name: string): Layout {
    this.library.active = name;
    this.pending = true;
    return cloneLayout(this.library.layouts[name] ?? this.defaultsFor(name));
  }

  list(): string[] {
    return [...new Set([...Object.keys(PRESETS), ...Object.keys(this.library.layouts)])];
  }
}

// ---- import / export (also the future sync payload) ----

export function exportLayout(l: Layout): string {
  return JSON.stringify(l, null, 2);
}

export type ImportResult = { ok: true; layout: Layout; repaired: string[] } | { ok: false; problems: Problem[] };
export function importLayout(text: string, cat: Catalog): ImportResult {
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, problems: [{ path: '/', message: `not valid JSON: ${(e as Error).message}` }] }; }
  const s = validateStructure(data);
  if (!s.ok) return { ok: false, problems: s.problems };
  const { layout, changes } = sanitize(s.layout, cat);
  const bad = [...checkSemantics(layout, cat), ...checkGuardRails(layout, cat)];
  return bad.length ? { ok: false, problems: bad } : { ok: true, layout, repaired: changes };
}

/** Layout name to use at this viewport width, per the active layout's breakpoints (smallest matching maxWidth). */
export function layoutNameForWidth(l: Layout, width: number): string | undefined {
  const bps = [...(l.breakpoints ?? [])].sort((a, b) => a.maxWidth - b.maxWidth);
  return bps.find((b) => width <= b.maxWidth)?.layout;
}
