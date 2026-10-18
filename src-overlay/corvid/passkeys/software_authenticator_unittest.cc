// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// The device::FidoAuthenticator adapter end to end with real primitives: create a credential through MakeCredential, read the
// public key out of the attestation object, sign through GetAssertion and verify the signature with BoringSSL.
#include "corvid/passkeys/software_authenticator.h"

#include "base/test/bind.h"
#include "base/test/task_environment.h"
#include "corvid/passkeys/crypto_p256_boringssl.h"
#include "corvid/passkeys/vault_crypto_boringssl.h"
#include "crypto/sign.h"
#include "crypto/signature_verifier.h"
#include "device/fido/attested_credential_data.h"
#include "device/fido/authenticator_get_assertion_response.h"
#include "device/fido/authenticator_make_credential_response.h"
#include "device/fido/ctap_get_assertion_request.h"
#include "device/fido/ctap_make_credential_request.h"
#include "device/fido/public/public_key_credential_params.h"
#include "device/fido/public_key.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace corvid::passkeys {
namespace {

class AutoGate : public UserGate {
 public:
  bool Presence(const std::string& rp_id, Purpose p) override { last_rp_ = rp_id; last_purpose_ = p; return allow_; }
  bool Verification() override { return allow_; }
  bool allow_ = true;
  std::string last_rp_;
  Purpose last_purpose_ = Purpose::kGet;
};

class Backend : public PasskeyBackend {
 public:
  Backend() : vault_crypto_(CreateBoringSslVaultCrypto()), auth_crypto_(CreateBoringSslAuthenticatorCrypto()) {
    Vault::CreateOptions co;
    co.mode = UnlockMode::kKeyring;
    EXPECT_EQ(Vault::Create(vault_crypto_.get(), co, &vault_), VaultError::kOk);
    core_ = std::make_unique<AuthenticatorCore>(vault_.get(), &gate, auth_crypto_.get());
  }
  AuthenticatorCore* core() override { return core_.get(); }
  Vault* vault() override { return vault_.get(); }
  void Persist() override { persists++; }
  AutoGate gate;
  int persists = 0;

