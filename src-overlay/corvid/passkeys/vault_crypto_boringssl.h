// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT. Real VaultCrypto: BoringSSL (HKDF, XChaCha20-Poly1305, RAND) + vendored reference Argon2 (third_party/argon2,
// NOT in the tree yet; the vendoring is a separate step: Apache-2.0 side of the CC0/Apache-2.0 dual license, approved by
// Luca 2026-10-10, record in docs/PATCH-PROVENANCE.md).
#ifndef CORVID_PASSKEYS_VAULT_CRYPTO_BORINGSSL_H_
#define CORVID_PASSKEYS_VAULT_CRYPTO_BORINGSSL_H_

#include <memory>

#include "corvid/passkeys/vault.h"

namespace corvid::passkeys {
std::unique_ptr<VaultCrypto> CreateBoringSslVaultCrypto();
}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_VAULT_CRYPTO_BORINGSSL_H_
