# Corvid sync protocol, version 1

Status: draft, implemented by `sync/server` and `sync/client` (phase 4). Background and the choice behind it: `docs/decisions/002-sync.md`.

## 1. Model and threat model
- **Server** (self-hosted, untrusted for confidentiality): stores accounts, devices, vaults of opaque objects and a small mailbox. It never sees a key or plaintext.
- **Vault**: one per account in normal use, named by a random UUID and encrypted with a random 32-byte **vault key** that exists only on devices (and on paper as the recovery key).
- **Device**: has a bearer secret for the server and an X25519 **identity key**.
- Guarantees: the server cannot read or undetectably change data, cannot roll a device back to an older state, cannot fork history, and cannot get a vault key by swapping public keys during pairing. Tampered data and wrong keys are rejected and reported, never applied.
- Limits: the server sees sizes, timing, object counts and device names. It can withhold data (denial of service). Revocation cuts server access at once; data a revoked device copied before is not recoverable. A rotation sent by a device that is still listed as active in the receiver's roster is trusted.

## 2. Vault format (byte-compatible with Helium)
Same as Helium's `components/sync/engine/sync_vault` (rev 2/3); `TestProtoMatchesProtoc` checks it against Helium's `.proto`. Wire labels keep Helium's names on purpose.

**Objects.** `head` is mutable. Commits and payload chunks are immutable and named by the lowercase hex SHA-256 of their encrypted bytes. Corvid adds the mutable object `roster` (section 4).

**Encryption.** `object_key = HKDF-SHA256(ikm = vault_key, salt = vault_uuid (36 ASCII bytes), info = "helium-private-sync-v1/object-aead/aes-256-gcm-siv", 32 bytes)`. Each object is `nonce(12, random) || AES-256-GCM-SIV(object_key, nonce, plaintext, ad)` (RFC 8452), with `ad = "helium-private-sync-v1/object/" || vault_uuid || role (1 byte)`. Roles: 1 head, 2 commit, 3 payload chunk, 16 roster (Corvid). Plaintext limits: head and roster 64 KiB - 28, commit 4 MiB - 28, chunk 16 MiB - 28.

**Records** (proto2, fields in number order, every set field written):
- `SyncVaultHead { 1 format_version = 1; 2 commit_digest (32 bytes, absent before the first commit) }`
- `SyncVaultCommit { 1 format_version; 2 generation; 3 parent_commit_digest (absent only at generation 1); 4 epoch; 5 epoch_start_generation; 6 minimum_retained_generation; 7 epoch_payload_bytes; 8 inline_payload | (9 payload_chunk_digests..., 10 external_payload_size) }`
- `SyncVaultCheckpoint { 1 format_version; 2 vault_uuid; 3 generation; 4 commit_digest }`, stored only on the device.

**History.** Generations count up by one; each commit names its parent's digest. An epoch starts with a full snapshot; later commits in it carry deltas. A writer starts a new epoch when the epoch has 64 commits, when the delta is not smaller than the snapshot, or when the epoch's payload bytes reach `snapshot + max(256 MiB, snapshot)`. `minimum_retained_generation` is the previous epoch's start (0 for epochs 0 and 1). Payloads over the commit limit are split into chunks. Validity and transition rules: `vault/format.go` (`validCommit`, `ValidTransition`).

**Reading.** Decrypt `head`, fetch the commit, check its content address, decrypt, parse. Classify against the checkpoint (`ValidateHistory`): older generation = **rollback**, same generation with another digest or an ancestry that does not reach the checkpoint = **fork**; both are rejected. When the checkpoint is inside the retained window, the client walks parents back to it (at most 128). Then it walks back to the epoch start, applies snapshot and deltas, and advances the checkpoint.

**Writing.** Write chunks and the commit (create-only), then replace `head` with compare-and-swap on the revision the state was read at. On conflict: re-read, merge, retry. After a commit in epoch `e >= 2`, ask the server to collect epochs below `e - 1`.

**Payload.** Opaque to this layer. The browser uses Helium's loopback-server state (Chromium's sync engine does the merging). The reference client uses `corvid-kv-v1`: JSON `{"format":"corvid-kv-v1","records":{key:{"v":base64,"d":deleted,"c":lamport,"w":device}}}`; a delta has format `corvid-kv-v1-delta` and the changed records; merge is last-writer-wins by `(c, w)`.

## 3. Server API (HTTP, `/v1`)
TLS is required in deployment (built-in or a proxy). Device requests carry `Authorization: Bearer <device_secret>`. Errors are JSON `{"error": code, "message": text}`: `unauthorized` / `device_revoked` (401), `token_invalid` (403), `not_found` / `no_object` (404), `conflict` (412), `too_large` (413), `precondition_required` (428), `quota_exceeded` (507).

