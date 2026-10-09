# Phase 2 dependencies (to merge into docs/PATCH-PROVENANCE.md by the owner of that file)

| Item | License | Used for | Scope |
|---|---|---|---|
| @noble/hashes 1.8.0 | MIT | Argon2id, HKDF, SHA-256 (reference vault, exporter manifest hashes) | reference impl + TS UI core |
| @noble/ciphers 1.3.0 | MIT | XChaCha20-Poly1305 | reference vault |
| @noble/curves 1.9.2 | MIT | P-256 ECDSA | reference authenticator |
| typescript 5.6.3 | Apache-2.0 | typecheck only | dev |
| @types/node 22.10.2 | MIT | typecheck only | dev |

Production Chromium port uses BoringSSL (BSD-style/ISC/OpenSSL-lineage, already in the tree) plus an in-tree Argon2 (verify).
No runtime dependency performs network I/O. `node_modules/` is not committed.
