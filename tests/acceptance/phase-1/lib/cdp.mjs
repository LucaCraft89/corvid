// Minimal Chrome DevTools Protocol driver (Node 22 global WebSocket/fetch). UNVERIFIED against a real Corvid build.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SKIP = 77;

/** Exit with SKIP (77) and a clear reason. A skip is NOT a pass. */
export function skip(reason) {
  console.log(`SKIP: ${reason}`);
  process.exit(SKIP);
}

export function requireBrowser() {
  const bin = process.env.CORVID_BIN;
  if (!bin) skip('CORVID_BIN not set (needs a built Corvid binary)');
  return bin;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ bin = requireBrowser(), profile, extraArgs = [], env = {} } = {}) {
  const userDataDir = profile ?? mkdtempSync(join(tmpdir(), 'corvid-profile-'));
  const port = 9222 + Math.floor(Math.random() * 500);
  const args = [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`, '--no-first-run', '--corvid-test-hooks', ...(process.env.CORVID_HEADLESS === '0' ? [] : ['--headless=new']), ...extraArgs, 'about:blank'];
  const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...env } });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  let ver;
  for (let i = 0; i < 100 && !ver; i++) {
    await sleep(100);
    try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { /* not up yet */ }
  }
  if (!ver) { child.kill(); throw new Error(`browser did not start: ${stderr.slice(-400)}`); }
  return {
    port, child, userDataDir, version: ver.Browser,
    async close({ keepProfile = false } = {}) {
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
      if (!keepProfile && !profile) rmSync(userDataDir, { recursive: true, force: true });
    },
    async targets() { return (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); },
    async open(url) {
      const t = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
      return connect(t.webSocketDebuggerUrl, t);
    },
    async attach(urlPrefix) {
      const t = (await this.targets()).find((x) => x.url.startsWith(urlPrefix));
      return t ? connect(t.webSocketDebuggerUrl, t) : undefined;
    },
  };
}

export async function connect(wsUrl, target = {}) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  return {
    target, send,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed');
      return r.result.value;
    },
    async navigate(url, waitMs = 300) { await send('Page.enable'); await send('Page.navigate', { url }); await sleep(waitMs); },
    async waitFor(expr, timeoutMs = 5000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) { try { if (await this.eval(expr)) return true; } catch { /* retry */ } await sleep(50); }
      return false;
    },
    close() { ws.close(); },
  };
}

export const sleepMs = sleep;

/** Tiny assertion helper that records pass/fail lines and sets the exit code. */
export function checker(name) {
  let failed = 0;
  return {
    ok(cond, msg) { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}: ${msg}`); if (!cond) failed++; },
    done() { console.log(failed ? `FAILED ${name} (${failed})` : `PASSED ${name}`); process.exit(failed ? 1 : 0); },
  };
}
