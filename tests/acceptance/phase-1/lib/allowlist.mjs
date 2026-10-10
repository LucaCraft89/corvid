// Parsing and checking for the idle network capture (acceptance 1).
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

/** Extract entries from a fenced ```<tag> block in a markdown file. */
export function parseAllowlist(markdown, tag = 'allowlist') {
  const m = new RegExp('```' + tag + '\\n([\\s\\S]*?)```').exec(markdown);
  if (!m) throw new Error(`no \`\`\`${tag} block found`);
  return m[1]
    .split('\n')
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((l) => l.toLowerCase());
}

export function loadAllowlist(path, tag) {
  return parseAllowlist(readFileSync(path, 'utf8'), tag);
}

/** Loopback, link-local, unix sockets, and localhost are never counted. */
const localAddresses = new Set(Object.values(networkInterfaces()).flat().filter(Boolean).map((i) => i.address.toLowerCase().replace(/%.*$/, '')));

export function isIgnoredHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  // This machine's own addresses and the RFC 3849 documentation prefix (Chromium's IPv6 reachability probe connects a UDP
  // socket to it to read the routing table; nothing is sent) never leave the machine.
  if (localAddresses.has(h) || /^2001:0?db8:/.test(h)) return true;
  return (
    h === 'localhost' || h.endsWith('.localhost') ||
    /^127\./.test(h) || h === '::1' || h === '0.0.0.0' || h === '::' ||
    /^169\.254\./.test(h) || /^fe80:/i.test(h) || h === '' || h.startsWith('/')
  );
}

export function hostAllowed(host, allowlist) {
  const h = host.toLowerCase();
  return allowlist.some((a) => (a.startsWith('*.') ? h === a.slice(2) || h.endsWith(a.slice(1)) : h === a));
}

/** @returns {string[]} hosts that violate the allow-list (deduplicated, sorted). */
export function violations(hosts, allowlist) {
  const bad = new Set();
  for (const raw of hosts) {
    // strip a trailing :port only from host:port / ipv4:port, never from IPv6 literals (2001:4860:4860::8888)
    const h = (raw.split(':').length === 2 ? raw.replace(/:\d+$/, '') : raw).replace(/\.$/, '');
    if (isIgnoredHost(h)) continue;
    if (!hostAllowed(h, allowlist)) bad.add(h);
  }
  return [...bad].sort();
}

/** Parse a NetLog file. A browser stopped by SIGTERM leaves it without the closing `]}`; events are one per line, so cut
 *  at the last complete event instead of discarding the capture. */
export function parseNetLog(text) {
  try { return JSON.parse(text); } catch { /* truncated */ }
  const cut = text.lastIndexOf('},\n');
  if (cut < 0) throw new Error('netlog has no complete event');
  return JSON.parse(text.slice(0, cut + 1) + ']}');
}

/** Hosts mentioned in a Chromium NetLog JSON (url requests, host resolutions, socket connects). */
export function hostsFromNetLog(netlog) {
  const hosts = new Set();
  const events = Array.isArray(netlog?.events) ? netlog.events : [];
  const add = (v) => {
    if (typeof v !== 'string' || !v) return;
    try { if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) { hosts.add(new URL(v).hostname); return; } } catch { /* fallthrough */ }
    hosts.add(v.replace(/:\d+$/, '').replace(/^\[|\]$/g, ''));
  };
  for (const e of events) {
    const p = e.params;
    if (!p) continue;
    if (p.url) add(p.url);
    if (p.host) add(p.host);
    if (p.address) add(p.address);
    if (p.source_address) continue;
    if (Array.isArray(p.host_resolver_flags)) continue;
  }
  return [...hosts];
}

/** Destination addresses from `strace -f -e trace=network` output (connect/sendto of AF_INET/AF_INET6). */
export function hostsFromStrace(text) {
  const hosts = new Set();
  for (const line of text.split('\n')) {
    if (!/^\s*(\[pid\s+\d+\]\s+|\d+\s+)?(connect|sendto|sendmsg)\(/.test(line)) continue;
    const m = /sin_addr=inet_addr\("([^"]+)"\)/.exec(line) ?? /inet_pton\(AF_INET6, "([^"]+)"/.exec(line);
    if (m) hosts.add(m[1]);
  }
  return [...hosts];
}
