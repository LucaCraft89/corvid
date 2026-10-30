// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Made-up failures for the dev server and render checks (?sample=NAME).
// Uses reserved example names and documentation addresses only.

import type { ErrorInfo } from '../../shared/errors.js';

const time = '2026-10-30T14:02:11Z';

export const SAMPLES: Record<string, ErrorInfo> = {
  dns: {
    code: 'ERR_NAME_NOT_RESOLVED',
    url: 'https://exmaple.org/docs/start',
    time,
    dns: { resolver: '192.0.2.53 (system)', query: 'exmaple.org A, AAAA', rcode: 'NXDOMAIN', answers: [] },
    timings: { dns: 38, total: 40 },
    retries: [{ time: '14:01:58', result: 'ERR_NAME_NOT_RESOLVED' }],
  },
  offline: {
    code: 'ERR_INTERNET_DISCONNECTED',
    url: 'https://example.org/',
    time,
  },
  connection: {
    code: 'ERR_CONNECTION_REFUSED',
    url: 'http://example.net:8080/',
    time,
    dns: { resolver: '192.0.2.53 (system)', query: 'example.net A', rcode: 'NOERROR', answers: ['203.0.113.10'] },
    timings: { dns: 12, connect: 3, total: 16 },
  },
  timeout: {
    code: 'ERR_CONNECTION_TIMED_OUT',
    url: 'https://slow.example.com/report',
    time,
    dns: { resolver: '192.0.2.53 (system)', query: 'slow.example.com A', rcode: 'NOERROR', answers: ['198.51.100.7'] },
    timings: { dns: 21, connect: 30000, total: 30021 },
    retries: [
      { time: '14:01:10', result: 'ERR_CONNECTION_TIMED_OUT' },
      { time: '14:01:41', result: 'ERR_CONNECTION_TIMED_OUT' },
    ],
  },
  ssl: {
    code: 'ERR_CERT_DATE_INVALID',
    url: 'https://expired.example.com/login',
    time,
    overridable: true,
    certChain: [
      { subject: 'CN=expired.example.com', issuer: 'CN=Example Issuing CA R3, O=Example Trust', validFrom: '2025-04-01', validTo: '2025-06-30', sha256: '3F:A1:9C:0B:5E:7D:22:41:8A:6F:C3:90:1D:E4:57:B8:0C:66:2A:F1:93:4E:D7:08:B2:5C:71:9E:AD:30:C4:E6' },
      { subject: 'CN=Example Issuing CA R3, O=Example Trust', issuer: 'CN=Example Root X1, O=Example Trust', validFrom: '2024-03-13', validTo: '2027-03-12' },
    ],
    timings: { dns: 9, connect: 14, tls: 41, total: 66 },
  },
  'ssl-hsts': {
    code: 'ERR_CERT_AUTHORITY_INVALID',
    url: 'https://bank.example.com/',
    time,
    overridable: false,
    certChain: [{ subject: 'CN=bank.example.com', issuer: 'CN=Unknown Local CA', validFrom: '2026-10-01', validTo: '2027-10-01' }],
  },
  blocked: {
    code: 'ERR_BLOCKED_BY_CLIENT',
    url: 'https://ads.example.com/banner.js',
    time,
  },
  generic: {
    code: 'ERR_FAILED',
    url: 'https://example.com/',
    time,
  },
};
