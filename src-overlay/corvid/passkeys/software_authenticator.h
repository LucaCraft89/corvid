// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// Chromium-side adapter for the built-in passkey authenticator. The logic lives in authenticator_core.{h,cc} and vault.{h,cc};
// this file only translates device::Ctap* requests and responses and reports the authenticator to the WebAuthn request
// handler through SoftwareDiscovery (transport kInternal, hooked into FidoDiscoveryFactory on Linux by a patch).
#ifndef CORVID_PASSKEYS_SOFTWARE_AUTHENTICATOR_H_
#define CORVID_PASSKEYS_SOFTWARE_AUTHENTICATOR_H_

#include <memory>
#include <string>
#include <vector>

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "corvid/passkeys/authenticator_core.h"
#include "device/fido/authenticator_supported_options.h"
#include "device/fido/fido_authenticator.h"
#include "device/fido/fido_discovery_base.h"

namespace corvid::passkeys {

// What the authenticator needs from its owner (the browser service, or fakes in tests).
class PasskeyBackend {
 public:
  virtual ~PasskeyBackend() = default;
  virtual AuthenticatorCore* core() = 0;
  virtual Vault* vault() = 0;
  // Called after every operation that changed the vault (new credential, sign counter).
  virtual void Persist() = 0;
};

// Hands out the backend once the vault is open. `callback` gets nullptr when the vault cannot be opened.
class PasskeyBackendProvider {
 public:
  virtual ~PasskeyBackendProvider() = default;
  virtual void WhenReady(base::OnceCallback<void(PasskeyBackend*)> callback) = 0;
};

class SoftwareAuthenticator : public device::FidoAuthenticator {
 public:
  explicit SoftwareAuthenticator(PasskeyBackend* backend);
  ~SoftwareAuthenticator() override;

  void InitializeAuthenticator(base::OnceClosure callback) override;
  void MakeCredential(device::CtapMakeCredentialRequest request,
                      device::MakeCredentialOptions options,
                      MakeCredentialCallback callback) override;
  void GetAssertion(device::CtapGetAssertionRequest request,
                    device::CtapGetAssertionOptions options,
                    GetAssertionCallback callback) override;
  void GetPlatformCredentialInfoForRequest(const device::CtapGetAssertionRequest& request,
                                           const device::CtapGetAssertionOptions& options,
                                           GetPlatformCredentialInfoForRequestCallback callback) override;
  void Cancel() override;
  std::string GetId() const override;
  std::string GetDisplayName() const override;
  const device::AuthenticatorSupportedOptions& Options() const override;
  std::optional<device::FidoTransportProtocol> AuthenticatorTransport() const override;
  device::AuthenticatorType GetType() const override;
  base::WeakPtr<device::FidoAuthenticator> GetWeakPtr() override;

 private:
  raw_ptr<PasskeyBackend> backend_;
  device::AuthenticatorSupportedOptions options_;
  base::WeakPtrFactory<SoftwareAuthenticator> weak_factory_{this};
};

class SoftwareDiscovery : public device::FidoDiscoveryBase {
 public:
  explicit SoftwareDiscovery(PasskeyBackendProvider* provider);
  ~SoftwareDiscovery() override;
  void Start() override;

 private:
  void OnBackend(PasskeyBackend* backend);

  raw_ptr<PasskeyBackendProvider> provider_;
  std::unique_ptr<SoftwareAuthenticator> authenticator_;
  base::WeakPtrFactory<SoftwareDiscovery> weak_factory_{this};
};

}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_SOFTWARE_AUTHENTICATOR_H_
