// Placeholder PageApi used by the packaged WebUI until the Mojo PageHandler (corvid_page_handler.mojom) is
// implemented (M4). Pages render with empty data instead of throwing. Replace via setPageApi() when the handler lands.
import type { PageApi } from './api.ts';

const none = async (): Promise<void> => {};
const noSub = (): (() => void) => () => {};
const query = new URLSearchParams(location.search);

export const stubApi: PageApi = {
  history: { query: async () => [], remove: none, clearAll: none },
  downloads: { list: async () => [], pause: none, resume: none, cancel: none, open: none, showInFolder: none, remove: none, clearFinished: none, onChanged: noSub },
  bookmarks: { tree: async () => [], remove: none, rename: none },
  extensions: {
    list: async () => [], setEnabled: none, remove: none, setIncognito: none, loadUnpacked: none,
    ntp: async () => ({ candidates: [], picked: null }), setNtpPick: none, storeSources: async () => [], onChanged: noSub,
  },
  newtab: { topSites: async () => [], forceDefault: () => query.has('default') },
  about: {
    info: async () => {
      const chromium = /Chrome\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? '';
      return { name: 'Corvid', version: chromium, chromiumVersion: chromium, os: navigator.platform, revision: '', profilePath: '', licenses: [] };
    },
  },
  error: {
    detail: async () => ({ url: query.get('url') ?? '', errorName: query.get('error') ?? 'ERR_FAILED', errorCode: 0 }),
    retry: none, proceedUnsafe: none, goBack: async () => { history.back(); }, copyReport: async (text) => { await navigator.clipboard?.writeText(text); },
  },
  crash: { info: async () => ({ url: query.get('url') ?? '', reason: '' }), reload: async () => { location.reload(); } },
  freeze: { info: async () => ({ url: query.get('url') ?? '', hungForMs: 0, stackAvailable: false }), wait: none, kill: none },
  settings: { navigateTo: () => {}, resetLayout: none, openThemeEditor: () => {} },
  gpu: { info: async () => ({ features: [], videoDecode: [], videoEncode: [], glRenderer: '', angleBackend: '', ozonePlatform: '', problems: [] }) },
};
