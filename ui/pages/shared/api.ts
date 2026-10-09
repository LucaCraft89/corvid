// Page data API. Production: Mojo PageHandler (src-overlay/corvid/webui/corvid_page_handler.mojom, UNVERIFIED).
import type { ErrorDetail, HistoryVisit, NtpExtension } from './logic.ts';

export interface DownloadItem {
  id: string; fileName: string; url: string; state: 'in-progress' | 'paused' | 'complete' | 'cancelled' | 'interrupted';
  receivedBytes: number; totalBytes: number; bytesPerSec: number; startedAt: number; dangerous: boolean; error?: string;
}
export interface ExtensionInfo {
  id: string; name: string; version: string; description: string; enabled: boolean; manifestVersion: 2 | 3;
  permissions: string[]; hostPermissions: string[]; preinstalled: boolean; iconUrl: string; overridesNewtab: boolean;
  allowedInIncognito: boolean; warnings: string[];
}
export interface BookmarkNode { id: string; title: string; url?: string; children?: BookmarkNode[] }
export interface AboutInfo { name: string; version: string; chromiumVersion: string; os: string; revision: string; profilePath: string; licenses: Array<{ name: string; license: string }> }
export interface TopSite { title: string; url: string }

export interface PageApi {
  history: { query(text: string, limit: number): Promise<HistoryVisit[]>; remove(id: string): Promise<void>; clearAll(): Promise<void> };
  downloads: {
    list(): Promise<DownloadItem[]>; pause(id: string): Promise<void>; resume(id: string): Promise<void>; cancel(id: string): Promise<void>;
    open(id: string): Promise<void>; showInFolder(id: string): Promise<void>; remove(id: string): Promise<void>; clearFinished(): Promise<void>;
    onChanged(cb: () => void): () => void;
  };
  bookmarks: { tree(): Promise<BookmarkNode[]>; remove(id: string): Promise<void>; rename(id: string, title: string): Promise<void> };
  extensions: {
    list(): Promise<ExtensionInfo[]>; setEnabled(id: string, on: boolean): Promise<void>; remove(id: string): Promise<void>;
    setIncognito(id: string, on: boolean): Promise<void>; loadUnpacked(): Promise<void>;
    ntp(): Promise<{ candidates: NtpExtension[]; picked: string | null }>; setNtpPick(id: string | null): Promise<void>;
    storeSources(): Promise<Array<{ id: string; name: string; updateUrl: string; enabled: boolean }>>;
    onChanged(cb: () => void): () => void;
  };
  newtab: { topSites(): Promise<TopSite[]>; forceDefault(): boolean };
  about: { info(): Promise<AboutInfo> };
  error: { detail(): Promise<ErrorDetail>; retry(): Promise<void>; proceedUnsafe(): Promise<void>; goBack(): Promise<void>; copyReport(text: string): Promise<void> };
  crash: { info(): Promise<{ url: string; reason: string; reportPath?: string }>; reload(): Promise<void> };
  freeze: { info(): Promise<{ url: string; hungForMs: number; stackAvailable: boolean }>; wait(): Promise<void>; kill(): Promise<void> };
  settings: { navigateTo(section: string): void; resetLayout(): Promise<void>; openThemeEditor(): void };
  gpu: { info(): Promise<GpuInfo> };
}

/** Hardware acceleration status (the Corvid equivalent of the stock GPU diagnostics page). */
export interface GpuInfo {
  features: Array<{ name: string; status: 'enabled' | 'disabled' | 'software' | 'unavailable'; detail?: string }>;
  videoDecode: Array<{ codec: string; profile: string; hardware: boolean }>;
  videoEncode: Array<{ codec: string; profile: string; hardware: boolean }>;
  glRenderer: string; angleBackend: string; ozonePlatform: string; vaapiDriver?: string;
  problems: string[];
}

let api: PageApi | undefined;
export function setPageApi(a: PageApi): void { api = a; }
export function pageApi(): PageApi {
  if (!api) throw new Error('PageApi not initialised');
  return api;
}
