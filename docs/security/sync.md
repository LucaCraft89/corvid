# Corvid Sync: threat model and protocol (Phase 4.1)

> **STATUS: DRAFT - awaiting user sign-off.** (Revised 2026-10-09 after the user confirmed the decisions in section 0; the user has NOT yet read or signed off the revised document.)
> The `sync-server` skill requires the user to review this document before the crypto and server are treated as final. The implementation in `server/sync/` and `src-overlay/corvid/sync/` was written against this draft so the work is not blocked; it is isolated (own Go modules, no patches to Chromium) and can be changed freely if the review changes a decision. Open questions are in section 11.

## 0. Decisions confirmed by the user on 2026-10-09
1. **Strict device admission (closes former residual risk R3).** There is no passphrase-wrapped copy of the data keys. A new device gets the keys only by (a) a cryptographic hand-off from an already trusted device, with a short comparison code shown on both devices, or (b) the recovery key. The passphrase is authentication only.
2. **Hosting.** Same static binary on Docker and on Proxmox LXC/bare metal (systemd unit + install script). SQLite default, Postgres later. Registration default stays `token`. No public reference instance.
3. **Sync set.** Bookmarks, passwords, passkeys, settings, themes, layouts/customizations/modules, extensions (installed list + settings), history (per-collection toggle, default ON). Open tabs optional, default OFF. **Cookies never sync** (not a registrable collection, enforced on client and server, tested).
4. **Client engine placement: C++ in-process.** The Go engine is the reference oracle; shared vectors in `src-overlay/corvid/sync/testvectors/`; OPAQUE-in-C++ risk analysis in `docs/notes/sync-cpp-opaque.md`.
5. **Optional server admin UI**, metadata only, off by default, cannot approve devices (section 6a).
6. **Automated license gate** (allowlist MIT/Apache-2.0/BSD/ISC), run in CI and locally.

## 1. Goals and non-goals

Goals
- Sync bookmarks, passwords, passkeys, settings, UI layouts and the installed-module list across a user's devices.
- The server (and anyone who steals its disk, backups, or logs) learns no URLs, titles, passwords, credential IDs, setting values, layout contents or module names.
- Self-hostable: one static binary / container image, SQLite by default.
- Losing one device, or forgetting the passphrase, must not mean losing data (recovery key).
- Revoking a device must stop it from receiving or decrypting new data.

Non-goals (stated so nobody assumes otherwise)
- Hiding metadata: account name, number of records per collection, record sizes (rounded, see 6.4), write timing, IP addresses, device count.
- Protecting against malware or a physical attacker on an unlocked, enrolled device.
- Protecting against a malicious server that withholds or rolls back data (it is detected only partially, see 7).
- Anonymity (Tor use is possible but not designed for).
- Syncing cookies (never), or the contents of extensions' own storage/code (only the installed list and settings sync).

## 2. Actors and trust

| Actor | Trust |
|---|---|
| Enrolled, approved device | Fully trusted: holds the data keys. |
| User | Knows the passphrase and (once) the recovery key. |
| Sync server operator | Honest-but-curious by default; the design also limits what an actively malicious server can do (section 7). Not trusted with plaintext, ever. |
| Network attacker | Untrusted; TLS required in production (reverse proxy), but confidentiality of data does not depend on it. |
| Other users of the same server | Untrusted. |

## 3. Assets

| Asset | Where it lives |
|---|---|
| Passphrase | Only in the user's head and transiently in client memory. Never sent (OPAQUE). |
| Recovery key (RK, 256 bit) | Shown once, kept by the user offline. Never sent to the server. |
| Account data keys (epoch keys, `EK_n`, 256 bit each) | On enrolled devices (local key store). On the server only as ciphertext (sections 5.3 to 5.5). |
| Record plaintext | Only on devices. |
| Record ciphertext | Server. |

## 4. Primitives (no hand-rolled crypto)

