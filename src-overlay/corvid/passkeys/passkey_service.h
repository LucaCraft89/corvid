// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT (G4). Browser-process owner of the passkey vault and the prompt bridge. The FIDO discovery is created deep in
// device/fido with no profile or window, so the software authenticator reaches the vault through this singleton.
//
// Threading: all vault and crypto work runs on one sequenced, blocking-allowed task runner ("vault sequence"). User
// interaction (presence confirmation, passphrase, credential chooser) lives on the UI thread behind PasskeyPromptDelegate;
// the vault sequence blocks on a WaitableEvent while the UI thread answers, which keeps AuthenticatorCore synchronous
// (it is a straight port of authenticator.ts) without ever blocking the UI thread.
#ifndef CORVID_PASSKEYS_PASSKEY_SERVICE_H_
#define CORVID_PASSKEYS_PASSKEY_SERVICE_H_

#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "base/memory/scoped_refptr.h"
#include "base/no_destructor.h"
#include "base/task/sequenced_task_runner.h"
#include "corvid/passkeys/authenticator_core.h"
#include "corvid/passkeys/vault.h"

namespace corvid::passkeys {

// Metadata only. Never carries key material.
struct CredentialSummary {
  std::string id, rp_id, user_name, display_name;
  int64_t created_at = 0;
};

// Implemented by the Corvid WebUI passkey prompt (UI thread). Every callback must be run exactly once; dropping one
// counts as "denied" after the service's timeout.
class PasskeyPromptDelegate {
 public:
  virtual ~PasskeyPromptDelegate() = default;
  // `creating` distinguishes "create a passkey for rp" from "sign in to rp".
  virtual void ConfirmPresence(const std::string& rp_id, bool creating, base::OnceCallback<void(bool)> done) = 0;
  // `first_run` = no vault file yet, ask for a NEW passphrase (with confirmation). Empty optional = cancelled.
  virtual void RequestPassphrase(bool first_run, base::OnceCallback<void(std::optional<std::string>)> done) = 0;
  // Empty string = cancelled.
  virtual void PickCredential(const std::vector<CredentialSummary>& choices, base::OnceCallback<void(std::string)> done) = 0;
};

class PasskeyService {
 public:
  static PasskeyService& Get();

  // UI thread. The delegate must outlive its registration; pass nullptr to unregister (all pending requests are denied).
  void SetPromptDelegate(PasskeyPromptDelegate* delegate);
  // Where the sealed vault lives (<profile or user-data>/Corvid/passkeys.vault). Set once at startup.
  void SetVaultPath(const base::FilePath& path);

  struct MakeResult { CtapError error; MakeCredentialResponse response; };
  struct GetResult { CtapError error; GetAssertionResponse response; };

  // UI thread in, UI thread out. `cancelled` flips to true if the authenticator was cancelled; the vault sequence then
  // stops waiting on the user and returns kOperationDenied.
  void MakeCredential(MakeCredentialRequest req, scoped_refptr<base::RefCountedData<bool>> cancelled,
                      base::OnceCallback<void(MakeResult)> done);
  void GetAssertion(GetAssertionRequest req, scoped_refptr<base::RefCountedData<bool>> cancelled,
                    base::OnceCallback<void(GetResult)> done);

  // True when a vault file exists or a delegate is registered; the discovery only reports an authenticator then.
  bool Available() const;

 private:
  friend class base::NoDestructor<PasskeyService>;
  PasskeyService();
  ~PasskeyService() = delete;
  class Impl;
  std::unique_ptr<Impl> impl_;
};

}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_PASSKEY_SERVICE_H_
