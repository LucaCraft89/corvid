// Corvid diagnostics event schema. Mirror of diagnostics.mojom (src-overlay/corvid/diagnostics/diagnostics.mojom).
// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// Local only: nothing in this module performs network I/O.

export type Severity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';
export type Source = 'browser' | 'renderer' | 'network' | 'gpu' | 'extension' | 'service_worker' | 'devtools';

export interface StackFrame { fn: string; module?: string; file?: string; line?: number; addr?: string }

export interface HangData { durationMs: number; stack: StackFrame[]; stackCaptured: boolean; recovered: boolean; renderPid: number }
export interface FreezeData { blockedMs: number; stack: StackFrame[]; stackCaptured: boolean; tracePath?: string; renderPid: number }
export interface CrashData { reason: string; exitCode?: number; signal?: string; minidumpPath?: string; symbolizedSummary: string; stack: StackFrame[]; uploaded: false }
export interface NetErrorData {
  url: string; errorCode: number; errorName: string; phase: 'dns' | 'connect' | 'tls' | 'http' | 'redirect' | 'timeout';
  timingsMs: { dns?: number; connect?: number; tls?: number; ttfb?: number; total?: number };
  retries: { attempt: number; atMs: number; errorName: string }[];
  resolver?: { kind: 'system' | 'doh' | 'custom'; server?: string; addresses?: string[] };
  redirectChain?: string[];
}
export interface TlsCert { subject: string; issuer: string; notBefore: number; notAfter: number; sha256: string; sans?: string[] }
export interface TlsData { url: string; errorName: string; chain: TlsCert[]; protocol?: string; cipher?: string; hostname: string }
export interface ConsoleData { level: 'verbose' | 'info' | 'warning' | 'error'; message: string; sourceUrl?: string; line?: number; stack?: StackFrame[] }
export interface MemoryData { pid: number; processType: string; privateKb: number; residentKb: number; cpuPercent: number }
export interface ExtensionErrorData { extensionId: string; name?: string; message: string; context: 'background' | 'content_script' | 'popup' | 'manifest' | 'other'; stack?: StackFrame[] }
export interface ServiceWorkerData { scope: string; status: string; message: string }

export interface KindMap {
  hang: HangData; freeze: FreezeData; crash: CrashData; net_error: NetErrorData; tls: TlsData;
  console: ConsoleData; memory: MemoryData; extension_error: ExtensionErrorData; service_worker: ServiceWorkerData;
}
export type Kind = keyof KindMap;
export const ALL_KINDS: Kind[] = ['hang', 'freeze', 'crash', 'net_error', 'tls', 'console', 'memory', 'extension_error', 'service_worker'];

export type DiagEvent<K extends Kind = Kind> = {
  [P in K]: { id: number; ts: number; tabId?: number; frameId?: number; source: Source; severity: Severity; kind: P; data: KindMap[P] };
}[K];

export type NewEvent<K extends Kind = Kind> = Omit<DiagEvent<K>, 'id'>;

export interface EventFilter {
  kinds?: Kind[]; minSeverity?: Severity; tabId?: number; sinceTs?: number; untilTs?: number; text?: string; limit?: number;
}

export const SEVERITY_ORDER: Severity[] = ['debug', 'info', 'warning', 'error', 'fatal'];

/** Retention knobs. Defaults are placeholders pending user decision (see docs/notes/phase-2-questions.md). */
export interface RetentionConfig { maxBytes: number; maxEvents: number; maxAgeMs: number }
export const DEFAULT_RETENTION: RetentionConfig = { maxBytes: 32 * 1024 * 1024, maxEvents: 50_000, maxAgeMs: 7 * 24 * 3600 * 1000 };
