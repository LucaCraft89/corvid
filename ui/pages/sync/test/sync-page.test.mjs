// DOM test for corvid://sync using jsdom and a fake proxy (no browser needed).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

execFileSync('npx', ['esbuild', 'test/entry.ts', '--bundle', '--format=iife', '--outfile=dist/test-bundle.js', '--loader:.json=json'], {stdio: 'pipe'});
const bundle = readFileSync('dist/test-bundle.js', 'utf8');

function boot() {
  const dom = new JSDOM('<!doctype html><body></body>', {runScripts: 'outside-only', pretendToBeVisual: true});
  dom.window.eval(bundle);
  return dom;
}
const tick = (w) => new Promise((r) => w.setTimeout(r, 30));

function fakeProxy(over = {}) {
  const calls = [];
  const state = {signedIn: false, pendingApproval: false, serverUrl: '', username: '', lastSyncMs: 0, queued: 0,
    enabled: {bookmarks: true, passwords: false}, integrityErrors: 0, unavailableModules: []};
  const p = {calls, state, devices: [],
    getState: async () => ({...state}),
    listDevices: async () => p.devices,
    createAccount: async (a) => { calls.push(['create', a]); state.signedIn = true; return {recoveryKey: 'ABCD-EFGH-IJKL'}; },
    signIn: async (a) => { calls.push(['signin', a]); state.signedIn = true; },
    recover: async (a) => { calls.push(['recover', a]); },
    setCollectionEnabled: async (c, on) => { calls.push(['toggle', c, on]); state.enabled[c] = on; },
    approveDevice: async (id, fp) => { calls.push(['approve', id, fp]); },
    revokeDevice: async (id, pw) => { calls.push(['revoke', id, pw]); },
    changePassphrase: async (o, n) => { calls.push(['change', o, n]); },
    rotateRecoveryKey: async () => ({recoveryKey: 'NEW1-NEW2'}),
    syncNow: async () => { calls.push(['sync']); }, signOut: async () => { state.signedIn = false; }, deleteAccount: async () => {},
    ...over};
  return p;
}

async function mount(dom, proxy) {
  const el = dom.window.document.createElement('corvid-sync-page');
  el.proxy = proxy;
  dom.window.document.body.appendChild(el);
  await tick(dom.window);
  return el;
}
const q = (el, sel) => el.shadowRoot.querySelector(sel);

test('signed out: all inputs are labelled, account creation shows the recovery key once and gates continue', async () => {
  const dom = boot(); const proxy = fakeProxy(); const el = await mount(dom, proxy);
  for (const input of el.shadowRoot.querySelectorAll('input')) {
    assert.ok(q(el, `label[for="${input.id}"]`), `input #${input.id} has no label`);
  }
  q(el, '#tab-create').click(); await tick(dom.window);
  for (const [id, v] of [['server', 'https://sync.example'], ['user', 'alice'], ['pass', 'pw'], ['token', 't'], ['dev', 'laptop']]) q(el, '#' + id).value = v;
  q(el, '#submit').click(); await tick(dom.window);
  assert.deepEqual(JSON.parse(JSON.stringify(proxy.calls[0])), ['create', {serverUrl: 'https://sync.example', username: 'alice', deviceName: 'laptop', passphrase: 'pw', token: 't'}]);
  assert.equal(q(el, '#recovery-key').textContent, 'ABCD-EFGH-IJKL');
  assert.ok(q(el, '#rk-done').disabled, 'continue must be disabled until the user confirms');
  q(el, '#rk-confirm').click(); await tick(dom.window);
  assert.ok(!q(el, '#rk-done').disabled);
  q(el, '#rk-done').click(); await tick(dom.window);
  assert.equal(q(el, '#recovery-dialog'), null, 'recovery key must disappear after continue');
});

test('signed in: toggles, devices, approve with fingerprint, revoke needs passphrase, unavailable modules, integrity alert', async () => {
  const dom = boot(); const proxy = fakeProxy();
  Object.assign(proxy.state, {signedIn: true, serverUrl: 'https://s', username: 'bob', queued: 3, integrityErrors: 2, unavailableModules: ['linux-gtk-theme']});
  proxy.devices = [
    {id: 'a', name: 'Linux box', state: 'approved', fingerprint: 'AAAA-1111', self: true, lastSeen: 0},
    {id: 'b', name: 'Old phone', state: 'approved', fingerprint: 'BBBB-2222', self: false, lastSeen: 0},
    {id: 'c', name: 'New laptop', state: 'pending', fingerprint: 'CCCC-3333', self: false, lastSeen: 0},
  ];
  const el = await mount(dom, proxy);
  assert.match(q(el, '#integrity').textContent, /2 items failed/);
  assert.ok(q(el, '#unavailable-modules').textContent.includes('linux-gtk-theme'));
  assert.ok(q(el, '#pending-section').textContent.includes('CCCC-3333'), 'fingerprint must be shown for approval');
  const hist = q(el, 'input[data-col="history"]');
  assert.ok(hist.disabled && !hist.checked, 'history is not available yet');
  q(el, 'input[data-col="passwords"]').click(); await tick(dom.window);
  assert.deepEqual(proxy.calls.at(-1), ['toggle', 'passwords', true]);
  q(el, '.approve').click(); await tick(dom.window);
  assert.deepEqual(proxy.calls.at(-1), ['approve', 'c', 'CCCC-3333']);
  q(el, '#rev-pass').value = 'secret';
  q(el, '.revoke').click(); await tick(dom.window);
  assert.deepEqual(proxy.calls.at(-1), ['revoke', 'b', 'secret']);
  assert.equal(el.shadowRoot.querySelectorAll('.revoke').length, 1, 'cannot revoke self from the list');
});

test('errors are shown as an alert with catalog text, not raw codes', async () => {
  const dom = boot();
  const SyncError = dom.window.__SyncError;
  for (const [code, text] of [['wrong_passphrase', 'Wrong passphrase'], ['rate_limited', 'Too many attempts'], ['rollback', 'went backwards']]) {
    const proxy = fakeProxy({signIn: async () => { throw new SyncError(code); }});
    const el = await mount(dom, proxy);
    q(el, '#submit').click(); await tick(dom.window);
    const alert = q(el, '[role=alert]').textContent;
    assert.ok(alert.includes(text), `${code}: ${alert}`);
    assert.ok(!alert.includes(code), 'raw error code leaked into the UI');
    el.remove();
  }
});
