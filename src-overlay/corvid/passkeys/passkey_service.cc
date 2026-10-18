// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT (G4). See passkey_service.h for the threading model.
#include "corvid/passkeys/passkey_service.h"

#include <utility>

#include "base/base64url.h"
#include "base/functional/bind.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/ref_counted.h"
#include "base/synchronization/waitable_event.h"
#include "base/task/single_thread_task_runner.h"
#include "base/task/thread_pool.h"
#include "base/time/time.h"
#include "corvid/passkeys/authenticator_crypto_boringssl.h"
#include "corvid/passkeys/vault_crypto_boringssl.h"
#include "corvid/passkeys/vault_store.h"

namespace corvid::passkeys {

namespace {
constexpr base::TimeDelta kUserTimeout = base::Minutes(2);
constexpr base::TimeDelta kAutoLockAfter = base::Minutes(10);

std::string Base64Url(const Bytes& b) {
  std::string out;
  base::Base64UrlEncode(b, base::Base64UrlEncodePolicy::OMIT_PADDING, &out);
  return out;
}

// One-shot rendezvous between the vault sequence (waits) and the UI thread (answers).
template <typename T>
struct Slot : public base::RefCountedThreadSafe<Slot<T>> {
  base::WaitableEvent event{base::WaitableEvent::ResetPolicy::MANUAL, base::WaitableEvent::InitialState::NOT_SIGNALED};
  T value{};
  void Set(T v) {
    value = std::move(v);
    event.Signal();
  }

 private:
  friend class base::RefCountedThreadSafe<Slot<T>>;
  ~Slot() = default;
};
}  // namespace

class PasskeyService::Impl {
 public:
  Impl()
      : vault_runner_(base::ThreadPool::CreateSequencedTaskRunner(
            {base::MayBlock(), base::WithBaseSyncPrimitives(), base::TaskPriority::USER_VISIBLE})),
        vault_crypto_(CreateBoringSslVaultCrypto()),
        auth_crypto_(CreateBoringSslAuthenticatorCrypto()) {}

  // ---- UI thread ----
  void SetPromptDelegate(PasskeyPromptDelegate* d) {
    delegate_ = d;
    ui_runner_ = d ? base::SingleThreadTaskRunner::GetCurrentDefault() : nullptr;
  }
  void SetVaultPath(const base::FilePath& p) {
    vault_runner_->PostTask(FROM_HERE, base::BindOnce(&Impl::SetStoreOnVaultSequence, base::Unretained(this), p));
    path_set_ = true;
  }
  bool Available() const { return delegate_ && path_set_; }

  // ---- vault sequence ----
  void SetStoreOnVaultSequence(const base::FilePath& p) { store_ = std::make_unique<VaultStore>(p); }

  // Blocking helpers: run `post` on the UI thread, wait for the answer, fall back to `fallback` on timeout/no delegate.
  template <typename T, typename F>
  T AskUi(T fallback, F post /* void(PasskeyPromptDelegate*, base::OnceCallback<void(T)>) */) {
    auto slot = base::MakeRefCounted<Slot<T>>();
    auto runner = ui_runner_;
    if (!runner) return fallback;
    runner->PostTask(FROM_HERE, base::BindOnce(
        [](Impl* self, scoped_refptr<Slot<T>> slot, F post) {
          if (!self->delegate_) {
            slot->Set(T{});
            return;
          }
          post(self->delegate_.get(), base::BindOnce(&Slot<T>::Set, slot));
        },
        base::Unretained(this), slot, std::move(post)));
    if (!slot->event.TimedWait(kUserTimeout)) return fallback;
    return std::move(slot->value);
  }

  bool EnsureUnlocked(const bool* cancelled) {
    if (vault_ && !vault_->locked()) return true;
    if (!store_) return false;
    const bool first_run = !store_->Exists();
    for (int attempt = 0; attempt < 3; ++attempt) {
      if (*cancelled) return false;
      std::optional<std::string> pass = AskUi<std::optional<std::string>>(
          std::nullopt, [first_run](PasskeyPromptDelegate* d, base::OnceCallback<void(std::optional<std::string>)> cb) {
            d->RequestPassphrase(first_run, std::move(cb));
          });
      if (!pass || pass->empty()) return false;
      std::unique_ptr<Vault> v;
      if (first_run) {
        Vault::CreateOptions o;
        o.passphrase = *pass;
        if (Vault::Create(vault_crypto_.get(), o, &v) != VaultError::kOk) return false;
        if (!store_->Write(v->Serialize(), v->revision())) return false;
        vault_ = std::move(v);
        TouchAutoLock();
        return true;
      }
      auto json = store_->Read();
      if (!json) return false;
      Vault::OpenOptions o;
      o.passphrase = *pass;
      VaultError e = Vault::Open(vault_crypto_.get(), *json, o, &v);
      if (e == VaultError::kOk) {
        if (v->revision() < store_->HighestRevision()) return false;  // rollback: an older vault file was swapped in
        vault_ = std::move(v);
        TouchAutoLock();
        return true;
      }
      if (e != VaultError::kAuthFailed) return false;  // bad format / weak KDF: retrying will not help
    }
    return false;
  }

