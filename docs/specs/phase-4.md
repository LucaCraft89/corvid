# Phase 4 spec: Self-hosted E2EE sync

Goal: sync bookmarks, passwords, passkeys, settings, UI layouts and module lists across devices with a server that never sees plaintext.

## Tasks
| ID | Task | Skill |
|---|---|---|
| 4.1 | Threat model + protocol doc, reviewed by the user | `sync-server` (`docs/security/sync.md`) |
| 4.2 | Server: auth, device enroll/revoke, record store, quotas, rate limits, container image + compose | `sync-server` |
| 4.3 | Client engine + collections (bookmarks, passwords, passkeys, settings, layouts, modules; history optional) | `sync-server` |
| 4.4 | Conflict resolution + tombstones + offline queue | `sync-server` |
| 4.5 | `corvid://sync` UI: enroll, devices, recovery key, collection toggles, server URL | `add-webui-page` |
| 4.6 | Key recovery and passphrase change | `sync-server` |
| 4.7 | Self-host docs, backup/restore, upgrade guide | `sync-server` |

## Acceptance tests (`tests/acceptance/phase-4/`)
1. Two clients (Linux + Windows) converge after edits made offline on both sides.
2. Database dump scan: no URLs, titles, passwords, or credential IDs in plaintext.
3. Revoked device cannot pull or decrypt new data.
4. Wrong passphrase or tampered ciphertext is rejected and reported, never silently applied.
5. Recovery key restores access on a fresh device; passphrase change re-wraps keys without re-uploading all data.
6. Server survives fuzzing of every endpoint and enforces rate limits.
7. Layout and module lists sync and apply on another device with unavailable modules handled gracefully.

## Ask the user
- Server language (Go vs Rust suggested), database default, and auth protocol choice after the threat model.
- Whether history and open tabs sync (privacy tradeoff).
- Hosting plan for a public reference instance, if any.
