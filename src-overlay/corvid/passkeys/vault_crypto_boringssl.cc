// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// Built and tested on the 155 tree (vault_crypto_boringssl_unittest.cc). Original note: verify on the tree: EVP_aead_xchacha20_poly1305 (openssl/aead.h), HKDF (openssl/hkdf.h), crypto::RandBytes
// (crypto/random.h), and the vendored Argon2 header/function (argon2id_hash_raw in the reference implementation's
// argon2.h; the include path below is a guess).
#include "corvid/passkeys/vault_crypto_boringssl.h"

#include <utility>

#include "base/check.h"
#include "crypto/random.h"
#include "third_party/argon2/include/argon2.h"
#include "third_party/boringssl/src/include/openssl/aead.h"
#include "third_party/boringssl/src/include/openssl/digest.h"
#include "third_party/boringssl/src/include/openssl/hkdf.h"

namespace corvid::passkeys {

namespace {

class BoringSslVaultCrypto : public VaultCrypto {
 public:
  std::optional<Bytes> Argon2id(const std::string& password, const Bytes& salt, uint32_t m, uint32_t t,
                                uint32_t p) override {
    Bytes out(32);
    int rc = argon2id_hash_raw(t, m, p, password.data(), password.size(), salt.data(), salt.size(), out.data(),
                               out.size());
    if (rc != ARGON2_OK) return std::nullopt;
    return out;
  }

  Bytes HkdfSha256(const Bytes& ikm, const Bytes& salt, const std::string& info, size_t len) override {
    Bytes out(len);
    CHECK(HKDF(out.data(), out.size(), EVP_sha256(), ikm.data(), ikm.size(), salt.data(), salt.size(),
               reinterpret_cast<const uint8_t*>(info.data()), info.size()));
    return out;
  }

  Bytes Seal(const Bytes& key, const Bytes& nonce, const Bytes& aad, const Bytes& plaintext) override {
    bssl::ScopedEVP_AEAD_CTX ctx;
    CHECK(EVP_AEAD_CTX_init(ctx.get(), EVP_aead_xchacha20_poly1305(), key.data(), key.size(),
                            EVP_AEAD_DEFAULT_TAG_LENGTH, nullptr));
    Bytes out(plaintext.size() + EVP_AEAD_max_overhead(EVP_aead_xchacha20_poly1305()));
    size_t out_len = 0;
    CHECK(EVP_AEAD_CTX_seal(ctx.get(), out.data(), &out_len, out.size(), nonce.data(), nonce.size(), plaintext.data(),
                            plaintext.size(), aad.data(), aad.size()));
    out.resize(out_len);
    return out;
  }

  std::optional<Bytes> Open(const Bytes& key, const Bytes& nonce, const Bytes& aad, const Bytes& ct) override {
    bssl::ScopedEVP_AEAD_CTX ctx;
    if (!EVP_AEAD_CTX_init(ctx.get(), EVP_aead_xchacha20_poly1305(), key.data(), key.size(),
                           EVP_AEAD_DEFAULT_TAG_LENGTH, nullptr))
      return std::nullopt;
    Bytes out(ct.size());
    size_t out_len = 0;
    if (!EVP_AEAD_CTX_open(ctx.get(), out.data(), &out_len, out.size(), nonce.data(), nonce.size(), ct.data(),
                           ct.size(), aad.data(), aad.size()))
      return std::nullopt;
    out.resize(out_len);
    return out;
  }

  Bytes Random(size_t n) override {
    Bytes out(n);
    crypto::RandBytes(out);
    return out;
  }
};

}  // namespace

std::unique_ptr<VaultCrypto> CreateBoringSslVaultCrypto() { return std::make_unique<BoringSslVaultCrypto>(); }

}  // namespace corvid::passkeys
