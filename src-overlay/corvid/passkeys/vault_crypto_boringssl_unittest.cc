// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// The vault with REAL primitives: BoringSSL (HKDF-SHA256, XChaCha20-Poly1305, RAND) and the vendored reference Argon2.
#include "corvid/passkeys/vault_crypto_boringssl.h"

#include <string>

#include "base/strings/string_number_conversions.h"
#include "corvid/passkeys/vault.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace corvid::passkeys {
namespace {

Bytes FromString(const std::string& s) { return Bytes(s.begin(), s.end()); }

Credential Cred(const std::string& id) {
  Credential c;
  c.id = id; c.rp_id = "example.com"; c.user_handle = "dXNlcg"; c.user_name = "u"; c.display_name = "U";
  c.private_key = "SECRET-PRIVATE-KEY-MARKER-" + id; c.created_at = 1;
  return c;
}

TEST(CorvidVaultRealCryptoTest, Argon2idKnownAnswer) {
  // Reference implementation test vector (src/test.c): argon2id v19, t=2, m=65536 KiB, p=1, "password"/"somesalt".
  auto crypto = CreateBoringSslVaultCrypto();
  std::optional<Bytes> out = crypto->Argon2id("password", FromString("somesalt"), 65536, 2, 1);
  ASSERT_TRUE(out.has_value());
  EXPECT_EQ(base::HexEncodeLower(*out), "09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7");
}

TEST(CorvidVaultRealCryptoTest, SealOpenAndTamper) {
  auto crypto = CreateBoringSslVaultCrypto();
  Bytes key = crypto->Random(32), nonce = crypto->Random(24), aad = FromString("aad"), pt = FromString("hello vault");
  Bytes ct = crypto->Seal(key, nonce, aad, pt);
  EXPECT_EQ(ct.size(), pt.size() + 16);
  std::optional<Bytes> back = crypto->Open(key, nonce, aad, ct);
  ASSERT_TRUE(back.has_value());
  EXPECT_EQ(*back, pt);
  Bytes bad = ct; bad[0] ^= 1;
  EXPECT_FALSE(crypto->Open(key, nonce, aad, bad).has_value());
  EXPECT_FALSE(crypto->Open(key, nonce, FromString("other"), ct).has_value());
}

TEST(CorvidVaultRealCryptoTest, HkdfIsDeterministicAndKeyed) {
  auto crypto = CreateBoringSslVaultCrypto();
  Bytes ikm = FromString("ikm"), salt = FromString("salt");
  EXPECT_EQ(crypto->HkdfSha256(ikm, salt, "a", 32), crypto->HkdfSha256(ikm, salt, "a", 32));
  EXPECT_NE(crypto->HkdfSha256(ikm, salt, "a", 32), crypto->HkdfSha256(ikm, salt, "b", 32));
}

TEST(CorvidVaultRealCryptoTest, VaultRoundtripWithRealCrypto) {
  auto crypto = CreateBoringSslVaultCrypto();
  Vault::CreateOptions o; o.passphrase = "correct horse"; o.kdf = kMinKdf;
  std::unique_ptr<Vault> v;
  ASSERT_EQ(Vault::Create(crypto.get(), o, &v), VaultError::kOk);
  ASSERT_EQ(v->Add(Cred("a")), VaultError::kOk);
  std::string file = v->Serialize();
  for (const char* needle : {"SECRET-PRIVATE-KEY-MARKER", "example.com", "correct horse"})
    EXPECT_EQ(file.find(needle), std::string::npos) << needle;
  std::unique_ptr<Vault> w;
  Vault::OpenOptions ok; ok.passphrase = "correct horse";
  ASSERT_EQ(Vault::Open(crypto.get(), file, ok, &w), VaultError::kOk);
  ASSERT_NE(w->Get("a"), nullptr);
  EXPECT_EQ(w->Get("a")->private_key, "SECRET-PRIVATE-KEY-MARKER-a");
  Vault::OpenOptions wrong; wrong.passphrase = "wrong";
  EXPECT_EQ(Vault::Open(crypto.get(), file, wrong, &w), VaultError::kAuthFailed);
}

}  // namespace
}  // namespace corvid::passkeys
