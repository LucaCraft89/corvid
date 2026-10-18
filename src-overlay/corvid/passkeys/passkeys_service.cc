// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "corvid/passkeys/passkeys_service.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/logging.h"
#include "base/no_destructor.h"
#include "base/path_service.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/single_thread_task_runner.h"
#include "base/task/thread_pool.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/ui/simple_message_box.h"
#include "chrome/common/chrome_paths.h"
#include "components/os_crypt/async/browser/os_crypt_async.h"
#include "components/os_crypt/async/common/encryptor.h"
#include "corvid/passkeys/crypto_p256_boringssl.h"
#include "device/fido/fido_discovery_factory.h"

namespace corvid::passkeys {

// Wraps the vault's unlock secret with the OS keyring (OSCrypt). Without a keyring Chromium falls back to its built-in
// obfuscation key, the same protection saved passwords get on such a system.
class PasskeysService::KeyringCipher : public SecretCipher {
 public:
  explicit KeyringCipher(scoped_refptr<os_crypt_async::Encryptor> encryptor) : encryptor_(std::move(encryptor)) {}
  std::optional<Bytes> Encrypt(const Bytes& plain) override {
    std::string out;
    if (!encryptor_->EncryptString(std::string(plain.begin(), plain.end()), &out)) return std::nullopt;
    return Bytes(out.begin(), out.end());
  }
  std::optional<Bytes> Decrypt(const Bytes& cipher) override {
    std::string out;
    if (!encryptor_->DecryptString(std::string(cipher.begin(), cipher.end()), &out)) return std::nullopt;
    return Bytes(out.begin(), out.end());
  }

 private:
  scoped_refptr<os_crypt_async::Encryptor> encryptor_;
};

struct PasskeysService::OpenResult {
  std::unique_ptr<Vault> vault;
  VaultError error = VaultError::kOk;
};

namespace {

std::unique_ptr<device::FidoDiscoveryBase> MakeDiscovery() {
  return std::make_unique<SoftwareDiscovery>(PasskeysService::Get());
}

}  // namespace

void RegisterLinuxPlatformDiscovery() {
  device::FidoDiscoveryFactory::SetLinuxPlatformDiscoveryFactory(&MakeDiscovery);
}

// static
PasskeysService* PasskeysService::Get() {
  static base::NoDestructor<PasskeysService> instance;
  return instance.get();
}

PasskeysService::PasskeysService() = default;
PasskeysService::~PasskeysService() = default;

void PasskeysService::WhenReady(base::OnceCallback<void(PasskeyBackend*)> callback) {
  switch (state_) {
    case State::kReady:
      base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
          FROM_HERE, base::BindOnce(std::move(callback), static_cast<PasskeyBackend*>(this)));
      return;
    case State::kFailed:
      base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
          FROM_HERE, base::BindOnce(std::move(callback), static_cast<PasskeyBackend*>(nullptr)));
      return;
    case State::kOpening:
      waiting_.push_back(std::move(callback));
      return;
    case State::kIdle:
      waiting_.push_back(std::move(callback));
      StartOpening();
      return;
  }
}

void PasskeysService::StartOpening() {
  state_ = State::kOpening;
  g_browser_process->os_crypt_async()->GetInstance(
      base::BindOnce(&PasskeysService::OnEncryptor, weak_factory_.GetWeakPtr()));
}

void PasskeysService::OnEncryptor(scoped_refptr<os_crypt_async::Encryptor> encryptor) {
  cipher_ = std::make_unique<KeyringCipher>(std::move(encryptor));
  vault_crypto_ = CreateBoringSslVaultCrypto();
  auth_crypto_ = CreateBoringSslAuthenticatorCrypto();
  base::FilePath user_data_dir;
  if (!base::PathService::Get(chrome::DIR_USER_DATA, &user_data_dir)) {
    Finish(false);
    return;
  }
  storage_ = std::make_unique<PasskeyStorage>(user_data_dir.AppendASCII("Passkeys"), vault_crypto_.get(), cipher_.get());
  base::ThreadPool::PostTaskAndReplyWithResult(
      FROM_HERE, {base::MayBlock(), base::TaskPriority::USER_VISIBLE, base::TaskShutdownBehavior::BLOCK_SHUTDOWN},
      base::BindOnce(
          [](PasskeyStorage* storage) {
            auto result = std::make_unique<OpenResult>();
            result->error = storage->OpenOrCreate(&result->vault);
            return result;
          },
          storage_.get()),
      base::BindOnce(&PasskeysService::OnOpened, weak_factory_.GetWeakPtr()));
}

void PasskeysService::OnOpened(std::unique_ptr<OpenResult> result) {
  if (result->error != VaultError::kOk || !result->vault) {
    LOG(ERROR) << "passkeys: vault unavailable (" << static_cast<int>(result->error) << ")";
    Finish(false);
    return;
  }
  vault_ = std::move(result->vault);
  core_ = std::make_unique<AuthenticatorCore>(vault_.get(), this, auth_crypto_.get());
  Finish(true);
}

void PasskeysService::Finish(bool ok) {
  state_ = ok ? State::kReady : State::kFailed;
  std::vector<base::OnceCallback<void(PasskeyBackend*)>> waiting = std::move(waiting_);
  for (auto& cb : waiting) {
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce(std::move(cb), ok ? static_cast<PasskeyBackend*>(this) : nullptr));
  }
}

AuthenticatorCore* PasskeysService::core() { return core_.get(); }
Vault* PasskeysService::vault() { return vault_.get(); }

void PasskeysService::Persist() {
  if (state_ != State::kReady) return;
  // Serialize here (it bumps the authenticated revision) and write on a sequenced pool task so writes stay in order.
  if (!writer_) {
    writer_ = base::ThreadPool::CreateSequencedTaskRunner(
        {base::MayBlock(), base::TaskPriority::USER_VISIBLE, base::TaskShutdownBehavior::BLOCK_SHUTDOWN});
  }
  writer_->PostTask(FROM_HERE, base::BindOnce(base::IgnoreResult(&PasskeyStorage::WriteVaultFile),
                                              storage_->vault_path(), vault_->Serialize()));
}

bool PasskeysService::Presence(const std::string& rp_id, Purpose purpose) {
  const std::u16string site = base::UTF8ToUTF16(rp_id);
  const std::u16string message = purpose == Purpose::kCreate
                                     ? u"Create a passkey for " + site + u" on this device?"
                                     : u"Sign in to " + site + u" with a passkey from this device?";
  presence_confirmed_ = chrome::ShowQuestionMessageBoxSync(nullptr, u"Passkey", message) == chrome::MESSAGE_BOX_RESULT_YES;
  return presence_confirmed_;
}

bool PasskeysService::Verification() {
  // The confirmation just shown is the user's explicit local approval; there is no biometric or PIN on this device.
  return presence_confirmed_;
}

}  // namespace corvid::passkeys
