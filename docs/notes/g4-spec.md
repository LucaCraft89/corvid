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

## Stack-capture finding (Azure builder, read-only, 2026-10-13)
`rg DumpProcessStack content/public/browser`: only `render_process_host.h:450` `virtual void DumpProcessStack() = 0;` inside `#if BUILDFLAG(IS_ANDROID)` (lines 426-451); implementations behind it in child_process_launcher.cc:335, gpu_process_host.cc:1298, browser_child_process_host_impl.cc:367 (Android-only status of those three unchecked). So desktop Linux has no ready backend.

Options for a Linux backend (none written; all need a tree, none verified):
| Option | How | Cost / risk |
|---|---|---|
| R. Renderer-side sampler (recommended if the acceptance is kept) | New patch `diagnostics/2005`: on renderer startup a small thread/IO-sequence-bound Mojo interface (`CaptureMainThreadStack`) uses `base::StackSamplingProfiler` on the renderer main thread (the IO thread still runs while main is hung); browser `StackSampler` backend calls it from `OnRendererUnresponsive` and amends the hang event with the frames | Touches content/renderer (high rebase risk), sandbox/unwinding on release builds needs symbols; est. 1 to 2 days with 2 build cycles |
| C. Crashpad dump of the hung renderer | handler-side dump of another pid | not known to be exposed on Linux; needs research |
| K. Cheap fallback | read `/proc/<pid>/task/<tid>/{wchan,stat}` for state only | no stack, not the acceptance |
Decision for Luca: keep the Phase 2 acceptance "hang produces a captured stack within 5 s" (needs option R, a new renderer patch) or accept that the hang EVENT and report are delivered but the stack is empty for 0.1 (acceptance item reported FAIL/SKIPPED honestly). Recommendation: for Thursday ship the event without stack (already built), do R after.
- piece 3 READY TO COMPILE (2026-10-13): `src-overlay/corvid/passkeys/{vault.h,vault.cc,vault_unittest.cc,BUILD.gn}`, wired into `//corvid:corvid_phase1_unittests` as `//corvid/passkeys:unit_tests`. C++ port of reference/vault.ts; crypto behind `VaultCrypto`; the gtests run the format logic against a FAKE crypto (no Argon2 needed): roundtrip, no plaintext in file, wrong/missing secret, tampering with every field, KDF floor, revision/nonces, lock, keyring modes. Filter: `--gtest_filter='CorvidVault*'`.
  - NOT done and needed for real: `vault_crypto_boringssl.{h,cc}` (written, target present but not depended on; needs `third_party/argon2` vendored, include path and `argon2id_hash_raw` unverified); TS<->C++ cross-compat test with a fixture produced by `reference/vault.ts`; NFKC normalization of the passphrase (ICU) so non-ASCII passphrases match the TS side; file persistence (atomic write, 0600) and the SoftwareAuthenticator/SoftwareDiscovery classes.
- Stack-capture backend for desktop Linux: see the finding section above.
