// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// File persistence of the passkey vault: <dir>/passkeys.vault.json (the vault, encrypted) and <dir>/passkeys.key (the vault's
// unlock secret, wrapped by a SecretCipher: the OS keyring through OSCrypt in the browser). Writes are atomic and 0600.
#ifndef CORVID_PASSKEYS_PASSKEY_STORAGE_H_
#define CORVID_PASSKEYS_PASSKEY_STORAGE_H_

#include <memory>
#include <optional>

#include "base/files/file_path.h"
#include "corvid/passkeys/vault.h"

namespace corvid::passkeys {

// Wraps the unlock secret for storage. The real one is backed by the OS keyring; tests use a fake.
class SecretCipher {
 public:
  virtual ~SecretCipher() = default;
  virtual std::optional<Bytes> Encrypt(const Bytes& plain) = 0;
  virtual std::optional<Bytes> Decrypt(const Bytes& cipher) = 0;
};

class PasskeyStorage {
 public:
  PasskeyStorage(base::FilePath dir, VaultCrypto* crypto, SecretCipher* cipher);

  // Opens the vault in `dir` or creates a new one (keyring unlock mode: no passphrase). Blocking file IO.
  VaultError OpenOrCreate(std::unique_ptr<Vault>* out);
  // Serializes `vault` (bumps its revision) and writes it atomically. Blocking file IO.
  bool Save(Vault* vault);

  // Atomic 0600 write of an already serialized vault; safe to run on a blocking-capable thread pool task.
  static bool WriteVaultFile(const base::FilePath& path, const std::string& json);

  base::FilePath vault_path() const;
  base::FilePath key_path() const;

 private:
  base::FilePath dir_;
  raw_ptr<VaultCrypto> crypto_;
  raw_ptr<SecretCipher> cipher_;
};

}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_PASSKEY_STORAGE_H_
