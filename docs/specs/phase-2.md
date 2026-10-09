# Phase 2 spec: Diagnostics, DevTools, passkeys

Goal: the "full verbosity" experience and passkeys everywhere the Linux build runs.

## Tasks
| ID | Task | Skill |
|---|---|---|
| 2.1 | Diagnostics event bus + local ring buffer + exporter | `diagnostics-event` |
| 2.2 | Collectors: hang/freeze with stack capture, crash (local), net/DNS/TLS, console, memory/CPU, extension and service-worker errors | `diagnostics-event` |
| 2.3 | `corvid://diagnostics` hub (timeline, filters, per-tab view, export) | `add-webui-page` |
| 2.4 | Error pages with plain summary + technical detail | `add-webui-page`, `diagnostics-event` |
| 2.5 | Verbose DevTools panel(s), perf overlay | `devtools-extension` |
| 2.6 | Software passkey authenticator + vault UI | `passkey-authenticator` |
| 2.7 | Disable Google enclave authenticator; hybrid transport check | `passkey-authenticator`, `debrand-and-degoogle` |
| 2.8 | Security review docs | - |

## Order
2.1 -> 2.2 -> (2.3, 2.4, 2.5 parallel). 2.6 independent track; 2.7 after 2.6; 2.8 last.

## Acceptance tests (`tests/acceptance/phase-2/`)
1. `corvid://hang-test` (dev only) blocks a renderer for 10 s: a hang event with a captured stack appears in the hub within 5 s and the tab shows a freeze page with detail and recovery options.
2. Force each net error class (DNS fail, refused, TLS expired/self-signed/hostname mismatch, timeout, redirect loop): error page shows summary and detail (resolver, cert chain/error, timings, retries).
3. Crash a renderer: local report with symbolized summary appears; nothing is uploaded (idle capture).
4. Diagnostics overhead < 1% CPU idle with 50 tabs (measured).
5. DevTools: verbose console shows all levels with stacks; perf overlay shows long tasks on a blocking test page; freeze capture produces a trace file.
6. Export bundle contains exactly what the preview listed; redaction toggle removes URLs.
7. Passkeys: register + authenticate on webauthn.io and two major sites; conditional UI autofill works; hardware key works; hybrid phone flow works (note any required external host and ask the user); tampered vault file is rejected; vault file contains no plaintext key material.

## Ask the user
- Hybrid transport tunnel host policy.
- Vault unlock policy (passphrase each session vs OS keyring).
- Retention size defaults for diagnostics logs.
