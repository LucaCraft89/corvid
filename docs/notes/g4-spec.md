# G4 spec: diagnostics + passkeys (2026-10-13, written without a tree)

Reality check from the repo (not from a build): G4 is NOT only four patches. The patches are thin hooks; most of the work is overlay C++ that does not exist or is not compiled yet.

| Piece | State in repo | Needed |
|---|---|---|
| diagnostics mojom + ring buffer + gtest | built in M2 (BUILD.gn) | nothing |
| `event_bus.h`, `stack_sampler.h` | MISSING (BUILD.gn says collectors need them) | write in `src-overlay/corvid/diagnostics/` (EventBus: thread-safe publish to ring buffer + subscribers; StackSampler: see below) |
| `hang_collector`, `net_collector` | written, NOT built (`collectors` target unused) | make `:collectors` compile and add it to the overlay test target |
| `corvid://diagnostics` WebUI (C++ side) | not found in `src-overlay/corvid/webui` list (check) | `add-webui-page` skill; UI exists under `ui/diagnostics` |
| passkeys: `SoftwareAuthenticator`, `SoftwareDiscovery`, `VaultStore` | only `software_authenticator.h` ("NOT COMPILED, no BUILD target") | write .cc + BUILD.gn; behavior contract = `reference/*.ts` (20 passing TS tests) |
| Argon2 for the C++ vault | NOT in tree (docs/notes/chromium-api-m2.md) | vendor reference Argon2 (CC0/Apache-2.0 side), `third_party/argon2` + BUILD.gn + PATCH-PROVENANCE.md entry; Luca approved this 2026-10-10 (orchestrator-resume.md) |
| XChaCha20-Poly1305 | BoringSSL `EVP_AEAD_xchacha20_poly1305` | verify symbol name in the tree |

## Order and who can do what without a build
1. Cloud sessions (no tree, compile unverified): write EventBus, StackSampler interface, VaultStore, SoftwareAuthenticator/SoftwareDiscovery .cc against the names in the headers, plus gtests that load the TS reference test vectors (`reference/test/*.test.ts`) as JSON fixtures. Mark every file "UNBUILT" until a builder compiles it.
2. Builder with tree (16 vCPU VM): apply overlay, `gn gen`, build `//corvid:corvid_phase1_unittests`, fix compile errors in dependency order (ring_buffer -> event_bus -> collectors -> vault -> authenticator). Expect 1 to 3 build cycles; each is incremental (overlay-only, minutes to an hour).
3. Patches 2001 to 2004 apply last, after the overlay compiles.

## Exact edit specs for the four patches (hooks recalled from memory, each needs the listed grep before the hunk is written)
- **2001** register `corvid://diagnostics` + attach collectors.
  - Hunk A: `TabHelpers::AttachTabHelpers` in `chrome/browser/ui/tab_helpers.cc`: add `corvid::diagnostics::HangCollector::CreateForWebContents(web_contents);` after the other `CreateForWebContents` calls, with include and a `//corvid/diagnostics:collectors` dep in `chrome/browser/ui/BUILD.gn`.
  - Hunk B: WebUI registry. The corvid:// scheme and the `corvid-<page>` registration already exist from ui/0200; add the diagnostics page through the same registration list there instead of editing `chrome_web_ui_configs.cc` (verify by reading patches/ui/0200 and src-overlay/corvid/webui).
  - Greps: `rg -n "CreateForWebContents" chrome/browser/ui/tab_helpers.cc | tail -5`; `rg -n "OnRendererUnresponsive" content/public/browser/web_contents_observer.h` (hook table in docs/notes/chromium-hooks.md says to confirm signatures).
- **2002** error page detail. Hook: where the renderer builds error page params. Greps: `rg -n "LocalizedError::GetStrings" chrome components`, `rg -n "NetErrorHelper" chrome/renderer`. Edit: add a call that asks the browser side (Mojo, `diagnostics.mojom`) for the event for the failed navigation id and merges its fields into the error page dictionary; the page UI is `ui/pages/diagnostics/error-*`. Highest rebase risk; if the grep shows the error page is already a WebUI on 155, hook there instead.
- **2003** `device::FidoDiscoveryFactory::Create`: spec as in the patch file (Linux, `kInternal` -> `corvid::passkeys::SoftwareDiscovery`) plus `//corvid/passkeys` dep in `device/fido/BUILD.gn`. docs/notes/chromium-api-m2.md says the FIDO names were verified at 155 (including this function); re-read the real signature before writing the hunk because `Create(FidoTransportProtocol)` may have changed arguments.
- **2004** gate the enclave authenticator off. Greps: `rg -n -i "enclave" device/fido/features.cc chrome/browser/webauthn | head -40`. Edit: set each enclave-related `base::Feature` to `FEATURE_DISABLED_BY_DEFAULT` (and check `base::FEATURE_ENABLED_BY_DEFAULT` call sites for platform overrides). Add enclave service hostnames to the host-check allowlist review (they must stay unlisted so 01b flags any live use).

## Tests (acceptance for the G4 gate)
Phase 2 browser-needing items (docs/specs/phase-2.md): induced renderer hang -> stack + visible report within 5 s; error pages show detail; vault encrypted at rest. `mock` hang test URL: `corvid://hang-test` (dev only) per docs/notes/chromium-hooks.md.

## Honest estimate for Thursday
Overlay C++ writing: cloud, in parallel, today. First compile of the overlay: Wed. Full browser acceptance of the hang test and vault: Thu at the earliest; the passkey end-to-end on webauthn.io is unlikely to fit and should be reported SKIPPED rather than faked if it does not.

## Progress log (overlay C++, all UNBUILT unless stated)
- 2026-10-13 piece 1 READY TO COMPILE: `ring_buffer` gained `Update(id, fn)` (std only; standalone test PASSES on this sandbox: `g++ -std=c++17 ring_buffer.cc ring_buffer_unittest.cc && ./a.out` printed OK) .
- piece 2 READY TO COMPILE: `event_bus.{h,cc}`, `stack_sampler.{h,cc}`, `event_bus_unittest.cc` (gtest), BUILD.gn targets `event_bus`, `collectors` (hang only), `unit_tests` updated. Stack backend is injectable; with none registered hangs report stackCaptured=false. The real backend (crashpad dump-without-crash or renderer-side sampler) is NOT written; check `rg DumpProcessStack content/public/browser` on the tree first.
- Not done: NetCollector (sketch only, excluded from `collectors`), DiagnosticsService Mojo implementation, corvid://diagnostics WebUI C++ side, freeze detector, passkeys C++ (VaultStore, SoftwareAuthenticator, SoftwareDiscovery), Argon2 vendoring.
