'use strict';
// Minimal admin client. The token lives only in this page's memory. All values are inserted with
// textContent (never as markup), so usernames/device names cannot inject markup.
let token = '';
const $ = (id) => document.getElementById(id);
async function api(method, path, body) {
  const r = await fetch('/admin/api' + path, {
    method, headers: {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}
function cell(tr, text) { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); return td; }
function btn(td, label, fn) {
  const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => run(fn)); td.appendChild(b);
}
async function run(fn) { $('err').textContent = ''; try { await fn(); } catch (e) { $('err').textContent = String(e.message || e); } }
const mib = (n) => (n / 1048576).toFixed(1);

async function refresh() {
  $('health').textContent = JSON.stringify(await api('GET', '/health'), null, 2);
  const inv = (await api('GET', '/invites')).invites;
  const ib = document.querySelector('#invites tbody'); ib.replaceChildren();
  for (const i of inv) {
    const tr = document.createElement('tr'); cell(tr, i.label); cell(tr, String(i.uses_left));
    btn(cell(tr, ''), 'Delete', async () => { await api('DELETE', '/invites/' + i.id); await refresh(); });
    ib.appendChild(tr);
  }
  const users = (await api('GET', '/users')).users;
  const ub = document.querySelector('#users tbody'); ub.replaceChildren();
  for (const u of users) {
    const tr = document.createElement('tr');
    cell(tr, u.username); cell(tr, mib(u.used_bytes) + ' MiB');
    const q = document.createElement('input'); q.type = 'number'; q.value = mib(u.quota_bytes); q.min = '1'; q.setAttribute('aria-label', 'Quota in MiB for ' + u.username);
    cell(tr, '').appendChild(q);
    cell(tr, u.approved_devices + ' approved, ' + u.pending_devices + ' pending');
    const td = cell(tr, '');
    btn(td, 'Set quota', async () => { await api('POST', '/users/' + encodeURIComponent(u.username) + '/quota', {quota_bytes: Math.round(q.value * 1048576)}); await refresh(); });
    btn(td, 'Devices', async () => showDevices(u.username));
    btn(td, 'Delete', async () => { if (confirm('Delete ' + u.username + ' and all their server data?')) { await api('DELETE', '/users/' + encodeURIComponent(u.username)); await refresh(); } });
    ub.appendChild(tr);
  }
}
async function showDevices(user) {
  $('dh').textContent = 'Devices of ' + user;
  const ds = (await api('GET', '/users/' + encodeURIComponent(user) + '/devices')).devices;
  const tb = document.querySelector('#devices tbody'); tb.replaceChildren();
  for (const d of ds) {
    const tr = document.createElement('tr'); cell(tr, d.name); cell(tr, d.state); cell(tr, new Date(d.last_seen * 1000).toLocaleString());
    const td = cell(tr, '');
    if (d.state !== 'revoked') btn(td, 'Revoke (block)', async () => { await api('POST', '/users/' + encodeURIComponent(user) + '/devices/' + d.id + '/revoke'); await showDevices(user); });
    tb.appendChild(tr);
  }
}
$('login').addEventListener('submit', (e) => { e.preventDefault(); token = $('tok').value; run(async () => { await refresh(); $('app').hidden = false; }); });
$('newinv').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    const r = await api('POST', '/invites', {label: $('ilabel').value, uses: Number($('iuses').value)});
    $('newtok').textContent = 'Invite token (shown once): ' + r.token; await refresh();
  });
});
