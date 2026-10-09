# Change requests and open decisions

Agents: propose changes to locked decisions here; do not act on them until the user approves. Record the date and outcome.

## Open items (need the user's answer before the relevant phase)
| ID | Item | Needed by | Status |
|---|---|---|---|
| CR-3 | Proprietary codecs in distributed builds (legal) | Phase 1.13 | user decision 2026-10-09: enable all codecs (H.264, HEVC, AAC, ...) where hardware supports them; build-linux GN args set accordingly. NOT closed: patent/licensing exposure for distributed builds is the user's legal call; legal check required before any public release |
| CR-4 | Name "Corvid": trademark/domain check before any public release | before first release | open |
| CR-5 | Hybrid passkey transport requires a tunnel server host; decide policy | Phase 2.7 | open |
| CR-10 | Pre-release legal check for codecs (CR-3) and trademark (CR-4) is a release-gate checklist item | before first release | open |
| CR-11 | Widevine CDM: licensing/legal basis for a non-Google browser to obtain and use the CDM (see docs/notes/widevine.md). Not assumed allowed. User requires DRM video to work; design is user-initiated (prompt on first DRM use, never at idle) | Phase 1.13 / before first release | open |

## Resolved
| Date | Decision |
|---|---|
| 2026-10-09 | Gecko/Firefox dual-engine dropped; Chromium only |
| 2026-10-09 | WebRTC and related networking must work fully. Privacy stays locked: default `webrtc.ip_handling_policy` = `default_public_interface_only` with mDNS host candidates, exposed as a setting (`corvid.privacy`); no built-in STUN; idle capture must stay empty |
| 2026-10-09 | Full hardware acceleration on Linux (VA-API decode/encode, GPU raster, WebGL/WebGPU, X11 and Wayland); GN args in `build/args/linux-*.gn`; verified by acceptance check 11 (`corvid://gpu` + `vainfo`) |
| 2026-10-09 | CR-1: user approved bundling uBlock Origin (GPL-3.0) unmodified as a separate extension. Obligations: GPL text + notice with link to the exact corresponding source in credits; never modify uBO in the Corvid tree. Pin: 1.75.0 via `scripts/pin-ubo.sh` |
| 2026-10-09 | CR-2: extension sources are configurable. Defaults: Chrome Web Store, Microsoft Edge Add-ons; plus any Chromium-based store URL the user adds; plus manual CRX/ZIP install and unpacked directories. Third-party store terms of service may apply and the user accepted that; no source is hard-coded as non-removable |
| 2026-10-09 | CR-6: top-100 extension pass-rate target is 85% |
| 2026-10-09 | CR-8: default search engine DuckDuckGo (placeholder, configurable list). Default layout `desktop-vertical-tabs` (modern; chosen by the agent per "make something modern", see docs/notes/default-layout.md); all presets remain selectable |
| 2026-10-09 | CR-9: DevTools frontend stays reachable; Corvid diagnostics panels follow in Phase 2 |
| 2026-10-09 | Address bar can be placed at the top or bottom of the window on desktop and Android (setting `addressbar.position`, drag and drop in edit mode); it can never be hidden or removed |