  void TouchAutoLock() {
    const uint64_t gen = ++lock_generation_;
    vault_runner_->PostDelayedTask(FROM_HERE, base::BindOnce(&Impl::AutoLock, base::Unretained(this), gen),
                                   kAutoLockAfter);
  }
  void AutoLock(uint64_t gen) {
    if (gen == lock_generation_ && vault_) vault_->Lock();
  }

  bool Persist() {
    std::string json = vault_->Serialize();
    return store_->Write(json, vault_->revision());
  }

  class Gate : public UserGate {
   public:
    Gate(Impl* impl, const bool* cancelled) : impl_(impl), cancelled_(cancelled) {}
    bool Presence(const std::string& rp_id, Purpose p) override {
      if (*cancelled_) return false;
      return impl_->AskUi<bool>(false, [rp_id, p](PasskeyPromptDelegate* d, base::OnceCallback<void(bool)> cb) {
        d->ConfirmPresence(rp_id, p == Purpose::kCreate, std::move(cb));
      });
    }
    // Unlocking the vault IS user verification (passphrase), done in EnsureUnlocked before the core runs.
    bool Verification() override { return !*cancelled_ && !impl_->vault_->locked(); }

   private:
    Impl* impl_;
    const bool* cancelled_;
  };

  MakeResult DoMake(const MakeCredentialRequest& req, const bool* cancelled) {
    MakeResult r{CtapError::kOperationDenied, {}};
    if (!EnsureUnlocked(cancelled)) return r;
    Gate gate(this, cancelled);
    AuthenticatorCore core(vault_.get(), &gate, auth_crypto_.get());
    r.error = core.MakeCredential(req, &r.response);
    if (r.error == CtapError::kOk && !Persist()) {
      // Never hand out a credential that is not on disk.
      vault_->Delete(Base64Url(r.response.credential_id));
      r = MakeResult{CtapError::kInvalidParameter, {}};
    }
    TouchAutoLock();
    return r;
  }

  GetResult DoGet(GetAssertionRequest req, const bool* cancelled) {
    GetResult r{CtapError::kOperationDenied, {}};
    if (!EnsureUnlocked(cancelled)) return r;
    Gate gate(this, cancelled);
    req.pick_credential = [this](const std::vector<const Credential*>& cs) -> std::string {
      std::vector<CredentialSummary> sums;
      for (const Credential* c : cs) sums.push_back({c->id, c->rp_id, c->user_name, c->display_name, c->created_at});
      return AskUi<std::string>(
          std::string(), [sums](PasskeyPromptDelegate* d, base::OnceCallback<void(std::string)> cb) {
            d->PickCredential(sums, std::move(cb));
          });
    };
    AuthenticatorCore core(vault_.get(), &gate, auth_crypto_.get());
    r.error = core.GetAssertion(req, &r.response);
    if (r.error == CtapError::kOk && !Persist()) r = GetResult{CtapError::kInvalidParameter, {}};  // sign count must persist
    TouchAutoLock();
    return r;
  }

  scoped_refptr<base::SequencedTaskRunner> vault_runner_;
  scoped_refptr<base::SingleThreadTaskRunner> ui_runner_;
  raw_ptr<PasskeyPromptDelegate> delegate_ = nullptr;  // UI thread
  bool path_set_ = false;                              // UI thread
  // vault sequence only:
  std::unique_ptr<VaultCrypto> vault_crypto_;
  std::unique_ptr<AuthenticatorCrypto> auth_crypto_;
  std::unique_ptr<VaultStore> store_;
  std::unique_ptr<Vault> vault_;
  uint64_t lock_generation_ = 0;
};

PasskeyService::PasskeyService() : impl_(std::make_unique<Impl>()) {}

PasskeyService& PasskeyService::Get() {
  static base::NoDestructor<PasskeyService> instance;
  return *instance;
}

void PasskeyService::SetPromptDelegate(PasskeyPromptDelegate* d) { impl_->SetPromptDelegate(d); }
void PasskeyService::SetVaultPath(const base::FilePath& p) { impl_->SetVaultPath(p); }
bool PasskeyService::Available() const { return impl_->Available(); }

void PasskeyService::MakeCredential(MakeCredentialRequest req, scoped_refptr<base::RefCountedData<bool>> cancelled,
                                    base::OnceCallback<void(MakeResult)> done) {
  impl_->vault_runner_->PostTaskAndReplyWithResult(
      FROM_HERE,
      base::BindOnce(
          [](Impl* impl, MakeCredentialRequest req, scoped_refptr<base::RefCountedData<bool>> cancelled) {
            return impl->DoMake(req, &cancelled->data);
          },
          base::Unretained(impl_.get()), std::move(req), std::move(cancelled)),
      std::move(done));
}

void PasskeyService::GetAssertion(GetAssertionRequest req, scoped_refptr<base::RefCountedData<bool>> cancelled,
                                  base::OnceCallback<void(GetResult)> done) {
  impl_->vault_runner_->PostTaskAndReplyWithResult(
      FROM_HERE,
      base::BindOnce(
          [](Impl* impl, GetAssertionRequest req, scoped_refptr<base::RefCountedData<bool>> cancelled) {
            return impl->DoGet(std::move(req), &cancelled->data);
          },
          base::Unretained(impl_.get()), std::move(req), std::move(cancelled)),
      std::move(done));
}

}  // namespace corvid::passkeys
