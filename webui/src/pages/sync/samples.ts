// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Corvid contributors

// Dev server and render check: ?state=off|waiting|on|pairing|revoked|problem.

const devices = [
  { id: 'dev_1', name: 'Laptop', self: true, lastSeen: 1793500000, inRoster: true },
  { id: 'dev_2', name: 'Desktop at home with a rather long name for its row', self: false, lastSeen: 1793400000, inRoster: true },
];
const on = { mode: 'on', server: 'https://sync.example.org', deviceName: 'Laptop', devices, status: { last_success: 1793500000000, generation: 42 } };

export const SAMPLES: Record<string, unknown> = {
  off: { mode: 'off' },
  waiting: { mode: 'waiting', server: 'https://sync.example.org', deviceName: 'Laptop', joinCode: '962747' },
  on,
  pairing: { ...on, pairings: [{ id: 'dev_3', name: 'New phone', code: '962747' }] },
  revoked: { mode: 'revoked', server: 'https://sync.example.org', deviceName: 'Laptop' },
  problem: { ...on, status: { last_error: 'rollback', generation: 42 } },
};
