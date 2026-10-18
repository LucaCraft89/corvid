// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "corvid/passkeys/crypto_p256_boringssl.h"

#include <utility>

#include "base/check.h"
#include "base/check_op.h"
#include "crypto/random.h"
#include "third_party/boringssl/src/include/openssl/bn.h"
#include "third_party/boringssl/src/include/openssl/ec.h"
#include "third_party/boringssl/src/include/openssl/ec_key.h"
#include "third_party/boringssl/src/include/openssl/ecdsa.h"
#include "third_party/boringssl/src/include/openssl/nid.h"
#include "third_party/boringssl/src/include/openssl/sha.h"

namespace corvid::passkeys {

namespace {

class BoringSslAuthenticatorCrypto : public AuthenticatorCrypto {
 public:
  KeyPair GenerateP256() override {
    bssl::UniquePtr<EC_KEY> key(EC_KEY_new_by_curve_name(NID_X9_62_prime256v1));
    CHECK(key);
    CHECK(EC_KEY_generate_key(key.get()));
    KeyPair out;
    out.private_key.resize(32);
    CHECK(BN_bn2bin_padded(out.private_key.data(), out.private_key.size(), EC_KEY_get0_private_key(key.get())));
    out.public_key.resize(65);
    const size_t n = EC_POINT_point2oct(EC_KEY_get0_group(key.get()), EC_KEY_get0_public_key(key.get()),
                                        POINT_CONVERSION_UNCOMPRESSED, out.public_key.data(), out.public_key.size(),
                                        nullptr);
    CHECK_EQ(n, 65u);
    return out;
  }

  Bytes SignEs256Der(const Bytes& private_key, const Bytes& message) override {
    bssl::UniquePtr<EC_KEY> key(EC_KEY_new_by_curve_name(NID_X9_62_prime256v1));
    bssl::UniquePtr<BIGNUM> d(BN_bin2bn(private_key.data(), private_key.size(), nullptr));
    CHECK(key && d);
    CHECK(EC_KEY_set_private_key(key.get(), d.get()));
    // The public point is not needed to sign, but BoringSSL's ECDSA checks it is present.
    bssl::UniquePtr<EC_POINT> pub(EC_POINT_new(EC_KEY_get0_group(key.get())));
    CHECK(EC_POINT_mul(EC_KEY_get0_group(key.get()), pub.get(), d.get(), nullptr, nullptr, nullptr));
    CHECK(EC_KEY_set_public_key(key.get(), pub.get()));
    const Bytes digest = Sha256(message);
    Bytes sig(ECDSA_size(key.get()));
    unsigned int len = 0;
    CHECK(ECDSA_sign(0, digest.data(), digest.size(), sig.data(), &len, key.get()));
    sig.resize(len);
    return sig;
  }

  Bytes Sha256(const Bytes& data) override {
    Bytes out(SHA256_DIGEST_LENGTH);
    SHA256(data.data(), data.size(), out.data());
    return out;
  }

  Bytes Random(size_t n) override {
    Bytes out(n);
    crypto::RandBytes(out);
    return out;
  }
};

}  // namespace

std::unique_ptr<AuthenticatorCrypto> CreateBoringSslAuthenticatorCrypto() {
  return std::make_unique<BoringSslAuthenticatorCrypto>();
}

}  // namespace corvid::passkeys