| Method and path | Body | Result |
|---|---|---|
| `GET /v1/health` | | `{"status":"ok"}` (no auth) |
| `POST /v1/register` | `{token, name, public_key}` (base64, 32 bytes) | 201 `{account, device_id, device_secret}`; the token is spent |
| `GET /v1/me` | | `{device_id, account, name}` |
| `GET /v1/devices` | | `{devices:[{id,name,public_key,created,last_seen,revoked?}]}` |
| `DELETE /v1/devices/{id}` | | 204; that device gets 401 `device_revoked` from now on, its mail is dropped |
| `POST /v1/invites` | `{ttl_seconds}` (max 7 days) | 201 `{token, expires}`: one-time token for the same account |
| `GET /v1/vaults` | | `{vaults:[{vault_uuid, display_name}]}` |
| `PUT /v1/vaults/{uuid}` | `{display_name}` | 201 created / 200 renamed (idempotent by UUID) |
| `DELETE /v1/vaults/{uuid}` | | 204, with all objects |
| `GET /v1/vaults/{uuid}/objects/{id}[?max_bytes=N]` | | bytes, `ETag: "<revision>"`; 404 `no_object` if absent |
| `PUT /v1/vaults/{uuid}/objects/{id}` | bytes | 201, `ETag`. Needs `If-None-Match: *` (create) or `If-Match: "<rev>"` (replace); else 412 |
| `POST /v1/vaults/{uuid}/collect` | `{minimum_retained_epoch}` | `{deleted}` |
| `POST /v1/messages` | `{to_device, kind, data}` (≤ 64 KiB) | 201 `{id}` |
| `GET /v1/messages` / `DELETE /v1/messages/{id}` | | own mailbox |

Object rules: `{id}` is `head`, `roster`, or 64 lowercase hex. A hex object must equal SHA-256 of its body, is create-only and needs `X-Retention-Epoch`; collection deletes hex objects whose epoch is below the floor and never touches `head`/`roster`. Revisions are random and change on every write. Accounts are isolated; a per-account byte quota applies (default 1 GiB).

Registration tokens come from the admin CLI (`corvid-sync-server token --account NAME`) or from an existing device (`/v1/invites`). A token only gives server access; the vault key comes from section 4.

## 4. Devices and keys (Corvid additions)
**Roster.** Object `roster` (role 16, same encryption as `head`): JSON `{"version":n,"devices":[{"device_id","name","public_key","added_by","revoked"}]}`, replaced with compare-and-swap, `version` +1 per change. A device remembers the highest version it has seen and rejects lower ones (rollback). The roster, not the server's device list, decides whose rotation messages are trusted.

**Pairing** (new device approved from a trusted device):
1. Approver gets an invite token and makes a random 32-byte `pair_secret`. Invite code: `token "~" base64url(pair_secret) "~" approver_device_id` (QR or text; the secret never reaches the server).
2. New device registers with the token and mails the approver `pair-request {"proof": HMAC-SHA256(pair_secret, "corvid-sync-v1/pair-request" || new_pub)}`.
3. Both show `code = BE64(HMAC-SHA256(pair_secret, "corvid-sync-v1/comparison-code" || approver_pub || new_pub)[0:8]) mod 10^6` as 6 digits. The user checks they match.
4. Approver adds the device to the roster and mails a `vault-key` envelope (below) with `salt = pair_secret`. The new device opens it, then must find itself in the roster.

**Envelope** (`kind` = `vault-key` or `vault-rotate`): `k = HKDF-SHA256(X25519(own_priv, peer_pub), salt, info = "corvid-sync-v1/envelope/" kind "/" || sender_pub || recipient_pub, 32)`; message = `nonce(12) || AES-256-GCM(k, nonce, JSON {vault_uuid, vault_key, display_name, replaces_uuid?}, ad = "corvid-sync-v1/envelope/" kind)`.

**Recovery key** = the vault key, written `CVK1-` + base32 (RFC 4648, no padding) of `vault_key || SHA-256(vault_key)[0:2]`, in groups of 5. The 2-byte checksum catches typos. Recovery: register with an admin token, try the key on each vault's `head`, add self to the roster. There is no server-side copy of the key in any form.

**Revocation.** A device revokes another (`DELETE /v1/devices/{id}`) and marks it revoked in the roster, pulls the latest state, then **rotates**: new vault UUID and key, snapshot of the merged state, roster without the revoked device, a `vault-rotate` envelope to every remaining device with `salt = HMAC-SHA256(old_vault_key, "corvid-sync-v1/rotate" || old_vault_uuid)` and `replaces_uuid` = old UUID, then deletes the old vault and shows a new recovery key. A receiver accepts only if the sender is an active entry in its last authenticated roster, the envelope opens with its own old key, and `replaces_uuid` is its current vault. It then re-publishes all records it knows into the new vault, so nothing written in between is lost.

## 5. Test vectors and tests
- `client/gcmsiv/testdata/rfc8452.json`: the 26 AES-256-GCM-SIV vectors of RFC 8452 C.2 and C.3.
- `protocol/vectors-vault.json`: key derivation, associated data and containers for each role; commit chain with object IDs.
- `protocol/vectors-pairing.json`: recovery key, pairing proof, comparison code, both envelope kinds.
- `go test ./...` in `sync/`; `CORVID_SYNC_SERVER_BIN=<binary>` runs the end-to-end tests against the built binary; `CORVID_PROTOC` + `CORVID_VAULT_PROTO` compare the encoding with protoc.

## 6. Not in version 1
Change notifications (clients poll `head`); an admin page (metadata only); Postgres; the browser transport (phase 7: a `SyncVaultTransport` for this API, smallest patch); per-type payloads beyond `corvid-kv-v1`.
