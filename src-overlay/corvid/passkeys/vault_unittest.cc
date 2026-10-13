// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT / UNRUN. Tests the vault FORMAT LOGIC against a fake, non-cryptographic VaultCrypto so it does not depend on
// Argon2 being vendored. It mirrors the checks in reference/test/vault.test.ts. Real-primitive and TS cross-compat
// tests are a separate step (see docs/notes/g4-spec.md).
#include "corvid/passkeys/vault.h"

#include <functional>

#include "base/base64url.h"
#include "base/json/json_reader.h"
#include "base/json/json_writer.h"
#include "base/values.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace corvid::passkeys {
namespace {

// Deterministic fake: "encryption" is XOR with a key-derived stream plus a keyed tag over (nonce, aad, plaintext).
// NOT secure; only lets us test that AAD, key and tampering are enforced by the Vault logic.
class FakeCrypto : public VaultCrypto {
 public:
  std::optional<Bytes> Argon2id(const std::string& pw, const Bytes& salt, uint32_t m, uint32_t t, uint32_t p) override {
    return Mix(Bytes(pw.begin(), pw.end()), salt, {static_cast<uint8_t>(m), static_cast<uint8_t>(t), static_cast<uint8_t>(p)});
  }
  Bytes HkdfSha256(const Bytes& ikm, const Bytes& salt, const std::string& info, size_t len) override {
    Bytes out = Mix(ikm, salt, Bytes(info.begin(), info.end()));
    out.resize(len, 7);
    return out;
  }
  Bytes Seal(const Bytes& key, const Bytes& nonce, const Bytes& aad, const Bytes& pt) override {
    Bytes ct = pt;
    for (size_t i = 0; i < ct.size(); i++) ct[i] ^= key[i % key.size()] ^ nonce[i % nonce.size()];
    Bytes tag = Mix(key, nonce, aad);
    Bytes ptag = Mix(pt, tag, {});
    ct.insert(ct.end(), ptag.begin(), ptag.end());
    return ct;
  }
  std::optional<Bytes> Open(const Bytes& key, const Bytes& nonce, const Bytes& aad, const Bytes& ct) override {
    if (ct.size() < 32) return std::nullopt;
    Bytes body(ct.begin(), ct.end() - 32), tag(ct.end() - 32, ct.end());
    for (size_t i = 0; i < body.size(); i++) body[i] ^= key[i % key.size()] ^ nonce[i % nonce.size()];
    if (Mix(body, Mix(key, nonce, aad), {}) != tag) return std::nullopt;
    return body;
  }
  Bytes Random(size_t n) override {
    Bytes out(n);
    for (auto& b : out) b = static_cast<uint8_t>(counter_++ * 37 + 11);
    return out;
  }

