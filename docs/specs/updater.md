# Updater design (task 3.4)

Status: DESIGN. The manifest verification logic is implemented and unit-tested as a reference in `src-overlay/corvid/windows/updater/manifest.mjs` (12 tests passing on Linux/Node 22). The C++ updater, scheduled task, and installer integration are NOT built and UNVERIFIED.

## Goals
No Google Update (Omaha). No default server and no network traffic unless an update server is configured. Every update verifiable offline from a signed manifest. Safe against: tampered artifacts, tampered manifests, replayed/old manifests, frozen (stale) manifests, downgrade, cross-origin redirection, and bad releases (automatic rollback).

## Configuration
- `branding/config.toml` `urls.update_server` (empty by default => updater is inert, installer registers no task). Overridable per machine by policy value `HKLM\Software\Policies\Corvid\UpdateServer` and per user in Settings. Channel: `stable` default (`beta` etc. = separate manifests).
- Trusted keyring is compiled into the binary: list of `{keyId, Ed25519 public key, notAfter, revoked}` and a `threshold`. Key rotation ships in a normal update signed by both old and new key (`threshold` can be raised to 2 for rotation windows). Manifest signing key is separate from Authenticode and never on the build host (see `docs/security/code-signing.md`).

## Manifest format (schema 1)
Envelope (JSON): `{"payload": "<base64url bytes>", "signatures": [{"keyid", "sig"}]}`. The signature is Ed25519 over `"corvid-update-manifest-v1\0" || payload_bytes`; signing exact bytes avoids canonical-JSON ambiguity. The payload is parsed only after verification.

Payload: `schema, channel, sequence (monotonic int), issued_at, expires_at, releases[], revoked_versions[]?`
Release: `version, platform ("windows-x64"), url (https, same origin as server), sha256 (hex), size, min_from?, rollout? (0-100), notes_url?`.

## Client algorithm (reference: `verifyManifest`, `selectUpdate`, `verifyArtifact`, `rollbackDecision`)
1. GET `<server>/<channel>/<platform>/manifest.json` (HTTPS only, no cookies, no query string, no identifiers beyond the User-Agent product token; the installed version is NOT sent; zero telemetry). Max envelope 256 KiB.
2. Verify at least `threshold` distinct valid, non-revoked, non-expired keys. Reject: bad signature, wrong channel, `issued_at` more than 5 min in future, `expires_at` passed (freeze guard; publisher re-signs at least every TTL, default 14 days), `sequence` lower than the last accepted (persisted; replay/rollback guard).
3. Choose the highest release for this platform allowed by staged rollout (device bucket = stable per-install random 0-99, generated locally, never transmitted). Never install a version <= installed (no downgrades via manifest). Respect `min_from` (stepping stones for migrations). Reject non-https, userinfo, or cross-origin URLs unless the admin sets `allowCrossOrigin`.
4. Download to a temp dir with size cap = signed `size`; verify size and SHA-256 against the signed values before execution. Then (when signing is adopted) also verify Authenticode and that the signer matches the pinned publisher; Authenticode is defense in depth, the manifest signature is the primary trust root.
5. Install via `setup.exe` in-place update (versioned directories). Persist `previous` and `sequence`.
6. Persist accepted `sequence` only after a fully verified manifest.

## Rollback
Versioned layout `Application\<ver>\` keeps the previous version until the new one is confirmed healthy. "Healthy" = browser ran >= 60 s with a rendered tab and exited cleanly, or 3 launches without crash. If 2 crashes occur or `graceLaunches` (default 3) pass without healthy confirmation, `rollbackDecision` selects rollback: launcher switches to `previous`, the bad version is added to a local blacklist so it is not re-offered until a newer one appears. Server-side `revoked_versions` forces the same on already-installed bad releases (updater treats them as "not newer-eligible" and prompts update to the next safe release).

## Process model
`corvid_updater.exe`: small, separate from the browser. Per-user: scheduled task at logon + every 5 h with jitter (current user, no elevation). Per-machine: SYSTEM scheduled task, installs per-machine builds only; never auto-elevates per-user ones. Browser can also trigger "Check now" from Settings (WebUI page, strings via i18n catalog). No background service, no always-on process.

## Privacy
Idle capture rule: with no server configured => zero requests. With a server => only the manifest GET (and artifact GET when updating) to that host; no IDs, no OS fingerprint beyond what TLS/HTTP inherently reveals. Documented in `docs/network-allowlist.md` (Phase 1 owner) as "update server: user-configured".

## Publisher side
`make-manifest.mjs --artifact ... --key <pem> --key-id <id>` (invoked by `scripts/package.ps1 -ManifestKeyFile`). Static hosting is enough (any HTTPS file server or object store). Never generate or store the key without the user's instruction.

## Tests
Reference vectors: `manifest.test.mjs` (tamper, unknown/revoked/expired key, threshold with duplicate signature, freeze, future issue, replay, channel, schema, size limit, downgrade, https/origin, rollout, `min_from`, artifact hash/size, rollback). The C++ port must pass the same vectors (export envelopes to JSON fixtures when porting). Integration (UNVERIFIED): `tests/acceptance/phase-3/02-installer-lifecycle.ps1` update step, plus a local HTTPS test server.

## Open
Delta updates (not planned); winget/store channels would bypass this updater (depends on distribution decision); arm64 manifests (`windows-arm64`) only if arm64 is approved.
