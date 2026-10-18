// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT (G4). device::FidoAuthenticator adapter over PasskeyService / AuthenticatorCore, written against the 155
// declarations in docs/notes/fido-api-155.md. Types the note does NOT reproduce (AuthenticatorData, AttestationObject,
// NoneAttestationStatement, AuthenticatorSupportedOptions, PublicKeyCredential*Entity accessors) are used from memory and are
// listed in docs/notes/passkey-adapter-verify.md for the builder to grep and fix on first compile.
//
// Behaviour: platform authenticator (kInternal), ES256 only, attestation "none", zero AAGUID, discoverable credentials,
// user verification = vault passphrase. No network access of any kind.
#ifndef CORVID_PASSKEYS_SOFTWARE_AUTHENTICATOR_H_
#define CORVID_PASSKEYS_SOFTWARE_AUTHENTICATOR_H_

#include <memory>
#include <optional>
#include <string>

#include "base/functional/callback.h"
#include "base/memory/ref_counted.h"
#include "base/memory/weak_ptr.h"
#include "device/fido/authenticator_supported_options.h"
#include "device/fido/fido_authenticator.h"
#include "device/fido/fido_discovery_base.h"

namespace corvid::passkeys {

class SoftwareAuthenticator : public device::FidoAuthenticator {
 public:
  SoftwareAuthenticator();
  ~SoftwareAuthenticator() override;

  void InitializeAuthenticator(base::OnceClosure callback) override;
  void MakeCredential(device::CtapMakeCredentialRequest request, device::MakeCredentialOptions options,
                      MakeCredentialCallback callback) override;
  void GetAssertion(device::CtapGetAssertionRequest request, device::CtapGetAssertionOptions options,
                    GetAssertionCallback callback) override;
  void Cancel() override;
  device::AuthenticatorType GetType() const override;
  std::string GetId() const override;
  const device::AuthenticatorSupportedOptions& Options() const override;
  std::optional<device::FidoTransportProtocol> AuthenticatorTransport() const override;
  base::WeakPtr<device::FidoAuthenticator> GetWeakPtr() override;

 private:
  device::AuthenticatorSupportedOptions options_;
  scoped_refptr<base::RefCountedData<bool>> cancelled_;
  base::WeakPtrFactory<SoftwareAuthenticator> weak_factory_{this};
};

// Reports exactly one SoftwareAuthenticator as soon as it is started, if PasskeyService::Available().
class SoftwareDiscovery : public device::FidoDiscoveryBase {
 public:
  SoftwareDiscovery();
  ~SoftwareDiscovery() override;
  void Start() override;

 private:
  std::unique_ptr<SoftwareAuthenticator> authenticator_;
  base::WeakPtrFactory<SoftwareDiscovery> weak_factory_{this};
};

}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_SOFTWARE_AUTHENTICATOR_H_