 private:
  static Bytes Mix(const Bytes& a, const Bytes& b, const Bytes& c) {
    Bytes out(32, 0x5a);
    size_t i = 0;
    for (const Bytes* part : {&a, &b, &c})
      for (uint8_t x : *part) { out[i % 32] = static_cast<uint8_t>((out[i % 32] * 31 + x + i) & 0xff); i++; }
    return out;
  }
  uint32_t counter_ = 1;
};

const KdfParams kFast{8 * 1024, 2, 1};

Credential Cred(const std::string& id) {
  Credential c;
  c.id = id; c.rp_id = "example.com"; c.user_handle = "dXNlcg"; c.user_name = "u"; c.display_name = "U";
  c.private_key = "SECRET-PRIVATE-KEY-MARKER-" + id; c.created_at = 1;
  return c;
}

std::unique_ptr<Vault> NewVault(FakeCrypto* c, const std::string& pw = "correct horse") {
  Vault::CreateOptions o; o.passphrase = pw; o.kdf = kFast;
  std::unique_ptr<Vault> v;
  EXPECT_EQ(Vault::Create(c, o, &v), VaultError::kOk);
  return v;
}

base::Value::Dict Parse(const std::string& s) {
  std::optional<base::Value> v = base::JSONReader::Read(s);
  EXPECT_TRUE(v && v->is_dict());
  return std::move(*v).TakeDict();
}

TEST(CorvidVaultTest, RoundtripPersistsCredentials) {
  FakeCrypto c;
  auto v = NewVault(&c);
  ASSERT_EQ(v->Add(Cred("a")), VaultError::kOk);
  std::string file = v->Serialize();
  std::unique_ptr<Vault> w;
  Vault::OpenOptions oo; oo.passphrase = "correct horse";
  ASSERT_EQ(Vault::Open(&c, file, oo, &w), VaultError::kOk);
  ASSERT_NE(w->Get("a"), nullptr);
  EXPECT_EQ(w->Get("a")->rp_id, "example.com");
  EXPECT_EQ(w->revision(), 1u);
}

TEST(CorvidVaultTest, FileHasNoPlaintext) {
  FakeCrypto c;
  auto v = NewVault(&c, "pw-plaintext-check");
  v->Add(Cred("a"));
  std::string file = v->Serialize();
  for (const char* needle : {"SECRET-PRIVATE-KEY-MARKER", "example.com", "pw-plaintext-check", "userName"})
    EXPECT_EQ(file.find(needle), std::string::npos) << needle;
}

TEST(CorvidVaultTest, WrongOrMissingSecretRejected) {
  FakeCrypto c;
  auto v = NewVault(&c, "right");
  std::string file = v->Serialize();
  std::unique_ptr<Vault> w;
  Vault::OpenOptions wrong; wrong.passphrase = "wrong";
  EXPECT_EQ(Vault::Open(&c, file, wrong, &w), VaultError::kAuthFailed);
  EXPECT_EQ(Vault::Open(&c, file, {}, &w), VaultError::kLocked);
}

TEST(CorvidVaultTest, TamperingWithAnyFieldRejected) {
  FakeCrypto c;
  auto v = NewVault(&c);
  v->Add(Cred("a"));
  base::Value::Dict good = Parse(v->Serialize());
  Vault::OpenOptions oo; oo.passphrase = "correct horse";

  auto flip = [](const std::string& b64) {
    std::string raw; base::Base64UrlDecode(b64, base::Base64UrlDecodePolicy::DISALLOW_PADDING, &raw);
    raw[0] ^= 1; std::string out; base::Base64UrlEncode(raw, base::Base64UrlEncodePolicy::OMIT_PADDING, &out);
    return out;
  };
  for (const char* key : {"body", "wrappedKey", "bodyNonce", "wrapNonce"}) {
    base::Value::Dict f = good.Clone();
    f.Set(key, flip(*f.FindString(key)));
    std::unique_ptr<Vault> w;
    EXPECT_EQ(Vault::Open(&c, base::WriteJson(f).value(), oo, &w), VaultError::kAuthFailed) << key;
  }
  {  // revision and kdf salt are bound by the AAD
    base::Value::Dict f = good.Clone();
    f.Set("revision", 99);
    std::unique_ptr<Vault> w;
    EXPECT_EQ(Vault::Open(&c, base::WriteJson(f).value(), oo, &w), VaultError::kAuthFailed);
    base::Value::Dict g = good.Clone();
    g.FindDict("kdf")->Set("salt", flip(*g.FindDict("kdf")->FindString("salt")));
    EXPECT_EQ(Vault::Open(&c, base::WriteJson(g).value(), oo, &w), VaultError::kAuthFailed);
  }
}

TEST(CorvidVaultTest, KdfFloorAndShapeEnforced) {
  FakeCrypto c;
  Vault::CreateOptions o; o.passphrase = "x"; o.kdf = {1024, 1, 1};
  std::unique_ptr<Vault> v;
  EXPECT_EQ(Vault::Create(&c, o, &v), VaultError::kKdfTooWeak);

  auto good = NewVault(&c);
  base::Value::Dict f = Parse(good->Serialize());
  f.FindDict("kdf")->Set("m", 1024);  // downgrade by file edit
  std::unique_ptr<Vault> w;
  Vault::OpenOptions oo; oo.passphrase = "correct horse";
  EXPECT_EQ(Vault::Open(&c, base::WriteJson(f).value(), oo, &w), VaultError::kKdfTooWeak);
  EXPECT_EQ(Vault::Open(&c, "not json", oo, &w), VaultError::kBadFormat);
}

TEST(CorvidVaultTest, SerializeBumpsRevisionWithFreshNonces) {
  FakeCrypto c;
  auto v = NewVault(&c);
  base::Value::Dict a = Parse(v->Serialize()), b = Parse(v->Serialize());
  EXPECT_EQ(v->revision(), 2u);
  EXPECT_NE(*a.FindString("bodyNonce"), *b.FindString("bodyNonce"));
  EXPECT_NE(*a.FindString("wrapNonce"), *b.FindString("wrapNonce"));
}

TEST(CorvidVaultTest, LockZeroesAndBlocks) {
  FakeCrypto c;
  auto v = NewVault(&c);
  v->Add(Cred("a"));
  v->Lock();
  EXPECT_TRUE(v->locked());
  EXPECT_EQ(v->Add(Cred("b")), VaultError::kLocked);
  EXPECT_EQ(v->Get("a"), nullptr);
  EXPECT_TRUE(v->Serialize().empty());
}

TEST(CorvidVaultTest, KeyringModesNeedTheSecret) {
  FakeCrypto c;
  Vault::CreateOptions o; o.mode = UnlockMode::kPassphraseAndKeyring; o.passphrase = "pw"; o.kdf = kFast;
  std::unique_ptr<Vault> v; Bytes ks;
  ASSERT_EQ(Vault::Create(&c, o, &v, &ks), VaultError::kOk);
  ASSERT_EQ(ks.size(), 32u);
  std::string file = v->Serialize();
  std::unique_ptr<Vault> w;
  Vault::OpenOptions no_ks; no_ks.passphrase = "pw";
  EXPECT_EQ(Vault::Open(&c, file, no_ks, &w), VaultError::kKeyringMissing);
  Vault::OpenOptions with_ks = no_ks; with_ks.keyring_secret = ks;
  EXPECT_EQ(Vault::Open(&c, file, with_ks, &w), VaultError::kOk);
}

}  // namespace
}  // namespace corvid::passkeys
