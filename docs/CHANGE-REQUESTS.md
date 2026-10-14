# Change requests and open decisions

Agents: propose changes to locked decisions here; do not act on them until the user approves. Record the date and outcome.

## Open items (need the user's answer before the relevant phase)
| ID | Item | Needed by | Status |
|---|---|---|---|
| CR-3 | Proprietary codecs in distributed builds (legal) | Phase 1.13 | user decision 2026-10-09: enable all codecs (H.264, HEVC, AAC, ...) where hardware supports them; build-linux GN args set accordingly. NOT closed: patent/licensing exposure for distributed builds is the user's legal call; legal check required before any public release |
| CR-4 | Name "Corvid": trademark/domain check before any public release | before first release | open |
| CR-10 | Pre-release legal check for codecs (CR-3) and trademark (CR-4) is a release-gate checklist item | before first release | open |
| CR-11 | Widevine CDM: licensing/legal basis for a non-Google browser to obtain and use the CDM (see docs/notes/widevine.md). Not assumed allowed. User requires DRM video to work; design is user-initiated (prompt on first DRM use, never at idle) | Phase 1.13 / before first release | open |

## Resolved
| Date | Decision |
|---|---|
| 2026-10-09 | Gecko/Firefox dual-engine dropped; Chromium only |
| 2026-10-09 | macOS / Phase 6 dropped: user has no Apple Developer account. Scaffold kept on unmerged branch `worktree-agent-ad344f3a0e7004929`. |
| 2026-10-09 | CI topology: GitHub-hosted runners for lint and patch-apply (sparse mode) on every PR; full Chromium builds on a self-hosted `corvid-builder` runner on the user's PC; nightly build skips when `CORVID_BUILDER_ENABLED` is not `true`. User will run `CORVID_ALLOW_BUILD=1 scripts/verify.sh --phase 0 --platform linux` on their PC (checklist in `docs/build-host.md`). |
| 2026-10-09 | Patch reuse policy approved as proposed in `docs/PATCH-PROVENANCE.md` (write fresh; BSD/MIT/Apache with per-patch entry; ask before any GPL/MPL). Not a blanket relicensing approval; project stays BSD-3. CR-1..CR-6 remain open. |
| 2026-10-09 | WebRTC and related networking must work fully. Privacy stays locked: default `webrtc.ip_handling_policy` = `default_public_interface_only` with mDNS host candidates, exposed as a setting (`corvid.privacy`); no built-in STUN; idle capture must stay empty |
| 2026-10-09 | Full hardware acceleration on Linux (VA-API decode/encode, GPU raster, WebGL/WebGPU, X11 and Wayland); GN args in `build/args/linux-*.gn`; verified by acceptance check 11 (`corvid://gpu` + `vainfo`) |
| 2026-10-09 | CR-1: user approved bundling uBlock Origin (GPL-3.0) unmodified as a separate extension. Obligations: GPL text + notice with link to the exact corresponding source in credits; never modify uBO in the Corvid tree. Pin: 1.75.0 via `scripts/pin-ubo.sh` |
| 2026-10-09 | CR-2: extension sources are configurable. Defaults: Chrome Web Store, Microsoft Edge Add-ons; plus any Chromium-based store URL the user adds; plus manual CRX/ZIP install and unpacked directories. Third-party store terms of service may apply and the user accepted that; no source is hard-coded as non-removable |
| 2026-10-09 | CR-5: hybrid passkey relay: use the existing Google/Apple relay only on user click ('use your phone'), never at idle; user can turn it off; UI warns of the effect (see `docs/notes/hybrid-tunnel.md`). Vault unlock default OS keyring; export redaction on by default; test sites Google, GitHub, webauthn.io. |
| 2026-10-09 | CR-6: top-100 extension pass-rate target is 85% |
| 2026-10-09 | CR-8: default search engine DuckDuckGo (placeholder, configurable list). Default layout `desktop-vertical-tabs` (modern; chosen by the agent per "make something modern", see docs/notes/default-layout.md); all presets remain selectable |
| 2026-10-09 | CR-9: DevTools frontend stays reachable; Corvid diagnostics panels follow in Phase 2 |
| 2026-10-09 | Address bar can be placed at the top or bottom of the window on desktop and Android (setting `addressbar.position`, drag and drop in edit mode); it can never be hidden or removed |

| 2026-10-09 | Phase 4 (user-confirmed, see `docs/security/sync.md` section 0; threat-model doc approved by the user 2026-10-09 with residual risks 1-5 accepted): (1) strict E2EE device admission, no passphrase-wrapped key copy, approval only by trusted-device hand-off with comparison code or recovery key; (2) self-host on Docker AND Proxmox LXC/bare metal with one static binary, SQLite default, Postgres later, registration default `token`, no public reference instance; (3) sync set = bookmarks, passwords, passkeys, settings, themes, layouts/modules, extensions (list+settings), history (default on); open tabs optional/off; cookies never sync; (4) sync engine in C++ in-process, Go engine kept as oracle with shared vectors; (5) optional metadata-only server admin UI that cannot approve devices; (6) automated license gate (BSD/MIT/Apache/ISC allowlist) in CI |
| 2026-10-09 | `docs/security/sync.md` approved by the user ("all ok for me"), including the five residual risks listed in it |
| 2026-10-09 | Phase 5 CR-A1: minSdk 26 floor, supported/target Android 12+ (API 31), dynamic color 31+, seed fallback below; user may tighten floor to 31 (wording ambiguous) |
| 2026-10-09 | Phase 5 CR-A2: ship arm64 + armhf; x86_64 emulator-only |
| 2026-10-09 | Phase 5 CR-A3: distribute via GitHub Releases APK now; F-Droid-style repo and Play later/maybe; signing-key plan still open (proposal in docs/specs/phase-5-budgets.md) |
| 2026-10-09 | Phase 5 CR-A4/A5: budgets and 80% Android top-100 target delegated to agent (docs/specs/phase-5-budgets.md); new-tab overrides, password managers, ad blockers are mandatory pass categories |
| 2026-10-09 | Phase 5 CR-A6: MV2 background pages may use a foreground service with guardrails |
| 2026-10-09 | Phase 5 CR-A7: passkeys must work; Play services only if the Track C spike proves required, isolated and optional |
| 2026-10-14 | CR-0.1-scope (Luca, decision card): "Corvid 0.1" is to cover Linux, Windows and Android, overriding the "Linux first" release split. Platform build ORDER is unchanged (Linux, Windows, Android); only the definition of 0.1 changes. The agent stated that Windows and Android have never been built and that no Thursday date can be promised for them; 0.1 is declared complete only when all three platforms pass their acceptance checks. Linux remains the first deliverable (target Thursday 2026-10-15). |
