// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// P-256 / SHA-256 for the passkey authenticator core, on BoringSSL.
#ifndef CORVID_PASSKEYS_CRYPTO_P256_BORINGSSL_H_
#define CORVID_PASSKEYS_CRYPTO_P256_BORINGSSL_H_

#include <memory>

#include "corvid/passkeys/authenticator_core.h"

namespace corvid::passkeys {
std::unique_ptr<AuthenticatorCrypto> CreateBoringSslAuthenticatorCrypto();
}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_CRYPTO_P256_BORINGSSL_H_
