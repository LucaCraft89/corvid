// Redaction for exports. Pure functions; no I/O.
// Copyright 2026 The Corvid Authors. BSD-3-Clause.
import type { DiagEvent } from './types.ts';

export interface RedactOptions { urls: boolean; paths: boolean; ips: boolean }
export const REDACT_ALL: RedactOptions = { urls: true, paths: true, ips: true };

// URLs: any scheme://... up to whitespace/quote/bracket. Also bare "www." / host/path forms are NOT guessed
// (false-positive risk); hostnames in structured fields are handled by key below.
const URL_RE = /\b[a-z][a-z0-9+.-]{1,15}:\/\/[^\s"'<>)\]}]+/gi;
const DATA_BLOB_RE = /\b(?:data|blob|filesystem):[^\s"'<>)\]}]+/gi;
const POSIX_PATH_RE = /(?<![\w:/])\/(?:home|Users|root|tmp|var|opt|usr|mnt|media|run)\/[^\s"'<>:)\]}]*/g;
const WIN_PATH_RE = /\b[A-Za-z]:\\(?:[^\s"'<>:|?*\\]+\\?)+/g;
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const IPV6_RE = /\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\b/gi;

// Structured fields that always hold hosts/URLs/paths regardless of string shape.
const URL_KEYS = new Set(['url', 'sourceUrl', 'scope', 'hostname', 'redirectChain', 'file']);
const PATH_KEYS = new Set(['minidumpPath', 'tracePath', 'file']);
const IP_KEYS = new Set(['addresses']);

export function redactString(s: string, o: RedactOptions): string {
  let r = s;
  if (o.urls) r = r.replace(URL_RE, '[url]').replace(DATA_BLOB_RE, '[url]');
  if (o.paths) r = r.replace(WIN_PATH_RE, '[path]').replace(POSIX_PATH_RE, '[path]');
  if (o.ips) r = r.replace(IPV4_RE, '[ip]').replace(IPV6_RE, '[ip]');
  return r;
}

function walk(v: unknown, key: string | undefined, o: RedactOptions): unknown {
  if (typeof v === 'string') {
    if (o.urls && key && URL_KEYS.has(key)) return '[url]';
    if (o.paths && key && PATH_KEYS.has(key)) return '[path]';
    if (o.ips && key && IP_KEYS.has(key)) return '[ip]';
    return redactString(v, o);
  }
  if (Array.isArray(v)) return v.map(x => walk(x, key, o));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = walk(x, k, o);
    return out;
  }
  return v;
}

export function redactEvent(e: DiagEvent, o: RedactOptions): DiagEvent {
  return walk(e, undefined, o) as DiagEvent;
}
