// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "corvid/passkeys/software_authenticator.h"

#include <utility>

#include "base/base64url.h"
#include "base/functional/bind.h"
#include "base/task/single_thread_task_runner.h"
#include "components/cbor/reader.h"
#include "device/fido/attestation_object.h"
#include "device/fido/authenticator_data.h"
#include "device/fido/authenticator_get_assertion_response.h"
#include "device/fido/authenticator_make_credential_response.h"
#include "device/fido/ctap_get_assertion_request.h"
#include "device/fido/ctap_make_credential_request.h"
#include "device/fido/discoverable_credential_metadata.h"
#include "device/fido/public/public_key_credential_descriptor.h"
#include "device/fido/public/public_key_credential_user_entity.h"

namespace corvid::passkeys {

namespace {

template <typename Callback, typename... Args>
void PostResult(Callback callback, Args&&... args) {
  // Results are always delivered asynchronously, as the request handler expects.
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(std::move(callback), std::forward<Args>(args)...));
}

device::MakeCredentialStatus ToMakeStatus(CtapError e) {
  switch (e) {
    case CtapError::kOk: return device::MakeCredentialStatus::kSuccess;
    case CtapError::kCredentialExcluded: return device::MakeCredentialStatus::kUserConsentButCredentialExcluded;
    case CtapError::kOperationDenied: return device::MakeCredentialStatus::kUserConsentDenied;
    case CtapError::kUnsupportedAlgorithm: return device::MakeCredentialStatus::kNoCommonAlgorithms;
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

bool UnB64(const std::string& s, Bytes* out) {
  std::string raw;
  if (!base::Base64UrlDecode(s, base::Base64UrlDecodePolicy::DISALLOW_PADDING, &raw)) return false;
  out->assign(raw.begin(), raw.end());
  return true;
}

}  // namespace

SoftwareAuthenticator::SoftwareAuthenticator(PasskeyBackend* backend) : backend_(backend) {
  options_.is_platform_device = device::AuthenticatorSupportedOptions::PlatformDevice::kYes;
  options_.supports_resident_key = true;
  options_.user_verification_availability =
      device::AuthenticatorSupportedOptions::UserVerificationAvailability::kSupportedAndConfigured;
  options_.supports_user_presence = true;
}

SoftwareAuthenticator::~SoftwareAuthenticator() = default;

void SoftwareAuthenticator::InitializeAuthenticator(base::OnceClosure callback) {
  PostResult(std::move(callback));
}

void SoftwareAuthenticator::MakeCredential(device::CtapMakeCredentialRequest request,
                                           device::MakeCredentialOptions options,
                                           MakeCredentialCallback callback) {
  MakeCredentialRequest req;
  req.rp_id = request.rp.id;
  req.client_data_hash.assign(request.client_data_hash.begin(), request.client_data_hash.end());
  req.user_handle = request.user.id;
  req.user_name = request.user.name.value_or(std::string());
  req.display_name = request.user.display_name.value_or(std::string());
  for (const auto& p : request.public_key_credential_params.public_key_credential_params()) {
    req.alg_list.push_back(p.algorithm);
  }
  for (const auto& ex : request.exclude_list) req.exclude_list.push_back(ex.id);
  req.resident_key = options.resident_key != device::ResidentKeyRequirement::kDiscouraged;
  req.user_verification = options.user_verification == device::UserVerificationRequirement::kRequired;

  MakeCredentialResponse out;
  const CtapError err = backend_->core()->MakeCredential(req, &out);
  if (err != CtapError::kOk) {
    PostResult(std::move(callback), ToMakeStatus(err), std::nullopt);
    return;
  }
  backend_->Persist();

  std::optional<cbor::Value> value = cbor::Reader::Read(out.attestation_object);
  std::optional<device::AttestationObject> attestation;
  if (value) attestation = device::AttestationObject::Parse(*value);
  if (!attestation) {
    PostResult(std::move(callback), device::MakeCredentialStatus::kAuthenticatorResponseInvalid, std::nullopt);
    return;
  }
  device::AuthenticatorMakeCredentialResponse response(device::FidoTransportProtocol::kInternal, std::move(*attestation));
  response.is_resident_key = req.resident_key;
  PostResult(std::move(callback), device::MakeCredentialStatus::kSuccess,
             std::optional<device::AuthenticatorMakeCredentialResponse>(std::move(response)));
}

void SoftwareAuthenticator::GetAssertion(device::CtapGetAssertionRequest request,
                                         device::CtapGetAssertionOptions options,
                                         GetAssertionCallback callback) {
  GetAssertionRequest req;
  req.rp_id = request.rp_id;
  req.client_data_hash.assign(request.client_data_hash.begin(), request.client_data_hash.end());
  for (const auto& d : request.allow_list) req.allow_list.push_back(d.id);
  req.user_verification = request.user_verification == device::UserVerificationRequirement::kRequired;

  GetAssertionResponse out;
  const CtapError err = backend_->core()->GetAssertion(req, &out);
  if (err != CtapError::kOk) {
    PostResult(std::move(callback), ToGetStatus(err), std::vector<device::AuthenticatorGetAssertionResponse>());
    return;
  }
  backend_->Persist();

  std::optional<device::AuthenticatorData> auth_data = device::AuthenticatorData::DecodeAuthenticatorData(out.auth_data);
  if (!auth_data) {
    PostResult(std::move(callback), device::GetAssertionStatus::kAuthenticatorResponseInvalid,
               std::vector<device::AuthenticatorGetAssertionResponse>());
    return;
  }
  device::AuthenticatorGetAssertionResponse response(std::move(*auth_data), out.signature,
                                                     device::FidoTransportProtocol::kInternal);
  response.credential = device::PublicKeyCredentialDescriptor(device::CredentialType::kPublicKey, out.credential_id);
  if (out.user_handle) response.user_entity = device::PublicKeyCredentialUserEntity(*out.user_handle);
  std::vector<device::AuthenticatorGetAssertionResponse> responses;
  responses.push_back(std::move(response));
  PostResult(std::move(callback), device::GetAssertionStatus::kSuccess, std::move(responses));
}

void SoftwareAuthenticator::GetPlatformCredentialInfoForRequest(const device::CtapGetAssertionRequest& request,
                                                                const device::CtapGetAssertionOptions&,
                                                                GetPlatformCredentialInfoForRequestCallback callback) {
  std::vector<device::DiscoverableCredentialMetadata> credentials;
  bool any = false;
  for (const Credential* c : backend_->vault()->FindByRp(request.rp_id)) {
    Bytes id, user_handle;
    if (!UnB64(c->id, &id)) continue;
    bool wanted = c->discoverable;
    if (!request.allow_list.empty()) {
      wanted = false;
      for (const auto& d : request.allow_list) wanted = wanted || d.id == id;
    }
    if (!wanted) continue;
    any = true;
    if (!UnB64(c->user_handle, &user_handle)) continue;
    credentials.emplace_back(device::AuthenticatorType::kOther, c->rp_id, std::move(id),
                             device::PublicKeyCredentialUserEntity(std::move(user_handle), c->user_name, c->display_name),
                             std::nullopt);
  }
  PostResult(std::move(callback), std::move(credentials),
             any ? device::FidoRequestHandlerBase::RecognizedCredential::kHasRecognizedCredential
                 : device::FidoRequestHandlerBase::RecognizedCredential::kNoRecognizedCredential);
}

void SoftwareAuthenticator::Cancel() {}
std::string SoftwareAuthenticator::GetId() const { return "corvid-software-authenticator"; }
std::string SoftwareAuthenticator::GetDisplayName() const { return "Corvid"; }
const device::AuthenticatorSupportedOptions& SoftwareAuthenticator::Options() const { return options_; }
std::optional<device::FidoTransportProtocol> SoftwareAuthenticator::AuthenticatorTransport() const {
  return device::FidoTransportProtocol::kInternal;
}
device::AuthenticatorType SoftwareAuthenticator::GetType() const { return device::AuthenticatorType::kOther; }
base::WeakPtr<device::FidoAuthenticator> SoftwareAuthenticator::GetWeakPtr() { return weak_factory_.GetWeakPtr(); }

SoftwareDiscovery::SoftwareDiscovery(PasskeyBackendProvider* provider)
    : device::FidoDiscoveryBase(device::FidoTransportProtocol::kInternal), provider_(provider) {}
SoftwareDiscovery::~SoftwareDiscovery() = default;

void SoftwareDiscovery::Start() {
  provider_->WhenReady(base::BindOnce(&SoftwareDiscovery::OnBackend, weak_factory_.GetWeakPtr()));
}

void SoftwareDiscovery::OnBackend(PasskeyBackend* backend) {
  // DiscoveryStarted must not run synchronously from Start(); WhenReady always answers from a posted task.
  if (!backend) {
    observer()->DiscoveryStarted(this, /*success=*/false);
    return;
  }
  authenticator_ = std::make_unique<SoftwareAuthenticator>(backend);
  observer()->DiscoveryStarted(this, /*success=*/true, {authenticator_.get()});
}

}  // namespace corvid::passkeys
