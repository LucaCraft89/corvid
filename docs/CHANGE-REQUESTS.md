# Change requests and open decisions

Agents: propose changes to locked decisions here; do not act on them until the user approves. Record the date and outcome.

## Open items (need the user's answer before the relevant phase)
| ID | Item | Needed by | Status |
|---|---|---|---|
| CR-1 | uBlock Origin is GPL-3.0; confirm bundling it unmodified as a separate extension alongside a BSD-3 browser | Phase 1.10 | open |
| CR-2 | Extension store source: Chrome Web Store use from a non-Chrome browser has terms-of-service implications; choose default/configurable sources | Phase 1.7 | open |
| CR-3 | Proprietary codecs in distributed builds (legal) | Phase 1.13 | open |
| CR-4 | Name "Corvid": trademark/domain check before any public release | before first release | open |
| CR-5 | Hybrid passkey transport requires a tunnel server host; decide policy | Phase 2.7 | open |
| CR-6 | Top-100 extension pass-rate target (proposed 85%) | Phase 1.12 | open |

## Resolved
| Date | Decision |
|---|---|
| 2026-10-09 | Gecko/Firefox dual-engine dropped; Chromium only |
| 2026-10-09 | Phase 4 (user-confirmed, see `docs/security/sync.md` section 0; threat-model doc approved by the user 2026-10-09 with residual risks 1-5 accepted): (1) strict E2EE device admission, no passphrase-wrapped key copy, approval only by trusted-device hand-off with comparison code or recovery key; (2) self-host on Docker AND Proxmox LXC/bare metal with one static binary, SQLite default, Postgres later, registration default `token`, no public reference instance; (3) sync set = bookmarks, passwords, passkeys, settings, themes, layouts/modules, extensions (list+settings), history (default on); open tabs optional/off; cookies never sync; (4) sync engine in C++ in-process, Go engine kept as oracle with shared vectors; (5) optional metadata-only server admin UI that cannot approve devices; (6) automated license gate (BSD/MIT/Apache/ISC allowlist) in CI |
| 2026-10-09 | `docs/security/sync.md` approved by the user ("all ok for me"), including the five residual risks listed in it |
