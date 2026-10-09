// LayoutStore: current layout + edit mode + undo/redo. Framework-free so it is unit-testable.
import { cloneLayout, type Catalog, type Layout } from './model.ts';
import type { OpResult } from './ops.ts';

export interface StoreOptions {
  layout: Layout;
  /** Layout restored by reset(). */
  defaults: () => Layout;
  catalog: () => Catalog;
  maxHistory?: number;
}

type Listener = (layout: Layout) => void;

export class LayoutStore {
  private current: Layout;
  private undoStack: Layout[] = [];
  private redoStack: Layout[] = [];
  private editing = false;
  private opts: StoreOptions;
  private changeListeners = new Set<Listener>();
  private commitListeners = new Set<Listener>();
  private editListeners = new Set<(editing: boolean) => void>();

  constructor(opts: StoreOptions) {
    this.opts = opts;
    this.current = cloneLayout(opts.layout);
  }

  get layout(): Layout { return this.current; }
  get catalog(): Catalog { return this.opts.catalog(); }
  get editMode(): boolean { return this.editing; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  setEditMode(on: boolean): void {
    if (this.editing === on) return;
    this.editing = on;
    for (const l of this.editListeners) l(on);
  }
  toggleEditMode(): void { this.setEditMode(!this.editing); }

  /** Apply a pure op. A refused op leaves state untouched. Every applied op is a commit (autosave trigger). */
  apply(op: (l: Layout, cat: Catalog) => OpResult): OpResult {
    const r = op(this.current, this.catalog);
    if (r.ok) this.commit(r.layout);
    return r;
  }

  undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this.current);
    this.current = prev;
    this.emit(true);
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.current);
    this.current = next;
    this.emit(true);
    return true;
  }

  /** Restore the default layout. Undoable. */
  reset(): void {
    this.commit(this.opts.defaults());
  }

  /** Replace without history (initial load / preset switch from persistence). */
  replace(layout: Layout, commit = false): void {
    this.current = cloneLayout(layout);
    this.undoStack = [];
    this.redoStack = [];
    this.emit(commit);
  }

  /** Switch to another layout (e.g. preset or breakpoint). Undoable. */
  switchTo(layout: Layout): void {
    this.commit(cloneLayout(layout));
  }

  subscribe(cb: Listener): () => void { this.changeListeners.add(cb); return () => this.changeListeners.delete(cb); }
  /** Fires on user-committed changes (not on replace()). Drives autosave. */
  onCommit(cb: Listener): () => void { this.commitListeners.add(cb); return () => this.commitListeners.delete(cb); }
  onEditMode(cb: (editing: boolean) => void): () => void { this.editListeners.add(cb); return () => this.editListeners.delete(cb); }

  private commit(next: Layout): void {
    this.undoStack.push(this.current);
    if (this.undoStack.length > (this.opts.maxHistory ?? 100)) this.undoStack.shift();
    this.redoStack = [];
    this.current = next;
    this.emit(true);
  }

  private emit(commit: boolean): void {
    for (const l of this.changeListeners) l(this.current);
    if (commit) for (const l of this.commitListeners) l(this.current);
  }
}
