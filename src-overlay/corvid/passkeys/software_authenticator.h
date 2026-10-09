// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNVERIFIED (uncompiled). Chromium-side software authenticator. The behavior contract is the
// verified TS reference (reference/authenticator.ts + vault.ts, 20 passing tests); this C++ must
// reproduce its byte-level outputs (test vectors: reference/test/*.test.ts).
//
// Integration shape (names from memory, verify against pinned tree; see docs/notes/chromium-hooks.md):
//  * device::FidoDiscoveryFactory::Create(FidoTransportProtocol) is the single place discoveries are
//    made. Corvid adds a hook that, for kInternal on Linux, returns SoftwareDiscovery below.
//  * SoftwareDiscovery is a device::FidoDiscoveryBase that reports exactly one FidoAuthenticator
//    (SoftwareAuthenticator : device::FidoAuthenticator) once the vault is unlocked, and an
//    "unlock required" signal otherwise, surfaced through AuthenticatorRequestDelegate so the
//    existing WebAuthn dialog (replaced by Corvid WebUI) can ask for the passphrase.
//  * Vault crypto must use BoringSSL-available primitives for the Chromium build: Argon2id
//    (third_party/boringssl lacks Argon2: use third_party/argon2 (CC0/Apache-2.0, already in
//    Chromium for password manager? VERIFY) and XChaCha20-Poly1305 (BoringSSL EVP_AEAD_xchacha20_poly1305).
//    The file format is IDENTICAL to reference/vault.ts so the two implementations cross-test.
#ifndef CORVID_PASSKEYS_SOFTWARE_AUTHENTICATOR_H_
#define CORVID_PASSKEYS_SOFTWARE_AUTHENTICATOR_H_

#include <memory>
#include <string>
#include <vector>

#include "device/fido/fido_authenticator.h"
#include "device/fido/fido_discovery_base.h"

namespace corvid::passkeys {

class VaultStore;  // file-backed, atomic write (tmp + fsync + rename), 0600, mirrors vault.ts

class SoftwareAuthenticator : public device::FidoAuthenticator {
 public:
  explicit SoftwareAuthenticator(VaultStore* vault);
  ~SoftwareAuthenticator() override;
  void InitializeAuthenticator(base::OnceClosure callback) override;
  void MakeCredential(device::CtapMakeCredentialRequest request,
                      device::MakeCredentialOptions options,
                      MakeCredentialCallback callback) override;
  void GetAssertion(device::CtapGetAssertionRequest request, device::CtapGetAssertionOptions options,
                    GetAssertionCallback callback) override;
  // Properties: attestation "none", AAGUID all-zero, ES256 only, rk=true, uv=true (vault unlock).
  const device::AuthenticatorSupportedOptions& Options() const override;
  std::optional<device::FidoTransportProtocol> AuthenticatorTransport() const override;
  std::string GetId() const override { return "corvid-software-authenticator"; }
  base::WeakPtr<device::FidoAuthenticator> GetWeakPtr() override;
 private:
  raw_ptr<VaultStore> vault_;
  base::WeakPtrFactory<SoftwareAuthenticator> weak_factory_{this};
};

class SoftwareDiscovery : public device::FidoDiscoveryBase {
 public:
  SoftwareDiscovery();
  void Start() override;
};

}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_SOFTWARE_AUTHENTICATOR_H_
