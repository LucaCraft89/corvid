// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT (G4). Uses only BoringSSL APIs present in third_party/boringssl (verify header paths on the tree).
#include "corvid/passkeys/authenticator_crypto_boringssl.h"

#include "third_party/boringssl/src/include/openssl/bn.h"
#include "third_party/boringssl/src/include/openssl/ec.h"
#include "third_party/boringssl/src/include/openssl/ec_key.h"
#include "third_party/boringssl/src/include/openssl/ecdsa.h"
#include "third_party/boringssl/src/include/openssl/nid.h"
#include "third_party/boringssl/src/include/openssl/rand.h"
#include "third_party/boringssl/src/include/openssl/sha.h"

namespace corvid::passkeys {
namespace {

class Impl : public AuthenticatorCrypto {
 public:
  KeyPair GenerateP256() override {
    bssl::UniquePtr<EC_KEY> key(EC_KEY_new_by_curve_name(NID_X9_62_prime256v1));
    KeyPair kp;
    if (!key || !EC_KEY_generate_key(key.get())) return kp;  // empty = failure; core maps to kInvalidParameter
    kp.private_key.resize(32);
    if (!BN_bn2bin_padded(kp.private_key.data(), 32, EC_KEY_get0_private_key(key.get()))) return KeyPair{};
    kp.public_key.resize(65);
    if (EC_POINT_point2oct(EC_KEY_get0_group(key.get()), EC_KEY_get0_public_key(key.get()),
                           POINT_CONVERSION_UNCOMPRESSED, kp.public_key.data(), 65, nullptr) != 65)
      return KeyPair{};
    return kp;
  }

  Bytes SignEs256Der(const Bytes& private_key, const Bytes& message) override {
    if (private_key.size() != 32) return {};
    bssl::UniquePtr<EC_KEY> key(EC_KEY_new_by_curve_name(NID_X9_62_prime256v1));
    bssl::UniquePtr<BIGNUM> d(BN_bin2bn(private_key.data(), 32, nullptr));
    if (!key || !d || !EC_KEY_set_private_key(key.get(), d.get())) return {};
    // ECDSA_sign needs the public key set only for some verification paths; derive it to keep the key consistent.
    bssl::UniquePtr<EC_POINT> pub(EC_POINT_new(EC_KEY_get0_group(key.get())));
    if (!pub || !EC_POINT_mul(EC_KEY_get0_group(key.get()), pub.get(), d.get(), nullptr, nullptr, nullptr) ||
        !EC_KEY_set_public_key(key.get(), pub.get()))
      return {};
    Bytes digest = Sha256(message);
    Bytes sig(ECDSA_size(key.get()));
    unsigned len = 0;
    if (!ECDSA_sign(0, digest.data(), digest.size(), sig.data(), &len, key.get())) return {};
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
    RAND_bytes(out.data(), n);
    return out;
  }
};

}  // namespace

std::unique_ptr<AuthenticatorCrypto> CreateBoringSslAuthenticatorCrypto() { return std::make_unique<Impl>(); }

}  // namespace corvid::passkeys
