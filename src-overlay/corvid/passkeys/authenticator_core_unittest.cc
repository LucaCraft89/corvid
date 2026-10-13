// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT / UNRUN. Mirrors reference/test/authenticator.test.ts against fake crypto (layout, flags, policy), not
// real signatures. Real-primitive and TS cross tests are a later step.
#include "corvid/passkeys/authenticator_core.h"

#include "testing/gtest/include/gtest/gtest.h"

namespace corvid::passkeys {
namespace {

class FakeVaultCrypto : public VaultCrypto {
 public:
  std::optional<Bytes> Argon2id(const std::string& pw, const Bytes& salt, uint32_t, uint32_t, uint32_t) override {
    Bytes o(32, 1); for (size_t i = 0; i < pw.size(); i++) o[i % 32] ^= pw[i]; for (size_t i = 0; i < salt.size(); i++) o[i % 32] ^= salt[i]; return o;
  }
  Bytes HkdfSha256(const Bytes& ikm, const Bytes& salt, const std::string&, size_t len) override {
    Bytes o(len, 2); for (size_t i = 0; i < ikm.size(); i++) o[i % len] ^= ikm[i]; for (size_t i = 0; i < salt.size(); i++) o[i % len] ^= salt[i]; return o;
  }
  Bytes Seal(const Bytes&, const Bytes&, const Bytes&, const Bytes& pt) override { return pt; }
  std::optional<Bytes> Open(const Bytes&, const Bytes&, const Bytes&, const Bytes& ct) override { return ct; }
  Bytes Random(size_t n) override { return Bytes(n, 9); }
};

class FakeAuthCrypto : public AuthenticatorCrypto {
 public:
  KeyPair GenerateP256() override {
    KeyPair k; k.private_key = Bytes(32, 0x11); k.public_key.push_back(0x04);
    for (int i = 0; i < 64; i++) k.public_key.push_back(static_cast<uint8_t>(i));
    return k;
  }
  Bytes SignEs256Der(const Bytes& priv, const Bytes& msg) override {
    Bytes s = {0x30, static_cast<uint8_t>(msg.size())}; (void)priv; s.insert(s.end(), msg.begin(), msg.end()); return s;  // echoes message: lets tests see what was signed
  }
  Bytes Sha256(const Bytes& d) override { Bytes o(32, 0); for (size_t i = 0; i < d.size(); i++) o[i % 32] ^= d[i]; return o; }
  Bytes Random(size_t n) override { Bytes o(n); for (size_t i = 0; i < n; i++) o[i] = static_cast<uint8_t>(0xa0 + i); return o; }
};

class Gate : public UserGate {
 public:
  bool Presence(const std::string&, Purpose) override { presence_calls++; return allow_presence; }
  bool Verification() override { uv_calls++; return allow_uv; }
  bool allow_presence = true, allow_uv = true;
  int presence_calls = 0, uv_calls = 0;
};

struct Env {
  FakeVaultCrypto vc; FakeAuthCrypto ac; Gate gate; std::unique_ptr<Vault> vault;
  std::unique_ptr<AuthenticatorCore> core;
  Env() {
    Vault::CreateOptions o; o.passphrase = "pw"; o.kdf = kMinKdf;
    EXPECT_EQ(Vault::Create(&vc, o, &vault), VaultError::kOk);
    core = std::make_unique<AuthenticatorCore>(vault.get(), &gate, &ac);
  }
};

MakeCredentialRequest MakeReq(bool rk = true, bool uv = false) {
  MakeCredentialRequest r;
  r.rp_id = "example.com"; r.client_data_hash = Bytes(32, 3); r.user_handle = {1, 2, 3}; r.user_name = "u";
  r.display_name = "U"; r.alg_list = {-7}; r.resident_key = rk; r.user_verification = uv;
  return r;
}
GetAssertionRequest GetReq() {
  GetAssertionRequest r; r.rp_id = "example.com"; r.client_data_hash = Bytes(32, 3); return r;
}

TEST(CorvidAuthenticatorCoreTest, MakeCredentialLayoutAndFlags) {
  Env e;
  MakeCredentialResponse resp;
  ASSERT_EQ(e.core->MakeCredential(MakeReq(true, true), &resp), CtapError::kOk);
  const Bytes& ad = resp.auth_data;
  ASSERT_GT(ad.size(), 55u);
  EXPECT_EQ(ad[32], kFlagUp | kFlagAt | kFlagUv);
  EXPECT_EQ(Bytes(ad.begin() + 33, ad.begin() + 37), (Bytes{0, 0, 0, 0}));       // signCount 0
  EXPECT_EQ(Bytes(ad.begin() + 37, ad.begin() + 53), Bytes(16, 0));               // zero AAGUID
  EXPECT_EQ(ad[53], 0); EXPECT_EQ(ad[54], 32);                                      // credId length 32
  EXPECT_EQ(Bytes(ad.begin() + 55, ad.begin() + 87), resp.credential_id);
  EXPECT_EQ(ad[87], 0xa5);                                                          // COSE map of 5 entries
  EXPECT_EQ(resp.attestation_object[0], 0xa3);                                     // {fmt, attStmt, authData}
  EXPECT_EQ(e.vault->credentials().size(), 1u);
}

TEST(CorvidAuthenticatorCoreTest, RejectsBadInputAndUnsupportedAlg) {
  Env e;
  MakeCredentialResponse resp;
  auto r = MakeReq(); r.client_data_hash = Bytes(5);
  EXPECT_EQ(e.core->MakeCredential(r, &resp), CtapError::kInvalidParameter);
  r = MakeReq(); r.alg_list = {-257};
  EXPECT_EQ(e.core->MakeCredential(r, &resp), CtapError::kUnsupportedAlgorithm);
  EXPECT_TRUE(e.vault->credentials().empty());
}

TEST(CorvidAuthenticatorCoreTest, ExcludeListStillRequiresPresence) {
  Env e;
  MakeCredentialResponse a, b;
  ASSERT_EQ(e.core->MakeCredential(MakeReq(), &a), CtapError::kOk);
  auto r = MakeReq(); r.exclude_list = {a.credential_id};
  int before = e.gate.presence_calls;
  EXPECT_EQ(e.core->MakeCredential(r, &b), CtapError::kCredentialExcluded);
  EXPECT_EQ(e.gate.presence_calls, before + 1);
  EXPECT_EQ(e.vault->credentials().size(), 1u);
}

TEST(CorvidAuthenticatorCoreTest, DeniedPresenceOrUvCreatesNothing) {
  Env e; MakeCredentialResponse resp;
  e.gate.allow_presence = false;
  EXPECT_EQ(e.core->MakeCredential(MakeReq(), &resp), CtapError::kOperationDenied);
  e.gate.allow_presence = true; e.gate.allow_uv = false;
  EXPECT_EQ(e.core->MakeCredential(MakeReq(true, true), &resp), CtapError::kOperationDenied);
  EXPECT_TRUE(e.vault->credentials().empty());
}

TEST(CorvidAuthenticatorCoreTest, AssertionIncrementsCounterAndSignsAuthDataPlusHash) {
  Env e; MakeCredentialResponse m; GetAssertionResponse g;
  ASSERT_EQ(e.core->MakeCredential(MakeReq(), &m), CtapError::kOk);
  ASSERT_EQ(e.core->GetAssertion(GetReq(), &g), CtapError::kOk);
  EXPECT_EQ(g.auth_data.size(), 37u);
  EXPECT_EQ(g.auth_data[32], kFlagUp);
  EXPECT_EQ(g.auth_data[36], 1);  // signCount 1
  EXPECT_EQ(g.credential_id, m.credential_id);
  ASSERT_TRUE(g.user_handle.has_value());  // discoverable lookup returns the user handle
  EXPECT_EQ(*g.user_handle, (Bytes{1, 2, 3}));
  // fake signer echoes its message: authData || clientDataHash
  EXPECT_EQ(g.signature.size(), 2u + 37u + 32u);
  ASSERT_EQ(e.core->GetAssertion(GetReq(), &g), CtapError::kOk);
  EXPECT_EQ(g.auth_data[36], 2);
}

TEST(CorvidAuthenticatorCoreTest, AllowListAndDiscoverableFiltering) {
  Env e; MakeCredentialResponse nd, d; GetAssertionResponse g;
  ASSERT_EQ(e.core->MakeCredential(MakeReq(false), &nd), CtapError::kOk);
  EXPECT_EQ(e.core->GetAssertion(GetReq(), &g), CtapError::kNoCredentials);  // not discoverable, empty allow list
  auto r = GetReq(); r.allow_list = {nd.credential_id};
  ASSERT_EQ(e.core->GetAssertion(r, &g), CtapError::kOk);
  EXPECT_FALSE(g.user_handle.has_value());  // single allow-listed credential: no user handle
  r.allow_list = {Bytes(32, 0xee)};
  EXPECT_EQ(e.core->GetAssertion(r, &g), CtapError::kNoCredentials);
}

TEST(CorvidAuthenticatorCoreTest, PickerCancelDeniesAndLockedVaultDenies) {
  Env e; MakeCredentialResponse m; GetAssertionResponse g;
  ASSERT_EQ(e.core->MakeCredential(MakeReq(), &m), CtapError::kOk);
  auto r = GetReq(); r.pick_credential = [](const std::vector<const Credential*>&) { return std::string(); };
  EXPECT_EQ(e.core->GetAssertion(r, &g), CtapError::kOperationDenied);
  e.vault->Lock();
  EXPECT_EQ(e.core->GetAssertion(GetReq(), &g), CtapError::kOperationDenied);
}

TEST(CorvidAuthenticatorCoreTest, CoseKeyEncoding) {
  Bytes pub; pub.push_back(0x04); for (int i = 0; i < 64; i++) pub.push_back(static_cast<uint8_t>(i));
  Bytes cose = EncodeCoseEs256Key(pub);
  // a5 01 02 03 26 20 01 21 58 20 <32> 22 58 20 <32>
  ASSERT_EQ(cose.size(), 10u + 32u + 3u + 32u);
  EXPECT_EQ((Bytes(cose.begin(), cose.begin() + 10)), (Bytes{0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20}));
  EXPECT_EQ(cose[10], 0); EXPECT_EQ(cose[41], 31);
  EXPECT_EQ((Bytes(cose.begin() + 42, cose.begin() + 45)), (Bytes{0x22, 0x58, 0x20}));
}

}  // namespace
}  // namespace corvid::passkeys
