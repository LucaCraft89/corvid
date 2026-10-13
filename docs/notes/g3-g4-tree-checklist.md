# G3/G4 patch drafting: what needs a Chromium tree copy (2026-10-13)

Drafting happens on a COPY of the tree (separate directory or git worktree, never out/GnDebug's source) on the 16 vCPU VM. Patches 0300-0330 and 2001-2004 are intent-only today. For each: locate, edit, `scripts/refresh-patches.sh`, record paths in notes.

## Findings needed first (grep only, no build)
| Patch | Question | Grep |
|---|---|---|
| 0300 | Does 155 still contain MV2 code and the experiment manager, or was it deleted? If deleted the patch becomes a restore into `src-overlay/corvid/extensions_mv2/` (large). Biggest schedule risk of G3. | `rg -l "ManifestV2|mv2_experiment|kExtensionManifestV2" chrome extensions` |
| 0310 | DROPPED: _permission_features.json already allows MV2 blocking webRequest (see mv2-gates.md) | n/a |
| 0320 | External/preinstalled provider hook | `rg "ExternalProviderImpl|ExternalPrefLoader" chrome/browser/extensions` |
| 0330 | NTP override: how `chrome_url_overrides.newtab` is resolved | `rg "newtab" chrome/browser/extensions/extension_web_ui.cc` |
| 2001/2002 | Diagnostics WebUI registration, error page detail hook | `rg "LocalizedError::GetStrings"`, `chrome_web_ui_controller_factory.cc` |
| 2003/2004 | `FidoDiscoveryFactory`, enclave gates | `rg -i "enclave" device/fido chrome/browser/webauthn` |

## Order
1. Run all greps in one session, fill the table with results (this file), commit on `claude/corvid-prep`.
2. Write 0330, 0320, 0310, 0300 (smallest first, MV2 last because of the deletion risk), generate with refresh-patches, prove `apply-patches.sh` on a fresh state.
3. 2001/2002, then 2003/2004 + Argon2 vendoring (Apache-2.0 side, record in PATCH-PROVENANCE.md).
4. Do NOT touch the build tree or add these to `patches/series` until the G2 checks (01b + idle capture on out/GnDebug) pass.

## Need from the coordinator
A Chromium copy on the 16 vCPU VM at the pinned tag (a `git worktree` or `cp --reflink` of the 16 vCPU VM's tree after its out/GnDebug build, on a separate path) with a Claude session that can run commands there.
