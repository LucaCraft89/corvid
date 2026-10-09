---
name: sync-server
description: Build and maintain the self-hostable end-to-end-encrypted sync server and the client sync engine. Use for Phase 4.
---

# sync-server

## Design principles
- Server stores only ciphertext and minimal metadata; keys never leave devices.
- Self-hostable: single container image plus compose file; SQLite default, Postgres optional; runs behind a reverse proxy with TLS.

## Crypto (use audited libraries, never hand-rolled primitives)
- Account root secret from a user passphrase via Argon2id plus a random recovery key shown once. Per-device keypairs; data keys wrapped per device. Authenticated encryption (XChaCha20-Poly1305 or AES-256-GCM) via libsodium or equivalent. Write the threat model in `docs/security/sync.md` before coding and get the user's sign-off.

## Components
1. `server/sync/`: language choice made with the user (Go or Rust suggested). Endpoints: register/login (auth without learning the passphrase, e.g. OPAQUE/SRP-style), device enroll/approve/revoke, push/pull encrypted records by collection with revision/vector tracking, tombstones, quota, rate limits.
2. Client engine `src-overlay/corvid/sync/`: collections: bookmarks, passwords, passkeys, settings, UI layouts, installed module list; optional: history, open tabs.
3. Conflict handling: per-record last-writer-wins with logical clocks; merge rules for bookmark trees; settings merged by key.
4. UI: `corvid://sync` page (enroll, devices, recovery key, per-collection toggles, server URL).
5. Ops docs: `docs/selfhost-sync.md` (compose file, backup, upgrade).

## Tests
Two clients converge after offline edits; revoked device cannot read new data; server DB dump contains no plaintext (automated scan); fuzz the API.

## Done when
- Acceptance tests in `docs/specs/phase-4.md` pass and the threat model is reviewed.
