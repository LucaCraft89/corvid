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
| 2026-10-09 | macOS / Phase 6 dropped: user has no Apple Developer account. Scaffold kept on unmerged branch `worktree-agent-ad344f3a0e7004929`. |
| 2026-10-09 | CI topology: GitHub-hosted runners for lint and patch-apply (sparse mode) on every PR; full Chromium builds on a self-hosted `corvid-builder` runner on the user's PC; nightly build skips when `CORVID_BUILDER_ENABLED` is not `true`. User will run `CORVID_ALLOW_BUILD=1 scripts/verify.sh --phase 0 --platform linux` on their PC (checklist in `docs/build-host.md`). |
| 2026-10-09 | Patch reuse policy approved as proposed in `docs/PATCH-PROVENANCE.md` (write fresh; BSD/MIT/Apache with per-patch entry; ask before any GPL/MPL). Not a blanket relicensing approval; project stays BSD-3. CR-1..CR-6 remain open. |
