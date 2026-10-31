// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Made-up log for the dev server and render checks. Reserved example names only.

import type { DiagEntry } from '../../shared/diagnostics.js';

export const SAMPLE_LOG: DiagEntry[] = [
  { time: '2026-10-30T14:05:40Z', kind: 'crash', code: 'crashed (signal 11)', process: 'GPU' },
  { time: '2026-10-30T14:04:12Z', kind: 'hang', code: 'renderer not responding', process: 'Renderer', host: 'example.org' },
  { time: '2026-10-30T14:02:11Z', kind: 'tls', code: 'ERR_CERT_DATE_INVALID', host: 'expired.example.net' },
  { time: '2026-10-30T14:01:58Z', kind: 'network', code: 'ERR_NAME_NOT_RESOLVED', host: 'exmaple.org' },
  { time: '2026-10-30T13:59:02Z', kind: 'crash', code: 'killed (out of memory)', process: 'Renderer', host: 'example.com' },
  { time: '2026-10-30T13:58:00Z', kind: 'network', code: 'ERR_CONNECTION_RESET' },
];
