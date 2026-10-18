// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT (G4). See software_authenticator.h and docs/notes/passkey-adapter-verify.md.
#include "corvid/passkeys/software_authenticator.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/task/single_thread_task_runner.h"
#include "corvid/passkeys/passkey_service.h"
#include "device/fido/attestation_object.h"
#include "device/fido/authenticator_data.h"
#include "device/fido/authenticator_get_assertion_response.h"
#include "device/fido/authenticator_make_credential_response.h"
#include "device/fido/ctap_get_assertion_request.h"
#include "device/fido/ctap_make_credential_request.h"
#include "device/fido/opaque_attestation_statement.h"
#include "device/fido/public/public_key_credential_descriptor.h"

namespace corvid::passkeys {

namespace {

constexpr int kCoseEs256 = -7;

Bytes ToBytes(base::span<const uint8_t> s) { return Bytes(s.begin(), s.end()); }

device::MakeCredentialStatus ToMakeStatus(CtapError e) {
  switch (e) {
    case CtapError::kOk: return device::MakeCredentialStatus::kSuccess;
    case CtapError::kCredentialExcluded: return device::MakeCredentialStatus::kUserConsentButCredentialExcluded;
    case CtapError::kUnsupportedAlgorithm: return device::MakeCredentialStatus::kNoCommonAlgorithms;
    case CtapError::kOperationDenied: return device::MakeCredentialStatus::kUserConsentDenied;
    default: return device::MakeCredentialStatus::kAuthenticatorResponseInvalid;
  }
}

device::GetAssertionStatus ToGetStatus(CtapError e) {
  switch (e) {
    case CtapError::kOk: return device::GetAssertionStatus::kSuccess;
    case CtapError::kNoCredentials: return device::GetAssertionStatus::kUserConsentButCredentialNotRecognized;
    case CtapError::kOperationDenied: return device::GetAssertionStatus::kUserConsentDenied;
    default: return device::GetAssertionStatus::kAuthenticatorResponseInvalid;
  }
}

}  // namespace

SoftwareAuthenticator::SoftwareAuthenticator() : cancelled_(base::MakeRefCounted<base::RefCountedData<bool>>(false)) {
  options_.is_platform_device = device::AuthenticatorSupportedOptions::PlatformDevice::kYes;
  options_.supports_resident_key = true;
  options_.user_verification_availability =
      device::AuthenticatorSupportedOptions::UserVerificationAvailability::kSupportedAndConfigured;
}
SoftwareAuthenticator::~SoftwareAuthenticator() = default;

void SoftwareAuthenticator::InitializeAuthenticator(base::OnceClosure callback) {
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(FROM_HERE, std::move(callback));
}

void SoftwareAuthenticator::MakeCredential(device::CtapMakeCredentialRequest request,
                                           device::MakeCredentialOptions /*options*/, MakeCredentialCallback callback) {
  MakeCredentialRequest req;
  req.rp_id = request.rp.id;
  req.client_data_hash.assign(request.client_data_hash.begin(), request.client_data_hash.end());
  req.user_handle = request.user.id;
  req.user_name = request.user.name.value_or("");
  req.display_name = request.user.display_name.value_or("");
  for (const auto& p : request.public_key_credential_params.public_key_credential_params())
    req.alg_list.push_back(p.algorithm);
  for (const auto& d : request.exclude_list) req.exclude_list.push_back(d.id);
  req.resident_key = request.resident_key_required;
  req.user_verification = request.user_verification != device::UserVerificationRequirement::kDiscouraged;

  cancelled_->data = false;
  PasskeyService::Get().MakeCredential(
      std::move(req), cancelled_,
      base::BindOnce(
          [](base::WeakPtr<SoftwareAuthenticator> self, MakeCredentialCallback cb, PasskeyService::MakeResult r) {
            if (r.error != CtapError::kOk) return std::move(cb).Run(ToMakeStatus(r.error), std::nullopt);
            auto auth_data = device::AuthenticatorData::DecodeAuthenticatorData(r.response.auth_data);
            if (!auth_data) return std::move(cb).Run(device::MakeCredentialStatus::kAuthenticatorResponseInvalid, std::nullopt);
            device::AttestationObject obj(std::move(*auth_data),
                                          std::make_unique<device::NoneAttestationStatement>());
            device::AuthenticatorMakeCredentialResponse resp(device::FidoTransportProtocol::kInternal, std::move(obj));
            resp.is_resident_key = true;
            std::move(cb).Run(device::MakeCredentialStatus::kSuccess, std::move(resp));
          },
          weak_factory_.GetWeakPtr(), std::move(callback)));
}

void SoftwareAuthenticator::GetAssertion(device::CtapGetAssertionRequest request,
                                         device::CtapGetAssertionOptions /*options*/, GetAssertionCallback callback) {
  GetAssertionRequest req;
  req.rp_id = request.rp_id;
  req.client_data_hash.assign(request.client_data_hash.begin(), request.client_data_hash.end());
  for (const auto& d : request.allow_list) req.allow_list.push_back(d.id);
  req.user_verification = request.user_verification != device::UserVerificationRequirement::kDiscouraged;

  cancelled_->data = false;
  PasskeyService::Get().GetAssertion(
      std::move(req), cancelled_,
      base::BindOnce(
          [](base::WeakPtr<SoftwareAuthenticator> self, GetAssertionCallback cb, PasskeyService::GetResult r) {
            if (r.error != CtapError::kOk) return std::move(cb).Run(ToGetStatus(r.error), {});
            auto auth_data = device::AuthenticatorData::DecodeAuthenticatorData(r.response.auth_data);
            if (!auth_data) return std::move(cb).Run(device::GetAssertionStatus::kAuthenticatorResponseInvalid, {});
            device::AuthenticatorGetAssertionResponse resp(std::move(*auth_data), r.response.signature,
                                                           device::FidoTransportProtocol::kInternal);
            resp.credential = device::PublicKeyCredentialDescriptor(device::CredentialType::kPublicKey,
                                                                    r.response.credential_id);
            if (r.response.user_handle) {
              resp.user_entity = device::PublicKeyCredentialUserEntity(*r.response.user_handle);
            }
            resp.user_selected = true;  // the chooser already ran in PickCredential
            std::vector<device::AuthenticatorGetAssertionResponse> v;
            v.push_back(std::move(resp));
            std::move(cb).Run(device::GetAssertionStatus::kSuccess, std::move(v));
          },
          weak_factory_.GetWeakPtr(), std::move(callback)));
}

void SoftwareAuthenticator::Cancel() { cancelled_->data = true; }
device::AuthenticatorType SoftwareAuthenticator::GetType() const { return device::AuthenticatorType::kOther; }
std::string SoftwareAuthenticator::GetId() const { return "corvid-software-authenticator"; }
const device::AuthenticatorSupportedOptions& SoftwareAuthenticator::Options() const { return options_; }
std::optional<device::FidoTransportProtocol> SoftwareAuthenticator::AuthenticatorTransport() const {
  return device::FidoTransportProtocol::kInternal;
}
base::WeakPtr<device::FidoAuthenticator> SoftwareAuthenticator::GetWeakPtr() { return weak_factory_.GetWeakPtr(); }

SoftwareDiscovery::SoftwareDiscovery() : device::FidoDiscoveryBase(device::FidoTransportProtocol::kInternal) {}
SoftwareDiscovery::~SoftwareDiscovery() = default;

void SoftwareDiscovery::Start() {
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(
                     [](base::WeakPtr<SoftwareDiscovery> self) {
                       if (!self || !self->observer()) return;
                       if (!PasskeyService::Get().Available()) {
                         self->observer()->DiscoveryStarted(self.get(), /*success=*/false);
                         return;
                       }
                       self->authenticator_ = std::make_unique<SoftwareAuthenticator>();
                       self->observer()->DiscoveryStarted(self.get(), /*success=*/true,
                                                          {self->authenticator_.get()});
                     },
                     weak_factory_.GetWeakPtr()));
}

}  // namespace corvid::passkeys
