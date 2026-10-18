// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// Browser-side owner of the built-in passkey authenticator: opens (or creates) the vault in the user data directory
// on first use, answers the WebAuthn discovery, saves after every change and asks the user for consent.
// Compiled into chrome/browser (not a standalone target) because it uses browser UI and the OS keyring.
#ifndef CORVID_PASSKEYS_PASSKEYS_SERVICE_H_
#define CORVID_PASSKEYS_PASSKEYS_SERVICE_H_

#include <memory>
#include <vector>

#include "base/functional/callback.h"
#include "base/no_destructor.h"
#include "base/memory/ref_counted.h"
#include "base/memory/weak_ptr.h"
#include "base/task/sequenced_task_runner.h"
#include "corvid/passkeys/authenticator_core.h"
#include "corvid/passkeys/passkey_storage.h"
#include "corvid/passkeys/software_authenticator.h"
#include "corvid/passkeys/vault_crypto_boringssl.h"

namespace os_crypt_async {
class Encryptor;
}

namespace corvid::passkeys {

// Hooks the software discovery into device::FidoDiscoveryFactory (kInternal on Linux). Call once at browser start.
void RegisterLinuxPlatformDiscovery();

class PasskeysService : public PasskeyBackendProvider, public PasskeyBackend, public UserGate {
 public:
  static PasskeysService* Get();
  ~PasskeysService() override;

  // PasskeyBackendProvider
  void WhenReady(base::OnceCallback<void(PasskeyBackend*)> callback) override;
  // PasskeyBackend
  AuthenticatorCore* core() override;
  Vault* vault() override;
  void Persist() override;
  // UserGate: a native confirmation shows which site asks; "yes" counts as presence and as verification.
  bool Presence(const std::string& rp_id, Purpose purpose) override;
  bool Verification() override;

 private:
  friend class base::NoDestructor<PasskeysService>;
  PasskeysService();

  class KeyringCipher;
  struct OpenResult;

  void StartOpening();
  void OnEncryptor(scoped_refptr<os_crypt_async::Encryptor> encryptor);
  void OnOpened(std::unique_ptr<OpenResult> result);
  void Finish(bool ok);

  enum class State { kIdle, kOpening, kReady, kFailed };
  State state_ = State::kIdle;
  std::vector<base::OnceCallback<void(PasskeyBackend*)>> waiting_;
  std::unique_ptr<KeyringCipher> cipher_;
  std::unique_ptr<VaultCrypto> vault_crypto_;
  std::unique_ptr<AuthenticatorCrypto> auth_crypto_;
  std::unique_ptr<PasskeyStorage> storage_;
  std::unique_ptr<Vault> vault_;
  std::unique_ptr<AuthenticatorCore> core_;
  scoped_refptr<base::SequencedTaskRunner> writer_;
  bool presence_confirmed_ = false;
  base::WeakPtrFactory<PasskeysService> weak_factory_{this};
};

}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_PASSKEYS_SERVICE_H_
