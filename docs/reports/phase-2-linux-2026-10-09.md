# Phase 2 report: Linux, 2026-10-09

Environment: sandbox without a Chromium tree or build. "PASS" below means executed here with evidence. Anything needing a built Corvid, network, or hardware is UNVERIFIED. This phase is NOT complete.

Reproduce all verifiable checks: `bash tests/acceptance/phase-2/run-all.sh` (after `npm install` in each package dir).

## Verified here (PASS)
| Check | Evidence |
|---|---|
| Diagnostics core: schema, ring buffer (count/bytes/age eviction, persistence, torn-line tolerance, filters), redaction (urls, paths, ips, structured fields), exporter (preview == bundle, sha256 manifest, ZIP+CRC, unsafe names, minidump exclusion under redaction) | `ui/diagnostics` 15/15 tests |
| C++ ring buffer + redaction | `ring_buffer_unittest.cc`, g++ 13 `-fsanitize=address,undefined`, OK |
| Vault crypto (Argon2id + XChaCha20-Poly1305, HKDF, header-AAD), negative tests: wrong passphrase, tamper of every field (body, wrappedKey, nonces, salt, revision, KDF params, mode), truncation/garbage, KDF downgrade and DoS-size params, rollback, no plaintext key/rpId/username/passphrase in file, lock wipes, keyring modes | `reference/test/vault.test.ts` 11/11 |
| Software authenticator: makeCredential/getAssertion (ES256, none attestation, discoverable, excludeList, allowList, rp scoping, counter, conditional-UI picker, denial), signature verifies under the COSE key emitted in authData | `authenticator.test.ts` 9/9 |
| Vault service: persistence, auto-lock, rollback high-water mark, tamper at unlock, encrypted backup import/export | `service.test.ts` 8/8 (reference total 28) |
| Hub model (filters, live updates, timeline buckets, export flow with redaction re-preview), error-page view-model for DNS fail, refused, timeout, redirect loop, TLS expired/self-signed/hostname (summary+hint+detail), i18n completeness | `ui/pages/diagnostics` 8/8 |
| Vault UI model (create/unlock/lock/rename/confirmed delete/backup import, never sees private keys) over the real VaultService | `ui/pages/passkeys` 4/4 |
| DevTools logic: verbose console (all levels), copy-as-report, perf tracker (long tasks, TBT, fps), PerformanceObserver binding, hang-event linking, panel tab filtering | `ui/devtools` 8/8 |
| TypeScript strict typecheck of all TS incl. DOM elements | `tsc` clean |
| Spec test 7 part A (tampered vault rejected; no plaintext at rest) | `07-passkeys.sh` part A runs the real vault tests |
| Spec test 6 unit level (bundle == preview; redaction removes URLs) | `06-export.sh` |
| No network code in diagnostics/passkeys/devtools sources | no fetch/XHR/socket APIs used; asserted by design, grep-able |

## UNVERIFIED (written, not run)
| Spec item | State |
|---|---|
| 1 Hang within 5 s, stack, freeze page | `01-hang.sh`, `hang_collector.*` uncompiled. Open design risk: capturing a hung renderer's main-thread stack from the browser process (see docs/notes/chromium-hooks.md). Dev-only JSON bridge endpoints used by the scripts (`/corvid-dev/*`) do not exist yet. |
| 2 Net error classes in browser | `02-net-errors.sh`; TLS cert fixtures (expired/self-signed/hostname) still to generate; view-model verified. |
| 3 Crash local, nothing uploaded | `03-crash-local.sh` (needs tcpdump + build). |
| 4 Overhead < 1% CPU, 50 tabs | `04-overhead.sh` A/B method written; NOT measured. Design keeps idle cost near zero (observer callbacks only, fold-and-emit-on-failure). |
| 5 DevTools in browser | `05-devtools.sh` + fixture; panel registration route undecided (docs/notes/devtools.md). |
| 6 End-to-end export | script part B. |
| 7 part B | real sites, conditional UI, hardware key, hybrid: `passkeys-manual.md`. |
| 2.1 Mojo, event_bus, file-backed sink, net collector impl, stack sampler | only mojom, hang/console/crash collector and BUILD.gn drafted; `event_bus.*`, `stack_sampler.*`, `net_collector.cc` body not written. |
| 2.6 C++ authenticator/discovery, Argon2 in Chromium | header only (`software_authenticator.h`); `VaultStore` C++ port not written. |
| 2.7 enclave disabled, hybrid check | patch 2004 sketch without hunks; hybrid not tested. |
| Patches | `patches/series.phase2` 4 entries, all sketches, never applied. |
| 2.8 Security review | `docs/security/passkeys.md` written; checklist not ticked (needs independent review). |
| WebUI elements | `hub-element.ts`, `vault-element.ts` typechecked but never rendered; no a11y/screenshot tests; not wired to `corvid://` registration or Mojo. |

## Questions for the user
See `docs/notes/phase-2-questions.md` (CR-5 hybrid host, vault unlock policy, retention, Argon2 cost, acceptance sites, dependency licenses).
