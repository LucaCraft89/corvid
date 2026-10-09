# Passkey authenticator: security design and review checklist

Status: design + verified reference implementation (`src-overlay/corvid/passkeys/reference/`, 28 passing tests). The Chromium C++ port is UNVERIFIED and uncompiled. Complete the checklist below before any release.

## Assets and threats
| Asset | Threat | Mitigation |
|---|---|---|
| Credential private keys | Disk theft, backup leak, malware reading profile | AEAD-sealed vault; key never written plaintext; KEK from Argon2id passphrase and/or OS keyring secret |
| Vault integrity | Offline edit, KDF downgrade, rollback to older file | AEAD with header as AAD; KDF floor and ceiling enforced before derivation; authenticated monotonic revision + stored high-water mark |
| Passphrase | Brute force of stolen vault | Argon2id (default m=64 MiB, t=3, p=1; configurable, floor m>=8 MiB, t>=2) |
| Unlocked session | Other local software/user | Auto-lock after idle (default 5 min, configurable), lock on screen lock (TODO in C++), UI never receives private keys |
| Cross-origin use | Phishing site using credentials | rpId scoping in `getAssertion`; origin to rpId validation stays in Chromium's WebAuthn layer (unchanged) |
| Existence oracle | Probing which credentials exist | excludeList path still demands user presence before returning CREDENTIAL_EXCLUDED |

## Cryptographic construction (as implemented)
- Libraries: `@noble/hashes` 1.8.0 (Argon2id, HKDF, SHA-256), `@noble/ciphers` 1.3.0 (XChaCha20-Poly1305), `@noble/curves` 1.9.2 (P-256). All MIT, independently audited (Cure53). No hand-rolled primitives.
- `KEK = HKDF-SHA256(ikm = argon2id(pass) || keyringSecret?, salt, info = "corvid-vault-kek-v1:" + mode)`.
- Random 32-byte vault key wrapped by KEK; body sealed by vault key; fresh 24-byte nonces each save; AAD = canonical header (version, mode, KDF params, salt, revision).
- Wrong secret and tampering are intentionally indistinguishable (`auth-failed`).
- Chromium port: BoringSSL has XChaCha20-Poly1305 but no Argon2. Needs an Argon2 implementation compatible with the BSD/MIT/Apache rule (Chromium's `third_party/argon2` is CC0/Apache-2.0: verify it is present in the pinned tree). The file format must stay byte-compatible with the reference so both implementations cross-test.

## Known gaps (explicit)
1. JS/C++ cannot guarantee memory zeroization; reference wipes buffers best-effort. Native port should use `OPENSSL_cleanse`/`base::SecureZero`-style wipes and `mlock` where available.
2. No hmac-secret/PRF, EdDSA, RS256 yet (ES256 only; attestation "none", zero AAGUID).
3. Backup/import uses Corvid's vault format, not FIDO CXP/CXF (not stable). Revisit when CXF is final.
4. Rollback high-water mark lives next to the vault, so an attacker with full profile write access can reset it. It defends against partial restores (e.g. sync/backup tooling), not a local root attacker. A local attacker with profile write access can also read process memory; out of scope.
5. DECIDED 2026-10-09: OS keyring (Secret Service/libsecret) is the default unlock secret; passphrase is an optional extra (`passphrase+keyring`) or the fallback when no keyring exists. All three modes are implemented and tested. Residual risk: with keyring-only, any process running as the same user that can read the keyring can open the vault; the optional passphrase mitigates this.
6. Linux user verification: currently equals vault unlock recency. polkit/fprintd UV is future work.
7. DECIDED 2026-10-09 (CR-5, option A): hybrid uses the existing upstream relays only on explicit user click, never at idle; user setting turns it off; warning shown (relay operator sees a connection and the IP; payload E2E encrypted). See docs/notes/hybrid-tunnel.md. Gate: hybrid-policy.ts (tested); wiring into Chromium UNVERIFIED.
8. Google enclave authenticator is gated off by patch 2004 (UNVERIFIED sketch).
9. Sync (Phase 4) must encrypt credentials client-side with a key not derivable by the server; hooks not yet defined beyond the file format being self-contained.

## Review checklist (tick before release)
- [ ] Independent review of `vault.ts` / C++ port equivalence with cross-implementation test vectors.
- [ ] Fuzz `Vault::Open` with malformed JSON and oversized fields (reference rejects non-integer/out-of-range KDF; confirm in C++).
- [ ] Confirm file mode 0600, atomic replace (tmp + fsync + rename + dir fsync), no temp-file plaintext.
- [ ] Confirm no logging of passphrase, keys, credential ids, or rpIds (diagnostics redaction applies to exports).
- [ ] Confirm passkeys WebUI is bound only to `corvid://passkeys` and never serves private keys over Mojo (API returns `PublicCredential` only; unit-tested).
- [ ] Idle network capture clean with the passkeys page open (no Google enclave traffic).
- [ ] Hybrid: contacted hosts appear only after the click, never at idle; setting off disables it; warning shown first (CR-5 resolved).
- [ ] Conditional UI and hardware-key preference verified (see tests/acceptance/phase-2/passkeys-manual.md).