| Purpose | Primitive | Library | License |
|---|---|---|---|
| Password authentication without disclosing the passphrase | OPAQUE (RFC 9807), ristretto255-SHA512, Argon2id key stretching, 3DH | `github.com/bytemare/opaque` v0.18.0 | MIT |
| Record + key encryption | XChaCha20-Poly1305 | `golang.org/x/crypto/chacha20poly1305` | BSD-3 |
| Key derivation | HKDF-SHA256 | `golang.org/x/crypto/hkdf` | BSD-3 |
| Sealed delivery of keys to a device or recovery key | NaCl anonymous sealed box (X25519 + XSalsa20-Poly1305) | `golang.org/x/crypto/nacl/box` | BSD-3 |
| Recovery proof of possession | Ed25519 | Go standard library | BSD-3 |
| Server storage | SQLite (pure Go driver) | `modernc.org/sqlite` | BSD-3 |

Caveat to review: the OPAQUE library's README states that it has **not been independently audited** (it is written by an RFC co-author and has RFC test vectors and fuzzing). Alternatives if that is unacceptable: SRP (older, weaker guarantees), or password-derived auth key sent to the server (Bitwarden style, simpler but the server can brute-force offline). See section 11.

Why OPAQUE: the server never learns the passphrase or anything it could verify guesses against, except through an online OPRF evaluation that needs the server's OPRF seed; a stolen database alone does not allow offline guessing (the seed is stored separately in the server key file; an attacker who steals both can attempt offline guessing, slowed by Argon2id).

## 5. Protocol

### 5.1 Identifiers
- `username`: chosen by the user, opaque string, visible to the server. Could be an email or a random handle; the UI says so.
- `device_id`: 128-bit random, generated by the device.
- `record_id` on the wire: `HMAC-SHA256(IDK, collection || 0x00 || logical_id)` hex, where `IDK = HKDF(EK_0, "corvid-sync/v1/id")`. The server cannot see URLs, GUIDs, credential IDs or setting names.

### 5.2 Key hierarchy
```
EK_n (random 32 bytes, one per epoch n; epoch 0 created on account creation)
  collection key  CK_n,c = HKDF-SHA256(EK_n, info="corvid-sync/v1/collection/"+c)
  record id key   IDK    = HKDF-SHA256(EK_0, info="corvid-sync/v1/id")     (stable across epochs)
OPAQUE export_key: deliberately UNUSED. The passphrase never protects data keys.
RK (random 32 bytes, shown as base32 groups)
  recovery signing seed  = HKDF(RK, "corvid-sync/v1/recovery-sign")  -> Ed25519
  recovery box seed      = HKDF(RK, "corvid-sync/v1/recovery-box")   -> X25519
Device: X25519 keypair generated on the device, private key never leaves.
```

### 5.3 Account creation (first device)
1. Client generates `EK_0`, `RK`, device keypair, `device_id`.
2. OPAQUE registration (RFC 9807) of `username`/passphrase.
3. Client uploads: OPAQUE record, the recovery public keys (Ed25519 signing key, X25519 box key), a `recovery_pkg = SealedBox(recovery_box_pub, keybag)` where `keybag` is the list of `(epoch, EK)`, and the device record (`device_id`, X25519 public key, name). The first device is auto-approved.
4. Client shows RK once and requires the user to confirm they saved it.

### 5.4 Login and device enrollment
1. OPAQUE login (KE1/KE2/KE3). Success yields a bearer session token (random 256 bit, stored hashed server-side, 30 day expiry so devices need not re-prompt for the passphrase, bound to the device; revoked on device revoke and on passphrase change for all other devices). Failure responses are indistinguishable for unknown user vs wrong passphrase (fake record, constant-shape response), and failures are rate limited per username and per IP.
2. A device unknown to the account is created `pending`. A pending token can only: read its own status, and nothing else (cannot pull records, has no keys).
3. The new device shows its own short comparison code (first 4 bytes of SHA-256 of its public key). An already approved device lists pending devices, shows name + the code computed from the public key the SERVER supplied; the user approves only if both codes match (defeats a server swapping the key). On confirmation the approver calls approve with `SealedBox(new_device_pub, keybag)`. The server marks the device `approved`.
4. The new device fetches the sealed package, opens it with its private key, and now holds the keybag. The server cannot produce a valid package: it does not hold the keybag. A package with attacker-chosen keys opens but decrypts nothing (every real record then fails authentication). A device the server merely marks `approved` stays keyless.
5. The device then pulls all collections.

