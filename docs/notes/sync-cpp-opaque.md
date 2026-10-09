# Sync in C++ (in-process): can the client do OPAQUE in Chromium?

Date: 2026-10-09. Decision (user): the sync engine runs in-process in C++; the Go engine in `src-overlay/corvid/sync/` stays as the reference oracle, with shared vectors in `src-overlay/corvid/sync/testvectors/vectors.json` (regenerate/verify: `go test -run Vectors [-update]`).

## What was verified and what was not
I have no Chromium tree and `chromium.googlesource.com` is blocked by the sandbox proxy. I cloned **google/boringssl** (shallow, today's HEAD) and grepped its public headers. Everything about Chromium's own `third_party/` is from memory and **UNVERIFIED**; check it first thing on the build host.

Verified in BoringSSL headers (`include/openssl/`):
- `EVP_aead_xchacha20_poly1305()` exists (aead.h). Our record cipher is available. HKDF exists in `crypto/hkdf`.
- X25519 / Ed25519 exist (curve25519.h). Our recovery signature and key agreement primitives are available.
- **No ristretto255**, **no Argon2** in BoringSSL.
- RFC 9380 hash-to-curve exists only for **P-256 and P-384** (`EC_hash_to_curve_p256_xmd_sha256_sswu`, ec.h). `trust_token` has a VOPRF over P-384 but it is internal to the Trust Tokens method, not a general OPRF API. `spake2plus` exists (P-256) but it is a different protocol.
- **No OPAQUE** in BoringSSL.
- NaCl "sealed box" (X25519 + XSalsa20-Poly1305 + blake2b nonce) is not in BoringSSL; we use it for key packages.

From memory, unverified: Chromium has `third_party/argon2` (reference Argon2 used for Sync custom-passphrase key derivation), and no OPAQUE implementation in the tree.

## Gaps for a C++ port, in order of risk
1. **OPAQUE client (high risk).** Nothing in Chromium/BoringSSL implements it. The current server uses `bytemare/opaque` with the default suite (ristretto255-SHA512, Argon2id KSF). Writing OPAQUE (3DH, OPRF, envelope, masking) by hand is exactly what AGENTS rules forbid ("no hand-rolled primitives") and is a large audit surface.
2. **ristretto255** is not in BoringSSL. Avoided if we switch suites (below).
3. **NaCl sealed box**: small to assemble from X25519 + HKDF + XChaCha20-Poly1305, but then it is a custom construction and the Go side must change to the same one (use HPKE instead, see below).
4. Argon2id (needed by the OPAQUE KSF on the client): `third_party/argon2` if present; else vendor the reference implementation (CC0/Apache-2.0).

## Options
A. **Switch the OPAQUE suite to P256-SHA256** (RFC 9807 defines it; `bytemare/opaque` supports it): lets a C++ client use BoringSSL P-256 + hash-to-curve + HKDF + our own thin protocol glue. Still a hand-written OPAQUE state machine in C++ (risk 1 remains), but primitives come from BoringSSL. The Go server and oracle change one configuration line; vectors must then include OPAQUE transcripts (generate with fixed randomness via the library's test options).
B. **Rust OPAQUE client via `opaque-ke`** (Apache-2.0/MIT, NCC Group audit published 2021) bridged to C++ through Chromium's Rust support (needs the crate vendored under `third_party/rust` with review, and a cxx/FFI shim). Best assurance; costs a Rust dependency in a build-critical path and a second language in the sync code. Server would then also gain an audited counterpart (`opaque-ke` is server-capable) at the cost of rewriting the server in Rust or interop-testing against bytemare (RFC 9807 vectors make interop checkable).
C. **Drop OPAQUE for an Argon2id-derived auth key** (Bitwarden-style): trivial in C++ with BoringSSL + Argon2, but the server can then brute-force a stolen database offline, and it reverses the property the threat model relies on (T1/T2). Only acceptable if the user explicitly trades this away.
D. **Keep a Go sidecar** (rejected by the user; listed for completeness). 

## Recommendation (not a decision)
Prefer **B** if the Rust toolchain is already part of the Corvid build (Chromium ships one); otherwise **A**. Either way: first spike = a C++ test that runs the RFC 9807 test vectors for the chosen suite and then a full login against the existing Go server in CI. Do not start the C++ port of the record layer before this spike, because it determines the wire suite (and so the Go side and vectors). Estimated risk: OPAQUE client = high; record layer, HLC/merge, bookmark tree = low (vectors exist); key packages = medium until HPKE vs sealed box is chosen.

## Changes this implies on the Go side (not done yet)
- Replace NaCl sealed boxes with RFC 9180 HPKE (DHKEM(X25519), HKDF-SHA256, ChaCha20-Poly1305 or XChaCha via export): BoringSSL has `EVP_HPKE`. Go 1.24+ has `crypto/hpke`? (unverified; otherwise `cloudflare/circl`, BSD-3). Regenerate vectors afterwards.
- Possibly OPAQUE suite change (option A).