 private:
  std::unique_ptr<VaultCrypto> vault_crypto_;
  std::unique_ptr<AuthenticatorCrypto> auth_crypto_;
  std::unique_ptr<Vault> vault_;
  std::unique_ptr<AuthenticatorCore> core_;
};

device::CtapMakeCredentialRequest MakeRequest(const std::string& rp) {
  device::CtapMakeCredentialRequest req(
      R"({"type":"webauthn.create","challenge":"AAAA","origin":"https://example.com"})",
      device::PublicKeyCredentialRpEntity(rp), device::PublicKeyCredentialUserEntity({1, 2, 3, 4}, "ann", "Ann"),
      device::PublicKeyCredentialParams({{device::CredentialType::kPublicKey, -7}}));
  return req;
}

struct Made {
  device::MakeCredentialStatus status;
  std::optional<device::AuthenticatorMakeCredentialResponse> response;
};

Made Create(SoftwareAuthenticator* a, device::CtapMakeCredentialRequest req, device::MakeCredentialOptions opts,
            base::test::TaskEnvironment& env) {
  Made out{device::MakeCredentialStatus::kAuthenticatorResponseInvalid, std::nullopt};
  base::RunLoop loop;
  a->MakeCredential(std::move(req), std::move(opts),
                    base::BindLambdaForTesting([&](device::MakeCredentialStatus s, std::optional<device::AuthenticatorMakeCredentialResponse> r) {
                      out.status = s;
                      out.response = std::move(r);
                      loop.Quit();
                    }));
  loop.Run();
  return out;
}

TEST(CorvidSoftwareAuthenticatorTest, MakeCredentialThenGetAssertionVerifies) {
  base::test::TaskEnvironment env;
  Backend backend;
  SoftwareAuthenticator a(&backend);

  device::MakeCredentialOptions mc_opts;
  mc_opts.resident_key = device::ResidentKeyRequirement::kRequired;
  mc_opts.user_verification = device::UserVerificationRequirement::kRequired;
  Made made = Create(&a, MakeRequest("example.com"), mc_opts, env);
  ASSERT_EQ(made.status, device::MakeCredentialStatus::kSuccess);
  ASSERT_TRUE(made.response);
  EXPECT_EQ(backend.persists, 1);
  EXPECT_EQ(backend.gate.last_rp_, "example.com");
  EXPECT_EQ(backend.gate.last_purpose_, UserGate::Purpose::kCreate);
  EXPECT_EQ(made.response->is_resident_key, true);
  const device::AuthenticatorData& ad = made.response->attestation_object.authenticator_data();
  EXPECT_TRUE(ad.obtained_user_presence());
  EXPECT_TRUE(ad.obtained_user_verification());
  ASSERT_TRUE(ad.attested_data());
  const std::vector<uint8_t> cred_id = ad.attested_data()->credential_id();
  ASSERT_EQ(cred_id.size(), 32u);
  const device::PublicKey* pk = ad.attested_data()->public_key();
  ASSERT_TRUE(pk && pk->der_bytes);

  // Assertion over a fresh challenge.
  device::CtapGetAssertionRequest get("example.com",
                                      R"({"type":"webauthn.get","challenge":"BBBB","origin":"https://example.com"})");
  get.allow_list.emplace_back(device::CredentialType::kPublicKey, cred_id);
  device::GetAssertionStatus gs = device::GetAssertionStatus::kAuthenticatorResponseInvalid;
  std::vector<device::AuthenticatorGetAssertionResponse> responses;
  base::RunLoop loop;
  a.GetAssertion(get, device::CtapGetAssertionOptions(),
                 base::BindLambdaForTesting([&](device::GetAssertionStatus s, std::vector<device::AuthenticatorGetAssertionResponse> r) {
                   gs = s;
                   responses = std::move(r);
                   loop.Quit();
                 }));
  loop.Run();
  ASSERT_EQ(gs, device::GetAssertionStatus::kSuccess);
  ASSERT_EQ(responses.size(), 1u);
  EXPECT_EQ(backend.persists, 2);
  {
    auto counter = responses[0].authenticator_data.counter();
    EXPECT_EQ((counter[0] << 24) | (counter[1] << 16) | (counter[2] << 8) | counter[3], 1);  // first assertion
  }
  ASSERT_TRUE(responses[0].credential);
  EXPECT_EQ(responses[0].credential->id, cred_id);

  std::vector<uint8_t> signed_data = responses[0].authenticator_data.SerializeToByteArray();
  signed_data.insert(signed_data.end(), get.client_data_hash.begin(), get.client_data_hash.end());
  crypto::SignatureVerifier verifier;
  ASSERT_TRUE(verifier.VerifyInit(crypto::sign::SignatureKind::ECDSA_SHA256, responses[0].signature, *pk->der_bytes));
  verifier.VerifyUpdate(signed_data);
  EXPECT_TRUE(verifier.VerifyFinal());
}

TEST(CorvidSoftwareAuthenticatorTest, DeclinedPromptCreatesNothing) {
  base::test::TaskEnvironment env;
  Backend backend;
  backend.gate.allow_ = false;
  SoftwareAuthenticator a(&backend);
  Made made = Create(&a, MakeRequest("example.com"), device::MakeCredentialOptions(), env);
  EXPECT_EQ(made.status, device::MakeCredentialStatus::kUserConsentDenied);
  EXPECT_FALSE(made.response);
  EXPECT_EQ(backend.persists, 0);
  EXPECT_TRUE(backend.vault()->credentials().empty());
}

TEST(CorvidSoftwareAuthenticatorTest, UnknownCredentialIsNotRecognized) {
  base::test::TaskEnvironment env;
  Backend backend;
  SoftwareAuthenticator a(&backend);
  device::CtapGetAssertionRequest get("example.com", R"({"type":"webauthn.get","challenge":"CCCC","origin":"https://example.com"})");
  get.allow_list.emplace_back(device::CredentialType::kPublicKey, std::vector<uint8_t>(32, 7));
  device::GetAssertionStatus gs = device::GetAssertionStatus::kSuccess;
  base::RunLoop loop;
  a.GetAssertion(get, device::CtapGetAssertionOptions(),
                 base::BindLambdaForTesting([&](device::GetAssertionStatus s, std::vector<device::AuthenticatorGetAssertionResponse>) {
                   gs = s;
                   loop.Quit();
                 }));
  loop.Run();
  EXPECT_EQ(gs, device::GetAssertionStatus::kUserConsentButCredentialNotRecognized);
}

TEST(CorvidSoftwareAuthenticatorTest, ReportsDiscoverableCredentialsForThePicker) {
  base::test::TaskEnvironment env;
  Backend backend;
  SoftwareAuthenticator a(&backend);
  device::MakeCredentialOptions opts;
  opts.resident_key = device::ResidentKeyRequirement::kRequired;
  ASSERT_EQ(Create(&a, MakeRequest("example.com"), opts, env).status, device::MakeCredentialStatus::kSuccess);
  ASSERT_EQ(Create(&a, MakeRequest("other.org"), opts, env).status, device::MakeCredentialStatus::kSuccess);

  device::CtapGetAssertionRequest get("example.com", R"({"type":"webauthn.get","challenge":"DDDD","origin":"https://example.com"})");
  std::vector<device::DiscoverableCredentialMetadata> found;
  device::FidoRequestHandlerBase::RecognizedCredential recognized = device::FidoRequestHandlerBase::RecognizedCredential::kUnknown;
  base::RunLoop loop;
  a.GetPlatformCredentialInfoForRequest(
      get, device::CtapGetAssertionOptions(),
      base::BindLambdaForTesting([&](std::vector<device::DiscoverableCredentialMetadata> c, device::FidoRequestHandlerBase::RecognizedCredential r) {
        found = std::move(c);
        recognized = r;
        loop.Quit();
      }));
  loop.Run();
  ASSERT_EQ(found.size(), 1u);
  EXPECT_EQ(found[0].rp_id, "example.com");
  EXPECT_EQ(found[0].user.name, "ann");
  EXPECT_EQ(recognized, device::FidoRequestHandlerBase::RecognizedCredential::kHasRecognizedCredential);
}

}  // namespace
}  // namespace corvid::passkeys
