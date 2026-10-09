// Pure page logic (tested): error classification, history grouping, byte formatting, NTP override resolution.

// ---------- error pages ----------

export type ErrorKind = 'offline' | 'dns' | 'connection' | 'timeout' | 'ssl' | 'blocked' | 'redirect' | 'proxy' | 'http' | 'generic';

export interface ErrorClassification {
  kind: ErrorKind;
  /** i18n key: plain-language summary shown first. */
  summaryKey: string;
  /** i18n keys: suggestions. */
  hintKeys: string[];
  /** Page variant to render. */
  page: 'offline' | 'ssl' | 'error';
}

const TABLE: Array<[RegExp, ErrorKind]> = [
  [/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/, 'offline'],
  [/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED|ERR_DNS_/, 'dns'],
  [/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT/, 'timeout'],
  [/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_CONNECTION_FAILED|ERR_ADDRESS_UNREACHABLE|ERR_EMPTY_RESPONSE/, 'connection'],
  [/ERR_CERT_|ERR_SSL_|ERR_BAD_SSL_|ERR_SSL/, 'ssl'],
  [/ERR_BLOCKED_BY_CLIENT|ERR_BLOCKED_BY_RESPONSE|ERR_BLOCKED_BY_ADMINISTRATOR/, 'blocked'],
  [/ERR_TOO_MANY_REDIRECTS/, 'redirect'],
  [/ERR_PROXY_|ERR_TUNNEL_CONNECTION_FAILED/, 'proxy'],
  [/ERR_HTTP_RESPONSE_CODE_FAILURE/, 'http'],
];

const HINTS: Record<ErrorKind, string[]> = {
  offline: ['error.hint.checkConnection', 'error.hint.retry'],
  dns: ['error.hint.checkAddress', 'error.hint.checkConnection', 'error.hint.checkDns'],
  connection: ['error.hint.serverDown', 'error.hint.retry', 'error.hint.checkFirewall'],
  timeout: ['error.hint.retry', 'error.hint.checkConnection'],
  ssl: ['error.hint.dontProceed', 'error.hint.checkClock'],
  blocked: ['error.hint.blockedExtension'],
  redirect: ['error.hint.clearCookies'],
  proxy: ['error.hint.checkProxy'],
  http: ['error.hint.retry'],
  generic: ['error.hint.retry'],
};

export function classifyError(errorName: string): ErrorClassification {
  const kind = TABLE.find(([re]) => re.test(errorName))?.[1] ?? 'generic';
  return { kind, summaryKey: `error.summary.${kind}`, hintKeys: HINTS[kind], page: kind === 'offline' ? 'offline' : kind === 'ssl' ? 'ssl' : 'error' };
}

/** Whether "proceed anyway" may be offered. Never for HSTS or revoked/pinned failures. */
export function canProceedUnsafe(errorName: string, hsts: boolean): boolean {
  if (hsts) return false;
  if (/ERR_CERT_REVOKED|ERR_CERT_PINNED|ERR_CERT_KNOWN_INTERCEPTION|ERR_SSL_PINNED/.test(errorName)) return false;
  return /ERR_CERT_/.test(errorName);
}

export interface ErrorDetail {
  url: string;
  errorName: string;
  errorCode: number;
  resolver?: string;
  dnsResult?: string[];
  tls?: { protocol?: string; cipher?: string; chain?: Array<{ subject: string; issuer: string; notBefore: string; notAfter: string }>; errors?: string[] };
  timings?: Array<{ phase: string; ms: number }>;
  retryLog?: Array<{ at: string; result: string }>;
  hsts?: boolean;
}

// ---------- history ----------

export interface HistoryVisit { id: string; url: string; title: string; time: number /* epoch ms */ }
export interface HistoryGroup { key: string; label: { key: string; params?: Record<string, string> } | { date: string }; visits: HistoryVisit[] }

const dayStart = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

export function groupHistory(visits: HistoryVisit[], now: number, filter = ''): HistoryGroup[] {
  const q = filter.trim().toLowerCase();
  const sel = visits.filter((v) => !q || v.url.toLowerCase().includes(q) || v.title.toLowerCase().includes(q)).sort((a, b) => b.time - a.time);
  const today = dayStart(now);
  const day = 86_400_000;
  const groups = new Map<number, HistoryVisit[]>();
  for (const v of sel) {
    const k = dayStart(v.time);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(v);
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([k, vs]) => ({
    key: String(k),
    label: k === today ? { key: 'history.today' } : k === today - day ? { key: 'history.yesterday' } : { date: new Date(k).toISOString().slice(0, 10) },
    visits: vs,
  }));
}

// ---------- formatting ----------

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '-';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${i === 0 ? v : v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '-';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}

// ---------- new tab override (ntp-extension-override) ----------

export interface NtpExtension { id: string; name: string; enabledAt: number; overridesNewtab: boolean; incognitoAllowed: boolean }
export type NtpResolution = { kind: 'corvid' } | { kind: 'extension'; id: string };

/**
 * Which page a new tab shows.
 * - `?default` forces Corvid's own page (in-page escape hatch).
 * - picked === 'corvid' => default; picked === <id> => that extension if still enabled and eligible.
 * - otherwise the most recently enabled overriding extension wins.
 * - incognito honors the extension's incognito setting.
 */
export function resolveNewTab(opts: { extensions: NtpExtension[]; picked?: string | null; incognito: boolean; forceDefault: boolean }): NtpResolution {
  if (opts.forceDefault) return { kind: 'corvid' };
  const eligible = opts.extensions.filter((e) => e.overridesNewtab && (!opts.incognito || e.incognitoAllowed));
  if (opts.picked === 'corvid') return { kind: 'corvid' };
  if (opts.picked) {
    const p = eligible.find((e) => e.id === opts.picked);
    if (p) return { kind: 'extension', id: p.id };
  }
  const latest = [...eligible].sort((a, b) => b.enabledAt - a.enabledAt)[0];
  return latest ? { kind: 'extension', id: latest.id } : { kind: 'corvid' };
}
