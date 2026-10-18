// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "corvid/passkeys/passkey_storage.h"

#include <utility>

#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/logging.h"
#include "base/strings/string_number_conversions.h"
#include "build/build_config.h"

namespace corvid::passkeys {

namespace {

bool WritePrivate(const base::FilePath& path, std::string_view data) {
  if (!base::CreateDirectory(path.DirName())) return false;
  if (!base::ImportantFileWriter::WriteFileAtomically(path, data, "CorvidPasskeys")) return false;
#if BUILDFLAG(IS_POSIX)
  return base::SetPosixFilePermissions(path, base::FILE_PERMISSION_READ_BY_USER | base::FILE_PERMISSION_WRITE_BY_USER);
#else
  return true;
#endif
}

}  // namespace

PasskeyStorage::PasskeyStorage(base::FilePath dir, VaultCrypto* crypto, SecretCipher* cipher)
    : dir_(std::move(dir)), crypto_(crypto), cipher_(cipher) {}

base::FilePath PasskeyStorage::vault_path() const { return dir_.AppendASCII("passkeys.vault.json"); }
base::FilePath PasskeyStorage::key_path() const { return dir_.AppendASCII("passkeys.key"); }

VaultError PasskeyStorage::OpenOrCreate(std::unique_ptr<Vault>* out) {
  std::string vault_json, wrapped;
  const bool have_vault = base::ReadFileToString(vault_path(), &vault_json);
  const bool have_key = base::ReadFileToString(key_path(), &wrapped);

  if (have_vault && have_key) {
    std::optional<Bytes> secret = cipher_->Decrypt(Bytes(wrapped.begin(), wrapped.end()));
    if (!secret) return VaultError::kKeyringMissing;
    Vault::OpenOptions oo;
    oo.keyring_secret = *secret;
    VaultError e = Vault::Open(crypto_, vault_json, oo, out);
    if (e == VaultError::kOk && (*out)->revision() < HighestRevision(vault_path())) {
      LOG(ERROR) << "passkey vault: file is older than the last revision written (rollback); refusing to open it";
      out->reset();
      return VaultError::kBadFormat;
    }
    return e;
  }
  if (have_vault != have_key) {
    // Half a vault is unusable and must never be overwritten silently: the user may still hold the other half.
    LOG(ERROR) << "passkey vault: key file and vault file are not both present; leaving them untouched";
    return VaultError::kKeyringMissing;
  }

  // First use: create the vault and its secret.
  Vault::CreateOptions co;
  co.mode = UnlockMode::kKeyring;
  Bytes secret;
  VaultError e = Vault::Create(crypto_, co, out, &secret);
  if (e != VaultError::kOk) return e;
  std::optional<Bytes> cipher = cipher_->Encrypt(secret);
  if (!cipher) return VaultError::kKeyringMissing;
  // Key first: a vault file without its key would be lost data.
  if (!WritePrivate(key_path(), std::string_view(reinterpret_cast<const char*>(cipher->data()), cipher->size())))
    return VaultError::kKeyringMissing;
  if (!Save(out->get())) return VaultError::kUnsupported;
  return VaultError::kOk;
}

namespace {
base::FilePath RevPath(const base::FilePath& vault_path) { return vault_path.AddExtension(FILE_PATH_LITERAL("rev")); }
}  // namespace

// static
uint64_t PasskeyStorage::HighestRevision(const base::FilePath& vault_path) {
  std::string s;
  uint64_t r = 0;
  if (base::ReadFileToString(RevPath(vault_path), &s) && base::StringToUint64(s, &r)) return r;
  return 0;
}

// static
bool PasskeyStorage::WriteVaultFile(const base::FilePath& path, const std::string& json, uint64_t revision) {
  if (json.empty() || revision < HighestRevision(path)) return false;
  if (!WritePrivate(path, json)) return false;
  // If this second write fails the vault is still valid; the rollback floor just stays one revision behind.
  WritePrivate(RevPath(path), base::NumberToString(revision));
  return true;
}

bool PasskeyStorage::Save(Vault* vault) {
  const std::string json = vault->Serialize();
  return WriteVaultFile(vault_path(), json, vault->revision());
}

}  // namespace corvid::passkeys
