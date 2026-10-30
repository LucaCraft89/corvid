// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Error page model: what Chromium tells us about a failed load, turned into
// plain-language text first and technical detail second. No DOM here so it
// can be tested directly.

import { t } from '../strings/i18n.js';
import type { StringKey } from '../strings/en.js';

export type ErrorKind = 'dns' | 'offline' | 'connection' | 'timeout' | 'ssl' | 'blocked' | 'generic';
export type CertReason = 'expired' | 'nameMismatch' | 'untrusted' | 'revoked' | 'weak' | 'other';

export interface CertInfo {
  subject: string;
  issuer: string;
  validFrom?: string;
  validTo?: string;
  sha256?: string;
}

export interface ErrorInfo {
  /** Chromium net error name, e.g. ERR_NAME_NOT_RESOLVED. */
  code: string;
  url: string;
  /** ISO time of the failure. */
  time?: string;
  dns?: { resolver?: string; query?: string; answers?: string[]; rcode?: string };
  /** Leaf first. */
  certChain?: CertInfo[];
  /** False when the site uses HSTS or pinning and must not be bypassed. */
  overridable?: boolean;
  timings?: { dns?: number; connect?: number; tls?: number; firstByte?: number; total?: number };
  retries?: { time: string; result: string }[];
}

const KIND_BY_CODE: Record<string, ErrorKind> = {
  ERR_NAME_NOT_RESOLVED: 'dns',
  ERR_NAME_RESOLUTION_FAILED: 'dns',
  ERR_DNS_MALFORMED_RESPONSE: 'dns',
  ERR_DNS_SERVER_FAILED: 'dns',
  ERR_INTERNET_DISCONNECTED: 'offline',
  ERR_CONNECTION_REFUSED: 'connection',
  ERR_CONNECTION_RESET: 'connection',
  ERR_CONNECTION_CLOSED: 'connection',
  ERR_CONNECTION_FAILED: 'connection',
  ERR_EMPTY_RESPONSE: 'connection',
  ERR_ADDRESS_UNREACHABLE: 'connection',
  ERR_PROXY_CONNECTION_FAILED: 'connection',
  ERR_TUNNEL_CONNECTION_FAILED: 'connection',
  ERR_TIMED_OUT: 'timeout',
  ERR_CONNECTION_TIMED_OUT: 'timeout',
  ERR_DNS_TIMED_OUT: 'timeout',
  ERR_BLOCKED_BY_CLIENT: 'blocked',
  ERR_BLOCKED_BY_ADMINISTRATOR: 'blocked',
  ERR_BLOCKED_BY_RESPONSE: 'blocked',
};

const CERT_REASON_BY_CODE: Record<string, CertReason> = {
  ERR_CERT_DATE_INVALID: 'expired',
  ERR_CERT_VALIDITY_TOO_LONG: 'expired',
  ERR_CERT_COMMON_NAME_INVALID: 'nameMismatch',
  ERR_CERT_AUTHORITY_INVALID: 'untrusted',
  ERR_CERT_SYMANTEC_LEGACY: 'untrusted',
  ERR_CERT_REVOKED: 'revoked',
  ERR_CERT_WEAK_SIGNATURE_ALGORITHM: 'weak',
  ERR_CERT_WEAK_KEY: 'weak',
};

export function kindForCode(code: string): ErrorKind {
  const c = code.toUpperCase();
  if (c.startsWith('ERR_CERT_')) return 'ssl';
  return KIND_BY_CODE[c] ?? 'generic';
}

export function certReason(code: string): CertReason {
  return CERT_REASON_BY_CODE[code.toUpperCase()] ?? 'other';
}

/** Host for the summary; falls back to the raw text for odd URLs. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

const TIPS: Record<ErrorKind, number> = { dns: 3, offline: 3, connection: 2, timeout: 2, ssl: 2, blocked: 1, generic: 2 };
const ICON: Record<ErrorKind, string> = {
  dns: 'globe', offline: 'offline', connection: 'block', timeout: 'clock', ssl: 'lock', blocked: 'block', generic: 'warning',
};

export interface DetailRow {
  label: string;
  value: string;
  mono?: boolean;
}

export interface DetailSection {
  title: string;
  rows: DetailRow[];
}

export interface ErrorView {
  kind: ErrorKind;
  icon: string;
  host: string;
  title: string;
  summary: string;
  tips: string[];
  /** SSL only: why the certificate was rejected. */
  reason?: string;
  /** SSL only: whether to offer "continue anyway". */
  canProceed: boolean;
  /** Offline only: reload when the network returns. */
  autoRetry: boolean;
  details: DetailSection[];
}

function k(s: string): StringKey {
  return s as StringKey;
}

