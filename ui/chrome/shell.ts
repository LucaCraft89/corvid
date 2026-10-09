// corvid://chrome-shell entry. Wires theme, module host, layout store/persistence, shortcuts.
// UNVERIFIED in a browser. The browser-side services (Mojo) are described by ShellServices.
import '../layout/layout-host.ts';
import './components.ts';
import { ThemeController } from '../../theme/engine/controller.ts';
import { LinuxColorProvider, type LinuxSources } from '../../theme/providers/linux/provider.ts';
import { ModuleHost, type HostBackend, type KeyValueStore, type CodeLoader, type Prompter } from '../modules/host.ts';
import { LayoutStore } from '../layout/store.ts';
import { LayoutPersistence, layoutNameForWidth, type LayoutStorage } from '../layout/persistence.ts';
import { presetCopy } from '../layout/defaults.ts';
import type { CvLayoutHost } from '../layout/layout-host.ts';
import { setBridge, type ChromeBridge } from './bridge.ts';

/** Everything the browser process provides (Mojo in production). */
export interface ShellServices {
  chrome: ChromeBridge;
  layoutStorage: LayoutStorage;
  linuxSources: LinuxSources;
  moduleBackend: HostBackend;
  moduleStorage: KeyValueStore;
  moduleState: KeyValueStore;
  manifests: unknown[]; // builtin module manifests (module.json contents)
  loadCode: CodeLoader;
  prompter: Prompter;
  openSettings(path: string): void;
}

export const SHORTCUTS = { edit: { ctrl: true, shift: true, alt: false, key: 'L' }, reset: { ctrl: true, shift: true, alt: true, key: 'L' } } as const;

export async function startShell(root: HTMLElement, svc: ShellServices): Promise<{ store: LayoutStore; host: ModuleHost; theme: ThemeController }> {
  setBridge(svc.chrome);

  const theme = new ThemeController(new LinuxColorProvider(svc.linuxSources));
  theme.attach(document.documentElement);
  await theme.start();

  const host = new ModuleHost({ backend: svc.moduleBackend, storage: svc.moduleStorage, state: svc.moduleState, prompter: svc.prompter, loadCode: svc.loadCode });
  for (const m of svc.manifests) host.install(m);
  for (const m of host.manifests()) if (m.kind === 'builtin') await host.load(m.id);

  const persistence = new LayoutPersistence({ storage: svc.layoutStorage, catalog: () => host.catalog() });
  const restored = await persistence.load();
  const store = new LayoutStore({ layout: restored.layout, defaults: () => persistence.defaultsFor(), catalog: () => host.catalog() });
  persistence.attach(store);
  addEventListener('pagehide', () => void persistence.flush());

  const layoutHost = document.createElement('cv-layout-host') as CvLayoutHost;
  layoutHost.store = store;
  const content = document.createElement('div');
  content.slot = 'content';
  content.id = 'content-frame-host'; // native side parents the WebContents view here
  layoutHost.append(content);
  root.replaceChildren(layoutHost);

  // Always-reachable guard rails: keyboard shortcuts and menu events.
  addEventListener('keydown', (e) => {
    if (e.key.toUpperCase() !== 'L' || !e.ctrlKey || !e.shiftKey) return;
    e.preventDefault();
    if (e.altKey) store.reset(); else store.toggleEditMode();
  });
  root.addEventListener('cv-edit-layout', () => store.setEditMode(true));
  root.addEventListener('cv-reset-layout', () => store.reset());
  root.addEventListener('cv-open-settings', () => svc.openSettings('layout'));

  // Responsive: breakpoints pick a named layout; edits on it persist under that name.
  const mq = () => {
    const name = layoutNameForWidth(presetCopy(persistence.active), innerWidth);
    const target = name ?? (persistence.active === 'mobile' ? 'desktop-classic' : persistence.active);
    if (target !== persistence.active) store.switchTo(persistence.switchActive(target));
  };
  addEventListener('resize', mq);

  return { store, host, theme };
}
