# Change requests and open decisions

Agents: propose changes to locked decisions here; do not act on them until the user approves. Record the date and outcome.

## Open items (need the user's answer before the relevant phase)
| ID | Item | Needed by | Status |
|---|---|---|---|
| CR-1 | uBlock Origin is GPL-3.0; confirm bundling it unmodified as a separate extension alongside a BSD-3 browser | Phase 1.10 | open |
| CR-2 | Extension store source: Chrome Web Store use from a non-Chrome browser has terms-of-service implications; choose default/configurable sources | Phase 1.7 | open |
| CR-3 | Proprietary codecs in distributed builds (legal) | Phase 1.13 | user decision 2026-10-09: enable all codecs (H.264, HEVC, AAC, ...) where hardware supports them; build-linux GN args set accordingly. NOT closed: patent/licensing exposure for distributed builds is the user's legal call; legal check required before any public release |
| CR-4 | Name "Corvid": trademark/domain check before any public release | before first release | open |
| CR-5 | Hybrid passkey transport requires a tunnel server host; decide policy | Phase 2.7 | open |
| CR-6 | Top-100 extension pass-rate target (proposed 85%) | Phase 1.12 | open |
| CR-7 | Widevine CDM (DRM video). Its CDM is fetched from Google by the component updater, which conflicts with zero Google calls. `enable_widevine=false` for now | Phase 1.13 | open |
| CR-8 | Default search engine (placeholder DuckDuckGo), default layout preset (desktop-classic) and default tab placement (top) | Phase 1.7 | open |
| CR-9 | Keep the DevTools frontend (a stock Chromium UI) reachable as a developer tool | Phase 1.8 | open |
| CR-10 | Pre-release legal check for codecs (CR-3) and trademark (CR-4) is a release-gate checklist item | before first release | open |

## Resolved
| Date | Decision |
|---|---|
| 2026-10-09 | Gecko/Firefox dual-engine dropped; Chromium only |
| 2026-10-09 | WebRTC and related networking must work fully. Privacy stays locked: default `webrtc.ip_handling_policy` = `default_public_interface_only` with mDNS host candidates, exposed as a setting (`corvid.privacy`); no built-in STUN; idle capture must stay empty |
| 2026-10-09 | Full hardware acceleration on Linux (VA-API decode/encode, GPU raster, WebGL/WebGPU, X11 and Wayland); GN args in `build/args/linux-*.gn`; verified by acceptance check 11 (`corvid://gpu` + `vainfo`) |