export function buildErrorView(info: ErrorInfo): ErrorView {
  const kind = kindForCode(info.code);
  const host = hostOf(info.url);
  const tips = Array.from({ length: TIPS[kind] }, (_, i) => t(k(`error.${kind}.tip${i + 1}`)));
  const reason = kind === 'ssl' ? t(k(`error.ssl.reason.${certReason(info.code)}`)) : undefined;

  const ms = (n: number | undefined) => (n === undefined ? undefined : t('error.detail.ms', { ms: Math.round(n) }));
  const rows = (pairs: [string, string | undefined, boolean?][]): DetailRow[] =>
    pairs.filter((p): p is [string, string, boolean?] => p[1] !== undefined && p[1] !== '')
      .map(([label, value, mono]) => ({ label, value, ...(mono ? { mono } : {}) }));

  const details: DetailSection[] = [
    {
      title: t('error.details'),
      rows: rows([
        [t('error.detail.code'), info.code, true],
        [t('error.detail.address'), info.url, true],
        [t('error.detail.time'), info.time],
      ]),
    },
  ];
  if (info.dns) {
    details.push({
      title: t('error.detail.dns'),
      rows: rows([
        [t('error.detail.resolver'), info.dns.resolver, true],
        [t('error.detail.query'), info.dns.query, true],
        [t('error.detail.rcode'), info.dns.rcode, true],
        [t('error.detail.answers'), info.dns.answers?.length ? info.dns.answers.join('\n') : t('error.detail.noAnswers'), true],
      ]),
    });
  }
  if (kind === 'ssl' || info.certChain?.length) {
    const chain = info.certChain ?? [];
    details.push({
      title: t('error.detail.certificate'),
      rows: rows([[t('error.detail.certReason'), reason]]),
    });
    chain.forEach((c, i) => {
      details.push({
        title: `${t('error.detail.certChain')} ${i + 1}/${chain.length}`,
        rows: rows([
          [t('error.detail.subject'), c.subject, true],
          [t('error.detail.issuer'), c.issuer, true],
          [t('error.detail.validFrom'), c.validFrom],
          [t('error.detail.validTo'), c.validTo],
          [t('error.detail.fingerprint'), c.sha256, true],
        ]),
      });
    });
  }
  if (info.timings) {
    const tm = info.timings;
    details.push({
      title: t('error.detail.timings'),
      rows: rows([
        [t('error.detail.timing.dns'), ms(tm.dns)],
        [t('error.detail.timing.connect'), ms(tm.connect)],
        [t('error.detail.timing.tls'), ms(tm.tls)],
        [t('error.detail.timing.firstByte'), ms(tm.firstByte)],
        [t('error.detail.timing.total'), ms(tm.total)],
      ]),
    });
  }
  details.push({
    title: t('error.detail.retries'),
    rows: info.retries?.length
      ? info.retries.map((r) => ({ label: r.time, value: r.result, mono: true }))
      : [{ label: t('error.detail.retries'), value: t('error.detail.none') }],
  });

  return {
    kind,
    icon: ICON[kind],
    host,
    title: t(k(`error.${kind}.title`)),
    summary: t(k(`error.${kind}.summary`), { host }),
    tips,
    ...(reason ? { reason } : {}),
    canProceed: kind === 'ssl' && info.overridable !== false,
    autoRetry: kind === 'offline',
    details: details.filter((s) => s.rows.length > 0),
  };
}

/** Plain-text version of the details for "Copy details". */
export function detailsText(view: ErrorView): string {
  return view.details
    .map((s) => [`## ${s.title}`, ...s.rows.map((r) => `${r.label}: ${r.value.replace(/\n/g, ', ')}`)].join('\n'))
    .join('\n\n');
}

/**
 * Reads the error from the page URL: ?code=ERR_...&url=...&info=<JSON of ErrorInfo>.
 * Phase 5 passes the same JSON from the browser. Bad input gives a generic error.
 */
export function errorInfoFromQuery(search: string): ErrorInfo {
  const q = new URLSearchParams(search);
  let extra: Partial<ErrorInfo> = {};
  try {
    const parsed: unknown = JSON.parse(q.get('info') ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) extra = parsed as Partial<ErrorInfo>;
  } catch {
    /* ignore */
  }
  const code = q.get('code') ?? (typeof extra.code === 'string' ? extra.code : 'ERR_FAILED');
  const url = q.get('url') ?? (typeof extra.url === 'string' ? extra.url : '');
  return { ...sanitizeInfo(extra), code: /^ERR_[A-Z0-9_]+$/i.test(code) ? code.toUpperCase() : 'ERR_FAILED', url };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Keeps only well-typed fields, so strange input can't break rendering. */
function sanitizeInfo(x: Partial<ErrorInfo>): Omit<ErrorInfo, 'code' | 'url'> {
  const out: Omit<ErrorInfo, 'code' | 'url'> = {};
  const time = str(x.time);
  if (time) out.time = time;
  if (x.dns && typeof x.dns === 'object') {
    out.dns = {};
    const r = str(x.dns.resolver), q = str(x.dns.query), c = str(x.dns.rcode);
    if (r) out.dns.resolver = r;
    if (q) out.dns.query = q;
    if (c) out.dns.rcode = c;
    if (Array.isArray(x.dns.answers)) out.dns.answers = x.dns.answers.filter((a): a is string => typeof a === 'string');
  }
  if (Array.isArray(x.certChain)) {
    out.certChain = x.certChain
      .filter((c) => c && typeof c === 'object' && typeof c.subject === 'string' && typeof c.issuer === 'string')
      .map((c) => {
        const ci: CertInfo = { subject: c.subject, issuer: c.issuer };
        const f = str(c.validFrom), to = str(c.validTo), s = str(c.sha256);
        if (f) ci.validFrom = f;
        if (to) ci.validTo = to;
        if (s) ci.sha256 = s;
        return ci;
      });
  }
  if (typeof x.overridable === 'boolean') out.overridable = x.overridable;
  if (x.timings && typeof x.timings === 'object') {
    out.timings = {};
    for (const key of ['dns', 'connect', 'tls', 'firstByte', 'total'] as const) {
      const v = num(x.timings[key]);
      if (v !== undefined) out.timings[key] = v;
    }
  }
  if (Array.isArray(x.retries)) {
    out.retries = x.retries
      .filter((r) => r && typeof r.time === 'string' && typeof r.result === 'string')
      .map((r) => ({ time: r.time, result: r.result }));
  }
  return out;
}
