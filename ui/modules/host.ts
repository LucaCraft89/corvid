// Module host (UI side). Loads/unloads modules, enforces permissions, tracks resources.
// The same manifest format serves builtin modules and user-installed ui-mods.
// UI-mod API v0 is the `ModuleApi` surface created in createApi().
import type { ComponentInfo, RegionId } from '../layout/model.ts';
import { buildCatalog } from './catalog.ts';
import { validateManifest, validateSettingValue, type ModuleManifest, type SettingDecl } from './manifest.ts';
import { PermissionBroker, PermissionDeniedError, type Permission } from './permissions.ts';

export interface TabInfo { id: number; title: string; url: string; active: boolean }
export interface BookmarkInfo { id: string; title: string; url: string }

/** What the browser process offers. In Chromium this is backed by Mojo, one capability per permission. */
export interface HostBackend {
  tabs: {
    list(): Promise<TabInfo[]>;
    create(url: string): Promise<TabInfo>;
    close(id: number): Promise<void>;
    activate(id: number): Promise<void>;
    onChanged(cb: () => void): () => void;
  };
  bookmarks: { list(): Promise<BookmarkInfo[]>; add(title: string, url: string): Promise<BookmarkInfo> };
  theme: { tokens(): Record<string, string>; onChange(cb: () => void): () => void };
  layout: { get(): unknown; placeComponent(moduleId: string, component: string, region?: RegionId): void; removeComponent(component: string): void };
  notifications: { show(moduleId: string, title: string, body: string): void };
  /** Named internal services for builtin modules (permission internal.<name>). */
  internal: Partial<Record<'shell' | 'settings' | 'extensions', unknown>>;
}

export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ConsentRequest {
  manifest: ModuleManifest;
  required: Permission[];
  optional: Permission[];
}
/** Returns the subset the user granted. Called only for ui-mods. */
export type Prompter = (req: ConsentRequest) => Promise<Permission[]>;

export interface ModuleCode {
  onLoad?(ctx: ModuleContext): void | Promise<void>;
  onUnload?(): void | Promise<void>;
  onSettingsChanged?(key: string, value: unknown): void;
}
/** Fetches the module implementation (dynamic import of `entry` inside the sandbox frame). */
export type CodeLoader = (m: ModuleManifest) => Promise<ModuleCode>;

export interface ModuleApi {
  tabs: {
    list(): Promise<TabInfo[]>; create(url: string): Promise<TabInfo>; close(id: number): Promise<void>;
    activate(id: number): Promise<void>; onChanged(cb: () => void): () => void;
  };
  bookmarks: { list(): Promise<BookmarkInfo[]>; add(title: string, url: string): Promise<BookmarkInfo> };
  storage: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; remove(key: string): Promise<void> };
  theme: { getTokens(): Record<string, string>; onChange(cb: () => void): () => void };
  layout: { get(): unknown; placeSelf(region?: RegionId): void };
  notifications: { show(title: string, body: string): void };
  settings: { get(key: string): unknown; onChange(cb: (key: string, value: unknown) => void): () => void };
}

export interface ModuleContext {
  readonly id: string;
  readonly api: ModuleApi;
  /** Tracked timers/disposables: freed on unload. */
  setTimeout(fn: () => void, ms: number): number;
  setInterval(fn: () => void, ms: number): number;
  clearTimer(handle: number): void;
  addDisposable(fn: () => void): void;
  /** Builtin only: access an internal host service. Needs the matching internal.* permission. */
  internal(name: 'shell' | 'settings' | 'extensions'): unknown;
}

export class ModuleLoadError extends Error {
  constructor(message: string) { super(message); this.name = 'ModuleLoadError'; }
}
export class ModuleUnloadedError extends Error {
  constructor(id: string) { super(`module ${id} is unloaded`); this.name = 'ModuleUnloadedError'; }
}

type State = 'installed' | 'loading' | 'loaded';
interface Entry {
  manifest: ModuleManifest;
  state: State;
  code?: ModuleCode;
  disposables: Array<() => void>;
  timers: Map<number, 'timeout' | 'interval'>;
  alive: boolean;
  settingListeners: Set<(k: string, v: unknown) => void>;
  values: Map<string, unknown>;
}

export interface HostDeps {
  backend: HostBackend;
  storage: KeyValueStore;
  prompter: Prompter;
  loadCode: CodeLoader;
  /** Persistent grants + settings; module-scoped keys are prefixed by the host. */
  state: KeyValueStore;
}

export class ModuleHost {
  readonly broker = new PermissionBroker();
  private entries = new Map<string, Entry>();
  private catalogListeners = new Set<() => void>();
  private deps: HostDeps;

  constructor(deps: HostDeps) {
    this.deps = deps;
  }

