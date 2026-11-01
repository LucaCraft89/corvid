// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Model of corvid://sync: what the browser sends (corvid_sync::Service::View).
// Everything from the browser is checked here, like the other page data.

export type SyncMode = 'off' | 'waiting' | 'on' | 'revoked' | 'unavailable';

export interface SyncDevice {
  id: string;
  name: string;
  self: boolean;
  /** Seconds since the Unix epoch; 0 when never. */
  lastSeen: number;
  inRoster: boolean;
}

export interface SyncPairing {
  id: string;
  name: string;
  code: string;
}

export interface SyncView {
  mode: SyncMode;
  server: string;
  deviceName: string;
  joinCode: string;
  pairings: SyncPairing[];
  devices: SyncDevice[];
  busy: boolean;
  loadError: string;
  /** Milliseconds since the Unix epoch; 0 when never. */
  lastSuccess: number;
  lastError: string;
  generation: number;
}

/** One-time answers that come with a view. */
export interface SyncEvent {
  view: SyncView;
  recoveryKey: string;
  inviteCode: string;
  error: string;
  integrity: boolean;
}

const MODES: SyncMode[] = ['off', 'waiting', 'on', 'revoked', 'unavailable'];

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
}

export function sanitizeView(raw: unknown): SyncView {
  const r = rec(raw);
  const status = rec(r.status);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(rec) : []);
  return {
    mode: MODES.includes(r.mode as SyncMode) ? (r.mode as SyncMode) : 'off',
    server: str(r.server),
    deviceName: str(r.deviceName),
    joinCode: /^\d{6}$/.test(str(r.joinCode)) ? str(r.joinCode) : '',
    pairings: list(r.pairings)
      .map((p) => ({ id: str(p.id), name: str(p.name), code: str(p.code) }))
      .filter((p) => p.id && /^\d{6}$/.test(p.code)),
    devices: list(r.devices)
      .map((d) => ({ id: str(d.id), name: str(d.name), self: d.self === true, lastSeen: num(d.lastSeen), inRoster: d.inRoster === true }))
      .filter((d) => d.id),
    busy: r.busy === true,
    loadError: str(r.loadError),
    lastSuccess: num(status.last_success),
    lastError: str(status.last_error),
    generation: num(status.generation),
  };
}

export function sanitizeEvent(raw: unknown): SyncEvent {
  const r = rec(raw);
  return {
    view: sanitizeView(r.view),
    recoveryKey: str(r.recoveryKey),
    inviteCode: str(r.inviteCode),
    error: str(r.error),
    integrity: r.integrity === true,
  };
}

/** Errors that mean the data on the server cannot be trusted. */
export function isIntegrityStatus(lastError: string): boolean {
  return ['rollback', 'fork', 'integrity'].includes(lastError);
}

/** Why a device name is unusable; empty when fine. */
export function deviceNameProblem(name: string): 'empty' | 'long' | '' {
  const n = name.trim();
  if (!n) return 'empty';
  return n.length > 64 ? 'long' : '';
}

/** Same rule as NormalizeServerUrl in components/corvid_sync. */
export function serverUrlProblem(url: string): 'empty' | 'invalid' | 'insecure' | '' {
  const u = url.trim();
  if (!u) return 'empty';
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return 'invalid';
  }
  if (parsed.protocol === 'https:') return '';
  if (parsed.protocol !== 'http:') return 'invalid';
  const host = parsed.hostname;
  return host === 'localhost' || host === '[::1]' || host.startsWith('127.') ? '' : 'insecure';
}
