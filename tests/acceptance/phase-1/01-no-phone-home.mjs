#!/usr/bin/env node
// Acceptance 1: clean profile, idle (default 15 min, CORVID_IDLE_SECONDS), every connection must be in
// docs/network-allowlist.md. Evidence: NetLog (hostnames) + strace connect()s (raw addresses).
// REQUIRES a built Corvid binary (CORVID_BIN) and `strace`. UNVERIFIED.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostsFromNetLog, hostsFromStrace, loadAllowlist, parseNetLog, violations } from './lib/allowlist.mjs';
import { skip } from './lib/cdp.mjs';

const bin = process.env.CORVID_BIN;
if (!bin) skip('CORVID_BIN not set (needs a built Corvid binary)');
if (spawnSync('which', ['strace']).status !== 0) skip('strace not installed');

const idle = Number(process.env.CORVID_IDLE_SECONDS ?? 900);
const docs = fileURLToPath(new URL('../../../docs/network-allowlist.md', import.meta.url));
const allow = loadAllowlist(docs);
const work = mkdtempSync(join(tmpdir(), 'corvid-idle-'));
const netlog = join(work, 'netlog.json');
const straceOut = join(work, 'strace.txt');

console.log(`idle capture for ${idle}s, workdir ${work}`);
const child = spawn('strace', ['-f', '-e', 'trace=network', '-o', straceOut, bin,
  `--user-data-dir=${join(work, 'profile')}`, `--log-net-log=${netlog}`, '--net-log-capture-mode=Everything',
  '--no-first-run', '--headless=new', 'about:blank'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, idle * 1000));
// strace -f does not exit on SIGTERM while the traced browser lives: stop the browser (matched by its unique profile dir).
spawnSync('pkill', ['-TERM', '-f', join(work, 'profile')]);
await new Promise((r) => child.once('exit', r));
await new Promise((r) => setTimeout(r, 1000));

const hosts = [];
if (existsSync(netlog)) {
  try { hosts.push(...hostsFromNetLog(parseNetLog(readFileSync(netlog, 'utf8')))); } catch (e) { console.log(`warn: netlog not parseable: ${e.message}`); }
} else console.log('warn: no netlog written');
if (existsSync(straceOut)) hosts.push(...hostsFromStrace(readFileSync(straceOut, 'utf8')));

const bad = violations(hosts, allow);
writeFileSync(join(work, 'violations.txt'), bad.join('\n'));
if (bad.length) {
  console.log(`FAIL no-phone-home: ${bad.length} host(s) not in the allow-list:\n  ${bad.join('\n  ')}\nEvidence in ${work}`);
  process.exit(1);
}
console.log(`PASS no-phone-home: ${hosts.length} observed endpoint(s), all loopback/allow-listed. Evidence in ${work}`);