  /** Validate and register a manifest. Does not run code. */
  install(raw: unknown): ModuleManifest {
    const v = validateManifest(raw);
    if (!v.ok) throw new ModuleLoadError(`invalid manifest: ${v.errors.join('; ')}`);
    const m = v.manifest;
    if (this.entries.has(m.id)) throw new ModuleLoadError(`module ${m.id} already installed`);
    this.entries.set(m.id, {
      manifest: m, state: 'installed', disposables: [], timers: new Map(), alive: false, settingListeners: new Set(),
      values: new Map((m.settings ?? []).map((s) => [s.key, s.default])),
    });
    return m;
  }

  /** Remove an unloaded module registration. */
  uninstall(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    if (e.state !== 'installed') throw new ModuleLoadError(`unload ${id} before uninstalling`);
    this.entries.delete(id);
  }

  isLoaded(id: string): boolean { return this.entries.get(id)?.state === 'loaded'; }
  manifests(): ModuleManifest[] { return [...this.entries.values()].map((e) => e.manifest); }
  loadedManifests(): ModuleManifest[] { return [...this.entries.values()].filter((e) => e.state === 'loaded').map((e) => e.manifest); }

  /** Components available to the layout editor palette: loaded modules only. */
  catalog(): Map<string, ComponentInfo> { return buildCatalog(this.loadedManifests()); }
  onCatalogChanged(cb: () => void): () => void { this.catalogListeners.add(cb); return () => this.catalogListeners.delete(cb); }

  /** Count of live tracked resources (disposables + timers). 0 after unload. */
  resourceCount(id: string): number {
    const e = this.entries.get(id);
    return e ? e.disposables.length + e.timers.size : 0;
  }

  async load(id: string, loading: string[] = []): Promise<void> {
    const e = this.entries.get(id);
    if (!e) throw new ModuleLoadError(`unknown module ${id}`);
    if (e.state === 'loaded') return;
    if (loading.includes(id)) throw new ModuleLoadError(`dependency cycle: ${[...loading, id].join(' -> ')}`);
    for (const dep of e.manifest.requires ?? []) {
      if (!this.entries.has(dep)) throw new ModuleLoadError(`${id} requires missing module ${dep}`);
      await this.load(dep, [...loading, id]);
    }
    e.state = 'loading';
    try {
      await this.grantPermissions(e);
      await this.restoreSettings(e);
      e.code = await this.deps.loadCode(e.manifest);
      e.alive = true;
      await e.code.onLoad?.(this.createContext(e));
      e.state = 'loaded';
    } catch (err) {
      await this.teardown(e);
      e.state = 'installed';
      throw err;
    }
    for (const cb of this.catalogListeners) cb();
  }

  /** Unloads the module and everything that depends on it. Returns unloaded ids (dependents first). */
  async unload(id: string): Promise<string[]> {
    const e = this.entries.get(id);
    if (!e) return [];
    const done: string[] = [];
    for (const [otherId, other] of this.entries) {
      if (other.state === 'loaded' && other.manifest.requires?.includes(id)) done.push(...(await this.unload(otherId)));
    }
    if (e.state === 'loaded' || e.state === 'loading') {
      try { await e.code?.onUnload?.(); } catch { /* module errors must not block cleanup */ }
      await this.teardown(e);
      e.state = 'installed';
      done.push(id);
      for (const cb of this.catalogListeners) cb();
    }
    return done;
  }

  async unloadAll(): Promise<void> {
    for (const id of [...this.entries.keys()]) await this.unload(id);
  }

  // ---- settings (auto-surfaced in the settings page from manifests) ----

  getSetting(id: string, key: string): unknown {
    return this.entries.get(id)?.values.get(key);
  }

  async setSetting(id: string, key: string, value: unknown): Promise<void> {
    const e = this.entries.get(id);
    const decl = e?.manifest.settings?.find((s) => s.key === key);
    if (!e || !decl) throw new Error(`unknown setting ${id}:${key}`);
    const bad = validateSettingValue(decl, value);
    if (bad) throw new Error(`invalid value for ${key}: ${bad}`);
    e.values.set(key, value);
    await this.deps.state.set(`setting:${id}:${key}`, value);
    if (e.state === 'loaded') {
      e.code?.onSettingsChanged?.(key, value);
      for (const l of e.settingListeners) l(key, value);
    }
  }

  /** All settings declarations grouped by module, for the settings page. */
  settingsSchema(): Array<{ moduleId: string; name: string; settings: SettingDecl[] }> {
    return this.manifests().filter((m) => m.settings?.length).map((m) => ({ moduleId: m.id, name: m.name, settings: m.settings! }));
  }

  // ---- internals ----

  private async restoreSettings(e: Entry): Promise<void> {
    for (const s of e.manifest.settings ?? []) {
      const v = await this.deps.state.get(`setting:${e.manifest.id}:${s.key}`);
      if (v !== undefined && validateSettingValue(s, v) === undefined) e.values.set(s.key, v);
    }
  }

