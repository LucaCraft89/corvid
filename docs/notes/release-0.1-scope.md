# Corvid 0.1: what ships and what is deferred (2026-10-14, honest list)

Basis: repo state on claude/corvid-prep (merged with vm-builder-g3-g5), reports from the builders, and what the overlay C++ has actually been compiled. "Built" means a builder compiled it; nothing below is claimed as tested unless a report says PASS.

## Principle (Luca, 2026-10-14)
No Google as far as possible, but without trading away daily-driver usability: passkeys, payments, vaults. Stable first.

## Ships in 0.1 if the Thursday builds land
| Area | Status now | Needs |
|---|---|---|
| Rebranded Chromium 155 on Linux, de-Googled (G2: idle capture clean, host check passes) | measured by builders | release/regular build + package |
| **UI stage 1** (native Chromium window; Corvid theme seed U1, side-panel entries U2, optional vertical tabs U3, stock menu items hidden U4): see docs/notes/ui-stage1-spec.md | specs only, no hunks yet | tree greps, then builds; each patch independently droppable | 
| Corvid internal pages (G1) incl. blocked/redirected stock pages | PASS earlier (acceptance 02) | rerun on final build |
| uBlock Origin preinstalled + MV2 allowed (G3: 0300, 0320 option A, 0330) | patches in series, tree-verified edits by the VM builder; not yet run in a browser | acceptance 06/07/08 on the build |
| Branding (name, icons) | PNGs generated, render step updated | rename acceptance with CORVID_REUSE_BUILD=1 |
| Diagnostics: event bus, ring buffer, hang events (no stack), navigation error events, service | overlay written, being compiled | wiring patch 2001 + UI; hang event WITHOUT a stack |
| Packaging: tarball (+ .deb where dpkg exists) | script exists, only self-tested | a real release or debug build to package |

## Deferred (needs a decision from Luca only for the first two)
| Item | Why | Impact on "daily driver" |
|---|---|---|
| **Passkeys (built-in software authenticator)** | C++ vault and authenticator core written but not built; missing: BoringSSL crypto, vendored Argon2, the device::FidoAuthenticator adapter and SoftwareDiscovery (need the FIDO headers read on the tree), WebUI prompts, persistence. Realistic only after Thursday | HIGH: Luca wants passkeys. Until then sites that offer passkeys fall back to what Chromium does with no authenticator (hardware keys still work; no stock Google Password Manager/enclave: 2004 is off). Passwords/TOTP unaffected |
| **M5 custom WebUI chrome shell** (answer to "all features including UI?": Corvid pages and theming ship in 0.1; free layout of the chrome itself does not) | days of work, several full builds; research note done (docs/notes/chrome-shell-approach.md) | none for stability; 0.1 uses Chromium's native chrome with Corvid internal pages |
| Hang stack capture (acceptance "stack within 5 s") | no desktop backend; needs renderer patch 2005 | hang is still detected and reported, without a stack |
| Payments (autofill/Payment Request) | not in any plan item; stock Chromium payment code stays, its Google endpoints are neutralized by G2 (confirm in the final idle capture and by a test purchase flow) | MEDIUM: must be tested; Google Pay specifically will not work |
| Password vault / sync | self-hosted sync is Phase 4, not 0.1; local password manager is Chromium's own, check that it still works with sync disabled | MEDIUM: verify manually |
| Release build for packaging | a debug component build is not shippable | package smoke-test artifact only unless a release build is run |
| Widevine DRM, codecs, name trademark (CR-11, CR-3/10, CR-4) | legal, Luca's decisions | blocks public release, not a private daily driver |
| Windows, Android, sync server (phases 3-5) | out of scope for 0.1 | n/a |

## The one decision for Luca
Ship 0.1 on Thursday WITHOUT built-in passkeys (hardware keys and everything else working), and finish passkeys + the custom shell as 0.2? Or hold the "complete build" until passkeys work (realistic: a few days after Thursday)? Recommendation: ship what is stable on Thursday as 0.1, passkeys next as the first 0.2 item, because a daily driver that is stable beats a late one, and passkeys code is the least-tested piece.

## What I need from the tree for passkeys (unblocks the adapter)
A builder commits `docs/notes/fido-api-155.md` with the verbatim declarations from: device/fido/fido_authenticator.h (class body), fido_discovery_base.h, fido_discovery_factory.h (Create and members), and the Ctap request/response types used by MakeCredential/GetAssertion (ctap_make_credential_request.h, ctap_get_assertion_request.h, authenticator_make_credential_response.h, authenticator_get_assertion_response.h declarations only), plus how chrome/browser/webauthn's authenticator request delegate asks for platform-authenticator unlock. With that I can write the adapter and SoftwareDiscovery against real signatures.