Approval is therefore enforced cryptographically, not by server policy (test: `TestStrict_PassphraseHolderControllingServerCannotAddDevice`).

### 5.5 Revocation and key rotation
Any approved device can revoke another (or itself).
1. Server marks the device `revoked`, deletes its sessions, deletes its sealed packages.
2. The revoking client generates `EK_{n+1}`, appends it to the keybag, and uploads in one request: a new `recovery_pkg`, and a sealed package per remaining approved device (it fetches their public keys).
3. New writes use epoch `n+1`; old records stay readable under their old epoch and are lazily re-encrypted on next edit.
4. A revoked device holds only `EK_0..n`: it cannot authenticate (so cannot pull), and even if it obtained new ciphertext (malicious server, disk theft), it cannot decrypt epoch `n+1` data. It can still decrypt anything it already could (old epochs); that cannot be undone and is stated plainly in the UI.

### 5.6 Recovery key on a fresh device
1. User enters `username` and RK. Client derives the recovery Ed25519 key.
2. `POST /v1/recovery/challenge` returns a nonce; client signs `"corvid-sync/v1/recover" || username || nonce`; `POST /v1/recovery/login` verifies against the stored public key and issues a session for a new, auto-approved device (registered in the same call), and returns `recovery_pkg`.
3. Client opens `recovery_pkg` with the derived X25519 key, obtaining the keybag.
4. Client then sets a new passphrase (5.7) and may rotate the recovery key.

### 5.7 Passphrase change (credential only, no keys or data touched)
1. Authenticated device re-verifies the old passphrase (full OPAQUE login) and performs a fresh OPAQUE registration with the new passphrase.
2. Client uploads the new OPAQUE record in one request. The server replaces it and revokes all other sessions. The key bag is unchanged, since nothing was wrapped by the passphrase.
3. No record is touched or re-uploaded. Other devices keep their local keybag and simply need the new passphrase at next login. (Verified by test: zero record writes during change.)

### 5.8 Records
Plaintext envelope (CBOR-free, JSON for the reference engine): `{v:1, id (logical id), hlc, dev, deleted, data}`. Encrypted with `XChaCha20-Poly1305(CK_n,c, nonce=24 random bytes, aad)` where
`aad = "corvid-sync/v1|" + username + "|" + collection + "|" + record_id + "|" + epoch` (username is immutable and known to every client).
Wire record: `{id, epoch, blob = nonce||ciphertext, deleted, base_seq}`. Plaintext is padded to a multiple of 256 bytes before encryption (length hiding, coarse).
- The AAD binds a ciphertext to its account, collection, record id and epoch: a malicious server cannot swap blobs between records or collections undetected.
- The server sets `seq` (monotonic per account) on every write; clients pull `since=seq`.
- Tombstones are ordinary records with `deleted=true` (the flag is visible to the server, the content is not). The server compacts tombstones older than the retention window (default 90 days) and advertises a `compacted_before` watermark; a client whose cursor is older must do a full resync.

### 5.9 Conflict resolution
- Clock: hybrid logical clock `(wall_ms, counter, device_id)`, total order. Per-record last-writer-wins by HLC.
- Server write rule: `base_seq` optimistic concurrency. If the record changed since the client's `base_seq`, the server answers `409` with the current seq; the client pulls, merges by HLC, retries. A stale client can therefore not clobber newer data silently; if two devices race, the higher HLC wins deterministically on every device.
- Bookmarks: one record per node `{parent, index (fractional string), title, url, kind}`; per-node LWW; deterministic repair after merge: cycles are broken by reattaching the lowest-HLC-moved node to the root, nodes whose parent is deleted or unknown go to the "Unsorted" folder; siblings ordered by `(index, id)`.
- Settings: one record per key (merge by key). Layouts: one record per named layout plus the active-layout setting. Modules: one record per module id `{version, enabled, source}`; on apply, modules not available on this device are kept in a "pending/unavailable" list and surfaced in the UI, never an error.
- Passwords and passkeys: per-record LWW. A delete vs edit conflict resolves by HLC (the later one wins); the losing edit is retained locally in the conflict log so the user can recover it.

