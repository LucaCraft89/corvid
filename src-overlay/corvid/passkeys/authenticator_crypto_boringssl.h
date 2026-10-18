// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT (G4). BoringSSL AuthenticatorCrypto: P-256 keygen, ECDSA-SHA256 (DER), SHA-256, RAND_bytes.
#ifndef CORVID_PASSKEYS_AUTHENTICATOR_CRYPTO_BORINGSSL_H_
#define CORVID_PASSKEYS_AUTHENTICATOR_CRYPTO_BORINGSSL_H_

#include <memory>

#include "corvid/passkeys/authenticator_core.h"

namespace corvid::passkeys {
std::unique_ptr<AuthenticatorCrypto> CreateBoringSslAuthenticatorCrypto();
}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_AUTHENTICATOR_CRYPTO_BORINGSSL_H_
