// Bridge between chrome components and the browser process. Production impl is Mojo
// (src-overlay/corvid/chrome_shell/chrome_shell.mojom, UNVERIFIED); tests/dev use MockChromeBridge.
export interface Tab { id: number; title: string; url: string; active: boolean; loading: boolean; pinned: boolean }
export interface NavState { url: string; canGoBack: boolean; canGoForward: boolean; loading: boolean }
export interface BookmarkItem { id: string; title: string; url: string }
export interface ExtensionAction { id: string; name: string; iconUrl: string; badge?: string }

export interface ChromeBridge {
  tabs: {
    list(): Promise<Tab[]>;
    activate(id: number): Promise<void>;
    close(id: number): Promise<void>;
    create(url?: string): Promise<void>;
    onChanged(cb: () => void): () => void;
  };
  nav: {
    state(): Promise<NavState>;
    navigate(url: string): Promise<void>;
    back(): Promise<void>;
    forward(): Promise<void>;
    reload(): Promise<void>;
    onChanged(cb: () => void): () => void;
  };
  bookmarks: { list(): Promise<BookmarkItem[]> };
  extensions: { actions(): Promise<ExtensionAction[]>; trigger(id: string): Promise<void>; onChanged(cb: () => void): () => void };
}

let current: ChromeBridge | undefined;
export function setBridge(b: ChromeBridge): void { current = b; }
export function bridge(): ChromeBridge {
  if (!current) throw new Error('ChromeBridge not initialised');
  return current;
}

export class MockChromeBridge implements ChromeBridge {
  tabList: Tab[] = [{ id: 1, title: 'New Tab', url: 'corvid://newtab', active: true, loading: false, pinned: false }];
  nav_: NavState = { url: 'corvid://newtab', canGoBack: false, canGoForward: false, loading: false };
  private cbs = new Set<() => void>();
  private fire() { this.cbs.forEach((c) => c()); }
  tabs = {
    list: async () => this.tabList.map((t) => ({ ...t })),
    activate: async (id: number) => { this.tabList.forEach((t) => (t.active = t.id === id)); this.fire(); },
    close: async (id: number) => { this.tabList = this.tabList.filter((t) => t.id !== id); this.fire(); },
    create: async (url = 'corvid://newtab') => { const id = Math.max(0, ...this.tabList.map((t) => t.id)) + 1; this.tabList.forEach((t) => (t.active = false)); this.tabList.push({ id, title: url, url, active: true, loading: false, pinned: false }); this.fire(); },
    onChanged: (cb: () => void) => { this.cbs.add(cb); return () => this.cbs.delete(cb); },
  };
  nav = {
    state: async () => ({ ...this.nav_ }),
    navigate: async (url: string) => { this.nav_ = { ...this.nav_, url, canGoBack: true }; this.fire(); },
    back: async () => {}, forward: async () => {}, reload: async () => {},
    onChanged: (cb: () => void) => { this.cbs.add(cb); return () => this.cbs.delete(cb); },
  };
  bookmarks = { list: async (): Promise<BookmarkItem[]> => [] };
  extensions = { actions: async (): Promise<ExtensionAction[]> => [], trigger: async () => {}, onChanged: (cb: () => void) => { this.cbs.add(cb); return () => this.cbs.delete(cb); } };
}
