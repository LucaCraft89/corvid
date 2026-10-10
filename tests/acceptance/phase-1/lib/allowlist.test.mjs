import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hostAllowed, hostsFromNetLog, hostsFromStrace, isIgnoredHost, loadAllowlist, parseAllowlist, violations } from './allowlist.mjs';

const doc = '# x\n```allowlist\n# comment\nupdates.example.org  # reason\n*.cdn.example.net\n\n```\n```binary-allowlist\nfoo.test\n```\n';

test('parseAllowlist reads fenced blocks and strips comments', () => {
  assert.deepEqual(parseAllowlist(doc), ['updates.example.org', '*.cdn.example.net']);
  assert.deepEqual(parseAllowlist(doc, 'binary-allowlist'), ['foo.test']);
  assert.throws(() => parseAllowlist('nothing', 'allowlist'));
});

test('real docs/network-allowlist.md: runtime allow-list empty, binary allow-list is exactly the documented intentional set', () => {
  const p = fileURLToPath(new URL('../../../../docs/network-allowlist.md', import.meta.url));
  assert.deepEqual(loadAllowlist(p), []);
  // Changing this set needs a reason in docs/network-allowlist.md and an edit here.
  assert.deepEqual(loadAllowlist(p, 'binary-allowlist'), [
    'www.google.com', 'google.com', 'chromewebstore.google.com', 'chrome.google.com', 'clients2.google.com', 'clients2.googleusercontent.com',
  ]);
  assert.match(readFileSync(p, 'utf8'), /initially empty/);
});

test('host matching: exact, wildcard suffix, case-insensitive', () => {
  const al = ['updates.example.org', '*.cdn.example.net'];
  assert.ok(hostAllowed('UPDATES.example.org', al));
  assert.ok(hostAllowed('a.cdn.example.net', al));
  assert.ok(hostAllowed('cdn.example.net', al));
  assert.ok(!hostAllowed('evilcdn.example.net', al));
  assert.ok(!hostAllowed('example.org', al));
});

test('ignored hosts', () => {
  for (const h of ['localhost', '127.0.0.1', '::1', '[::1]', '169.254.1.1', 'fe80::1', 'foo.localhost']) assert.ok(isIgnoredHost(h), h);
  for (const h of ['8.8.8.8', 'example.com', '192.168.1.1']) assert.ok(!isIgnoredHost(h), h);
});

test('violations with empty allowlist flag every external host', () => {
  assert.deepEqual(violations(['127.0.0.1:9222', 'clients2.google.com', 'clients2.google.com.', '8.8.8.8:443'], []), ['8.8.8.8', 'clients2.google.com']);
  assert.deepEqual(violations(['a.cdn.example.net'], ['*.cdn.example.net']), []);
});

test('hostsFromNetLog extracts urls, hosts and addresses', () => {
  const nl = { events: [
    { params: { url: 'https://safebrowsing.googleapis.com/v4/x' } },
    { params: { host: 'example.org:443' } },
    { params: { address: '[2001:db8::1]:443' } },
    { params: { address: '10.0.0.5:80' } },
    { params: { unrelated: 1 } }, {},
  ] };
  assert.deepEqual(hostsFromNetLog(nl).sort(), ['10.0.0.5', '2001:db8::1', 'example.org', 'safebrowsing.googleapis.com']);
  assert.deepEqual(hostsFromNetLog({}), []);
});

test('hostsFromStrace', () => {
  const t = [
    'connect(37, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("142.250.80.46")}, 16) = 0',
    'connect(38, {sa_family=AF_INET6, sin6_port=htons(443), sin6_flowinfo=htonl(0), inet_pton(AF_INET6, "2607:f8b0::200e", &sin6_addr), sin6_scope_id=0}, 28) = 0',
    'connect(39, {sa_family=AF_UNIX, sun_path="/run/x"}, 110) = 0',
    'sendto(40, "..", 20, 0, {sa_family=AF_INET, sin_port=htons(53), sin_addr=inet_addr("127.0.0.53")}, 16) = 20',
  ].join('\n');
  assert.deepEqual(hostsFromStrace(t), ['142.250.80.46', '2607:f8b0::200e', '127.0.0.53']);
});