## 6. Server-side controls

1. Per-IP token bucket on every route; much stricter bucket on auth routes; per-(username, IP) attempt counter with exponential backoff (1 s doubling to ~17 min after 5 consecutive attempts without a successful login). In OPAQUE a wrong passphrase is only detectable by the client (it cannot unmask the server's reply), so the server cannot see "failures"; every `login/start` therefore counts as an attempt until a login for that pair completes. Keying on the pair means an attacker cannot lock the real owner out from the owner's own IP; a distributed attacker is bounded by the per-IP limiter instead. Unknown usernames get a fake (deterministic per name) OPAQUE record.
2. Request body cap (default 2 MiB), record cap (default 256 KiB), batch cap (default 200 records), per-account byte quota (default 100 MiB), records-per-account cap.
3. Registration modes: `open`, `closed`, `token` (invite token), default `token` or `closed` in the compose file.
4. Secrets: OPAQUE long-term key material and OPRF seed generated at first start into a key file (0600), separate from the DB, and part of the backup instructions.
5. Logs contain no bodies, no tokens, no usernames beyond a short hash; no telemetry of any kind.
6. Sessions: opaque random tokens, stored as SHA-256 hash, expire, revoked on device revoke / passphrase change.
7. Record sizes are padded (5.8), so only coarse size classes leak.

### 6a. Optional admin UI (off by default)
Enabled only when `CORVID_SYNC_ADMIN_TOKEN` is set; otherwise `/admin*` answers 404. Bearer token, constant-time compare, auth-route rate limit, strict CSP (no inline script, no external resources), values rendered with `textContent`. It shows **metadata only**: health, user list (name, sizes, quota, device counts), per-user device list (name, state, last seen), invite tokens (created, listed by label, only a hash is stored, plaintext shown once). Actions: create/delete invites, set a user's quota, delete a user, block (revoke) a device at the server. It has no route that reads records, keys or packages and **no route that approves a device** (approval is the cryptographic hand-off in 5.4). A server-side block by the admin does not rotate keys (the server has none); the user should revoke from a trusted device to rotate. Bind it to LAN or put it behind your proxy's own auth; the admin token is a full-power secret for metadata, so do not expose `/admin` to the internet if you can avoid it.

## 7. Threats and mitigations

| # | Threat | Mitigation | Residual |
|---|---|---|---|
| T1 | Server DB / backup stolen | Only ciphertext + metadata. Automated plaintext scan test. | Metadata (section 1). Offline guessing of passphrase needs the OPRF seed too. |
| T2 | Server DB + key file stolen | OPAQUE slows guessing with Argon2id; data keys are not derivable without a guessed passphrase or RK. | A weak passphrase can fall. UI enforces minimum strength and shows RK as the strong alternative. |
| T3 | Network attacker | TLS (operator-provided); OPAQUE and AEAD mean even no-TLS does not leak plaintext or the passphrase. | Session tokens are bearer tokens; use TLS. |
| T4 | Active malicious server tampers with ciphertext | AEAD + AAD binding; client reports `integrity_error`, quarantines the record, never applies it. | |
| T5 | Server drops or rolls back records | Client keeps highest seen `seq`; a decrease is reported. | Withholding / targeted staleness not fully detectable without a signed log (future). |
| T6 | Online passphrase guessing | Rate limits, per-(user,IP) backoff, OPAQUE | Distributed guessing slowly; a guessed passphrase alone yields no keys and no data (device approval is cryptographic). |
| T7 | Stolen device | Revoke from another device -> epoch rotation. Local key store should be OS-protected. | Data already on the device. |
| T8 | Stolen session token | Short expiry, revoke-on-change, device binding. | Valid until expiry unless revoked. |
| T9 | Username enumeration | Fake OPAQUE records; uniform errors. Registration endpoint can still reveal "taken" (inherent). | Registration confirms existence. |
| T10 | DoS / resource exhaustion | Section 6.1 and 6.2. | Not a goal to resist a large DDoS; use reverse proxy. |
| T11 | Malformed input / fuzzing | Strict parsing, size caps, fuzz tests, no panics. | |
| T12 | Lost recovery key and passphrase and all devices | Data unrecoverable by design. | Documented. |
| T13 | Replay of a captured KE3 | OPAQUE login state is single-use and expires in 60 s. | |

Residual risks, explicit
- R1 Metadata, as listed.
- R2 Library maturity: OPAQUE implementation unaudited (section 4).
- R3 (CLOSED 2026-10-09, strict model): there is no passphrase-wrapped key copy. Consequence accepted by the user: losing every trusted device AND the recovery key means the data is unrecoverable by anyone. A passphrase-only attacker who controls the server gets metadata and ciphertext, never keys.
- R4 `username` and device names are plaintext on the server.
- R5 Device names are chosen by the user and visible to the server; the UI warns.
- R6 No forward secrecy for data at rest across epochs, other than rotation on revoke.

## 8. API surface (v1), JSON over HTTPS

| Route | Auth | Purpose |
|---|---|---|
| `GET /healthz` | none | liveness |
| `GET /v1/info` | none | server version, limits, registration mode |
| `POST /v1/register/start`, `/v1/register/finish` | none (gated by mode) | OPAQUE registration + account bootstrap |
| `POST /v1/login/start`, `/v1/login/finish` | none | OPAQUE login, session token, device status |
| `POST /v1/recovery/challenge`, `/v1/recovery/login` | none | recovery-key login |
| `GET /v1/devices` | approved | list |
| `POST /v1/devices/{id}/approve` | approved | approve with sealed package |
| `POST /v1/devices/{id}/revoke` | approved | revoke + rotation upload |
| `GET /v1/devices/self` | any session | status + sealed package |
| `GET /v1/keys` | approved | recovery public keys + package, epoch |
| `POST /v1/password/start`, `/v1/password/finish` | approved | passphrase change (credential only) |
| `POST /v1/recovery/rotate` | approved | replace recovery keys + package |
| `POST /v1/records/push` | approved | batch write |
| `GET /v1/records/pull?collection=&since=` | approved | batch read |
| `DELETE /v1/account` | approved | delete everything |

## 9. Tests that map to this document
See `tests/acceptance/phase-4/`: convergence (offline edits), DB dump plaintext scan, revoked device, tamper / wrong passphrase, recovery key, passphrase change with zero record writes and no key wrap, strict-model device-admission attack, cookies-not-registrable, admin UI, fuzzing + rate limits, layout/module list with unavailable modules.

## 10. Implementation status vs this draft
- Server (`server/sync/`, Go 1.26, SQLite via modernc, OPAQUE via bytemare/opaque): strict model, sync set incl. extensions/themes/history/tabs (no cookies), invites + quotas + optional admin UI implemented and tested. Not done: Postgres adapter; in-flight OPAQUE login state is in memory (single instance only).
- Client engine (`src-overlay/corvid/sync/`, Go reference engine / oracle): implemented and tested; shared vectors exported. The C++ in-process port is NOT started; first task is the OPAQUE spike in `docs/notes/sync-cpp-opaque.md`.
- `corvid://sync` page (`ui/pages/sync/`): implemented against a proxy interface and tested in jsdom; the Mojo bridge is a stub.
- Windows + Linux real-client convergence is UNVERIFIED.
- A client offline longer than the tombstone retention window is told to resync (HTTP 410); it reconciles by dropping clean local records absent from the full listing and re-pushing unsynced edits.
- History merges as a union of visit times (capped at 50 per URL); everything else is per-record LWW.

## 11. Open items for the user
1. Read and sign off this revised document (status stays DRAFT until then).
2. Choose the C++ OPAQUE route after the spike (Rust `opaque-ke`, or P-256 suite with a C++ state machine), see `docs/notes/sync-cpp-opaque.md`.
3. Replace NaCl sealed boxes with HPKE (RFC 9180) before the C++ port, to avoid a bespoke construction in C++.
