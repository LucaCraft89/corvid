// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT: written without a Chromium tree. C++ port of reference/vault.ts (the TS file and its tests are the contract;
// the on-disk JSON must open in both implementations). All cryptography is behind VaultCrypto so the format logic
// (AAD binding, revision, tamper detection, KDF floor) is testable with a fake and the real primitives
// (vault_crypto_boringssl.cc) are swapped in. Never logs or stores key material unencrypted.
#ifndef CORVID_PASSKEYS_VAULT_H_
#define CORVID_PASSKEYS_VAULT_H_

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace corvid::passkeys {

using Bytes = std::vector<uint8_t>;

class VaultCrypto {
 public:
  virtual ~VaultCrypto() = default;
  // Argon2id, 32-byte output. m is in KiB. nullopt on failure.
  virtual std::optional<Bytes> Argon2id(const std::string& password, const Bytes& salt, uint32_t m, uint32_t t,
                                        uint32_t p) = 0;
  virtual Bytes HkdfSha256(const Bytes& ikm, const Bytes& salt, const std::string& info, size_t len) = 0;
  // XChaCha20-Poly1305 (24-byte nonce, 16-byte tag appended to the ciphertext).
  virtual Bytes Seal(const Bytes& key, const Bytes& nonce, const Bytes& aad, const Bytes& plaintext) = 0;
  virtual std::optional<Bytes> Open(const Bytes& key, const Bytes& nonce, const Bytes& aad, const Bytes& ciphertext) = 0;
  virtual Bytes Random(size_t n) = 0;
};

enum class UnlockMode { kPassphrase, kKeyring, kPassphraseAndKeyring };
const char* UnlockModeName(UnlockMode m);

struct KdfParams {
  uint32_t m = 64 * 1024;  // KiB
  uint32_t t = 3;
  uint32_t p = 1;
};
inline constexpr KdfParams kMinKdf{8 * 1024, 2, 1};  // downgrade floor (matches MIN_KDF in vault.ts)

enum class VaultError { kOk, kBadFormat, kAuthFailed, kKdfTooWeak, kLocked, kKeyringMissing, kUnsupported };

struct Credential {
  std::string id;  // base64url
  std::string rp_id;
  std::string user_handle;  // base64url
  std::string user_name;
  std::string display_name;
  int alg = -7;                // ES256
  std::string private_key;     // base64url raw 32B scalar; only ever inside the sealed body
  uint32_t sign_count = 0;
  int64_t created_at = 0;
  std::string label;
  bool discoverable = true;
};

class Vault {
 public:
  struct CreateOptions {
    UnlockMode mode = UnlockMode::kPassphrase;
    std::string passphrase;
    std::optional<Bytes> keyring_secret;  // for create: if empty and mode needs it, one is generated and returned via new_keyring_secret
    KdfParams kdf;
  };
  struct OpenOptions {
    std::string passphrase;
    std::optional<Bytes> keyring_secret;
  };

  // `crypto` must outlive the Vault.
  static VaultError Create(VaultCrypto* crypto, const CreateOptions& opts, std::unique_ptr<Vault>* out,
                           Bytes* new_keyring_secret = nullptr);
  static VaultError Open(VaultCrypto* crypto, const std::string& file_json, const OpenOptions& opts,
                         std::unique_ptr<Vault>* out);
  ~Vault();

  // Bumps the authenticated revision, fresh nonces every call. Empty string if locked.
  std::string Serialize();
  uint64_t revision() const { return revision_; }
  UnlockMode mode() const { return mode_; }
  bool locked() const { return locked_; }
  void Lock();  // zeroes key material and credentials

  VaultError Add(Credential c);
  const std::vector<Credential>& credentials() const { return credentials_; }  // callers must not expose private_key to UI
  const Credential* Get(const std::string& id) const;
  std::vector<const Credential*> FindByRp(const std::string& rp_id) const;
  bool Delete(const std::string& id);
  bool Rename(const std::string& id, const std::string& label);
  void BumpSignCount(const std::string& id);

 private:
  Vault(VaultCrypto* crypto);
  std::string HeaderAad(uint64_t revision) const;  // canonical bytes, see vault.ts headerAad
  VaultCrypto* crypto_;
  UnlockMode mode_ = UnlockMode::kPassphrase;
  KdfParams kdf_;
  Bytes salt_;
  uint64_t revision_ = 0;
  Bytes vault_key_;
  Bytes kek_;
  bool locked_ = true;
  std::vector<Credential> credentials_;
};

}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_VAULT_H_