  private async grantPermissions(e: Entry): Promise<void> {
    const m = e.manifest;
    const required = m.permissions ?? [];
    const optional = m.optionalPermissions ?? [];
    if (m.kind === 'builtin') {
      this.broker.grant(m.id, [...required, ...optional]);
      return;
    }
    const stored = (await this.deps.state.get(`grants:${m.id}`)) as Permission[] | undefined;
    let granted: Permission[];
    if (Array.isArray(stored) && required.every((p) => stored.includes(p))) {
      granted = stored.filter((p) => required.includes(p) || optional.includes(p));
    } else {
      const answer = await this.deps.prompter({ manifest: m, required, optional });
      granted = answer.filter((p) => required.includes(p) || optional.includes(p)); // never grant undeclared
      const missing = required.find((p) => !granted.includes(p));
      if (missing) throw new PermissionDeniedError(m.id, missing);
      await this.deps.state.set(`grants:${m.id}`, granted);
    }
    this.broker.grant(m.id, granted);
  }

  /** Forget stored consent so the next load prompts again. */
  async revokeGrants(id: string): Promise<void> {
    await this.deps.state.remove(`grants:${id}`);
    this.broker.revoke(id);
  }

  private async teardown(e: Entry): Promise<void> {
    e.alive = false;
    for (const [h, kind] of e.timers) (kind === 'timeout' ? clearTimeout : clearInterval)(h as unknown as ReturnType<typeof setTimeout>);
    e.timers.clear();
    for (const d of e.disposables.splice(0).reverse()) { try { d(); } catch { /* ignore */ } }
    e.settingListeners.clear();
    for (const s of e.manifest.slots ?? []) this.deps.backend.layout.removeComponent(s.component);
    this.broker.revoke(e.manifest.id);
    delete e.code;
  }

  private createContext(e: Entry): ModuleContext {
    const id = e.manifest.id;
    const track = (fn: () => void) => { e.disposables.push(fn); };
    const alive = () => { if (!e.alive) throw new ModuleUnloadedError(id); };
    const gate = <A extends unknown[], R>(perm: Permission, fn: (...a: A) => R) => (...a: A): R => {
      alive();
      this.broker.require(id, perm);
      return fn(...a);
    };
    const gateSub = <A extends unknown[]>(perm: Permission, subscribe: (...a: A) => () => void) => (...a: A): (() => void) => {
      alive();
      this.broker.require(id, perm);
      const off = subscribe(...a);
      let done = false;
      const wrapped = () => { if (!done) { done = true; off(); const i = e.disposables.indexOf(wrapped); if (i >= 0) e.disposables.splice(i, 1); } };
      track(wrapped);
      return wrapped;
    };
    const b = this.deps.backend;
    const kv = (k: string) => `${id}:${k}`;
    const api: ModuleApi = {
      tabs: {
        list: gate('tabs.read', () => b.tabs.list()),
        create: gate('tabs.manage', (url: string) => b.tabs.create(url)),
        close: gate('tabs.manage', (tid: number) => b.tabs.close(tid)),
        activate: gate('tabs.manage', (tid: number) => b.tabs.activate(tid)),
        onChanged: gateSub('tabs.read', (cb: () => void) => b.tabs.onChanged(cb)),
      },
      bookmarks: {
        list: gate('bookmarks.read', () => b.bookmarks.list()),
        add: gate('bookmarks.manage', (t: string, u: string) => b.bookmarks.add(t, u)),
      },
      storage: {
        get: gate('storage.local', (k: string) => this.deps.storage.get(kv(k))),
        set: gate('storage.local', (k: string, v: unknown) => this.deps.storage.set(kv(k), v)),
        remove: gate('storage.local', (k: string) => this.deps.storage.remove(kv(k))),
      },
      theme: {
        getTokens: gate('theme.read', () => b.theme.tokens()),
        onChange: gateSub('theme.read', (cb: () => void) => b.theme.onChange(cb)),
      },
      layout: {
        get: gate('layout.read', () => b.layout.get()),
        placeSelf: gate('layout.write', (region?: RegionId) => {
          const comp = e.manifest.slots?.[0]?.component;
          if (comp) b.layout.placeComponent(id, comp, region);
        }),
      },
      notifications: { show: gate('notifications', (t: string, body: string) => b.notifications.show(id, t, body)) },
      settings: {
        get: (k: string) => { alive(); return e.values.get(k); },
        onChange: (cb) => { alive(); e.settingListeners.add(cb); return () => { e.settingListeners.delete(cb); }; },
      },
    };
    return {
      id, api,
      setTimeout: (fn, ms) => { alive(); const real = setTimeout(() => { e.timers.delete(real as unknown as number); fn(); }, ms); e.timers.set(real as unknown as number, 'timeout'); return real as unknown as number; },
      setInterval: (fn, ms) => { alive(); const real = setInterval(fn, ms); e.timers.set(real as unknown as number, 'interval'); return real as unknown as number; },
      clearTimer: (h) => { const k = e.timers.get(h); if (k) { (k === 'timeout' ? clearTimeout : clearInterval)(h as unknown as ReturnType<typeof setTimeout>); e.timers.delete(h); } },
      addDisposable: (fn) => { alive(); track(fn); },
      internal: (name) => {
        alive();
        this.broker.require(id, `internal.${name}` as Permission);
        return b.internal[name];
      },
    };
  }
}
