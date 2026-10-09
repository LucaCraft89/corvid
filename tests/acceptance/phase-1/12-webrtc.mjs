#!/usr/bin/env node
// Acceptance 12 (added 2026-10-09): WebRTC works (loopback peer connection + data channel) while the default IP-handling
// policy stays protective: no private/LAN IPv4 literal in ICE candidates (mDNS names or none), no server-reflexive
// candidates unless a STUN server is configured, and no default Google STUN. REQUIRES CORVID_BIN. UNVERIFIED.
// Not covered here: getUserMedia (needs devices), WebTransport, raw sockets APIs.
import { checker, launch, requireBrowser } from './lib/cdp.mjs';
import { startServer } from '../../fixtures/server.mjs';

const bin = requireBrowser();
const c = checker('webrtc');
const server = await startServer();
const b = await launch({ bin });
const p = await b.open(`http://127.0.0.1:${server.port}/ok.js`);
await p.navigate(`http://127.0.0.1:${server.port}/ok.js`);

const result = await p.eval(`(async () => {
  const cands = [];
  const a = new RTCPeerConnection({ iceServers: [] }), z = new RTCPeerConnection({ iceServers: [] });
  a.onicecandidate = (e) => { if (e.candidate) { cands.push(e.candidate.candidate); z.addIceCandidate(e.candidate); } };
  z.onicecandidate = (e) => { if (e.candidate) { cands.push(e.candidate.candidate); a.addIceCandidate(e.candidate); } };
  const dc = a.createDataChannel('t');
  const got = new Promise((res) => { z.ondatachannel = (ev) => { ev.channel.onmessage = (m) => res(m.data); }; });
  const open = new Promise((res) => { dc.onopen = res; });
  await a.setLocalDescription(await a.createOffer());
  await z.setRemoteDescription(a.localDescription);
  await z.setLocalDescription(await z.createAnswer());
  await a.setRemoteDescription(z.localDescription);
  await Promise.race([open, new Promise((_, r) => setTimeout(() => r(new Error('datachannel open timeout')), 8000))]);
  dc.send('corvid');
  const msg = await Promise.race([got, new Promise((_, r) => setTimeout(() => r(new Error('message timeout')), 5000))]);
  return { msg, cands };
})().then((r) => JSON.stringify(r), (e) => JSON.stringify({ error: String(e) }))`);
const r = JSON.parse(result);
c.ok(!r.error && r.msg === 'corvid', `data channel connected and delivered a message (${r.error ?? 'ok'})`);
const priv = /(^|\s)(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(\s|$)/;
const leaked = (r.cands ?? []).filter((x) => priv.test(x));
c.ok(leaked.length === 0, `no private IPv4 literal in ICE candidates (${leaked.length} leaked)`);
c.ok(!(r.cands ?? []).some((x) => / typ srflx /.test(x)), 'no server-reflexive candidates without a configured STUN server');
c.ok(server.hits.every((h) => !/google/.test(h.host)), 'no Google STUN/host contacted');
await b.close();
await server.close();
c.done();
