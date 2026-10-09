#!/usr/bin/env node
// Acceptance 11 (added 2026-10-09, user decision "full hardware acceleration"): VA-API decode/encode, GPU rasterization,
// WebGL, WebGPU are active, as reported by corvid://gpu (data-feature / data-codec attributes) and confirmed by `vainfo`.
// REQUIRES a machine with a supported GPU, CORVID_BIN, and vainfo. On GPU-less CI this is SKIP, never PASS. UNVERIFIED.
import { spawnSync } from 'node:child_process';
import { checker, launch, requireBrowser, skip, sleepMs } from './lib/cdp.mjs';

process.env.CORVID_HEADLESS = '0';
const bin = requireBrowser();
const vainfo = spawnSync('vainfo', [], { encoding: 'utf8' });
if (vainfo.error || vainfo.status !== 0) skip('vainfo not available or failed (needs a VA-API capable GPU and libva-utils)');
const profiles = [...vainfo.stdout.matchAll(/VAProfile(\w+)\s*:\s*(VAEntrypoint\w+)/g)].map((m) => [m[1], m[2]]);
const hwDecode = (n) => profiles.some(([p, e]) => p.startsWith(n) && /VLD/.test(e));
const hwEncode = (n) => profiles.some(([p, e]) => p.startsWith(n) && /EncSlice|EncPicture|EncSliceLP/.test(e));

const c = checker('hw-accel');
const b = await launch({ bin });
const p = await b.open('corvid://gpu');
await sleepMs(1500);
const feat = async (name) => p.eval(`document.querySelector('[data-feature="${name}"]')?.dataset.status ?? null`);
for (const f of ['gpu_compositing', 'rasterization', 'webgl', 'webgl2', 'webgpu', 'video_decode', 'video_encode']) {
  const s = await feat(f);
  c.ok(s === 'enabled', `feature ${f}: ${s}`);
}
// codecs the local driver supports in hardware must be reported as hardware by Corvid
for (const [name, codec] of [['H264', 'h264'], ['HEVC', 'hevc'], ['VP9', 'vp9'], ['AV1', 'av1']]) {
  if (hwDecode(name)) c.ok(await p.eval(`document.querySelector('[data-codec="decode:${codec}"]')?.cells[2]?.textContent?.trim() === 'Yes'`), `${codec} decode reported as hardware (vainfo lists it)`);
  if (hwEncode(name)) c.ok(await p.eval(`document.querySelector('[data-codec="encode:${codec}"]')?.cells[2]?.textContent?.trim() === 'Yes'`), `${codec} encode reported as hardware (vainfo lists it)`);
}
c.ok((await p.eval(`document.querySelectorAll('.problems li').length`)) === 0, 'no GPU problems listed');
await b.close();
c.done();
