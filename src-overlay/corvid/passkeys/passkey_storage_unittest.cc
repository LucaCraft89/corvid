// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "corvid/passkeys/passkey_storage.h"

#include "base/files/file_util.h"
#include "base/files/scoped_temp_dir.h"
#include "corvid/passkeys/vault_crypto_boringssl.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace corvid::passkeys {
namespace {

// Not secure: a reversible stand-in for the OS keyring wrapper.
class XorCipher : public SecretCipher {
 public:
  explicit XorCipher(uint8_t k) : k_(k) {}
  std::optional<Bytes> Encrypt(const Bytes& plain) override { return Xor(plain); }
  std::optional<Bytes> Decrypt(const Bytes& cipher) override {
    if (broken_) return std::nullopt;
    return Xor(cipher);
  }
  bool broken_ = false;

 private:
  Bytes Xor(Bytes b) const {
    for (auto& x : b) x ^= k_;
    return b;
  }
  uint8_t k_;
};

Credential Cred(const std::string& id) {
  Credential c;
  c.id = id; c.rp_id = "example.com"; c.user_handle = "dXNlcg"; c.user_name = "u"; c.display_name = "U";
  c.private_key = "SECRET-PRIVATE-KEY-MARKER-" + id; c.created_at = 1;
  return c;
}

TEST(CorvidPasskeyStorageTest, CreatesPersistsAndReopens) {
  base::ScopedTempDir dir;
  ASSERT_TRUE(dir.CreateUniqueTempDir());
  auto crypto = CreateBoringSslVaultCrypto();
  XorCipher cipher(0x5a);
  PasskeyStorage storage(dir.GetPath().AppendASCII("Passkeys"), crypto.get(), &cipher);

  std::unique_ptr<Vault> v;
  ASSERT_EQ(storage.OpenOrCreate(&v), VaultError::kOk);
  EXPECT_EQ(v->mode(), UnlockMode::kKeyring);
  ASSERT_EQ(v->Add(Cred("a")), VaultError::kOk);
  ASSERT_TRUE(storage.Save(v.get()));

  std::string file;
  ASSERT_TRUE(base::ReadFileToString(storage.vault_path(), &file));
  EXPECT_EQ(file.find("SECRET-PRIVATE-KEY-MARKER"), std::string::npos);
  EXPECT_EQ(file.find("example.com"), std::string::npos);
#if BUILDFLAG(IS_POSIX)
  int mode = 0;
  ASSERT_TRUE(base::GetPosixFilePermissions(storage.vault_path(), &mode));
  EXPECT_EQ(mode, base::FILE_PERMISSION_READ_BY_USER | base::FILE_PERMISSION_WRITE_BY_USER);
  ASSERT_TRUE(base::GetPosixFilePermissions(storage.key_path(), &mode));
  EXPECT_EQ(mode, base::FILE_PERMISSION_READ_BY_USER | base::FILE_PERMISSION_WRITE_BY_USER);
#endif

  PasskeyStorage again(dir.GetPath().AppendASCII("Passkeys"), crypto.get(), &cipher);
  std::unique_ptr<Vault> w;
  ASSERT_EQ(again.OpenOrCreate(&w), VaultError::kOk);
  ASSERT_NE(w->Get("a"), nullptr);
  EXPECT_EQ(w->Get("a")->rp_id, "example.com");
}

TEST(CorvidPasskeyStorageTest, UnreadableKeyringSecretDoesNotOverwriteTheVault) {
  base::ScopedTempDir dir;
  ASSERT_TRUE(dir.CreateUniqueTempDir());
  auto crypto = CreateBoringSslVaultCrypto();
  XorCipher cipher(0x11);
  PasskeyStorage storage(dir.GetPath().AppendASCII("Passkeys"), crypto.get(), &cipher);
  std::unique_ptr<Vault> v;
  ASSERT_EQ(storage.OpenOrCreate(&v), VaultError::kOk);
  std::string before;
  ASSERT_TRUE(base::ReadFileToString(storage.vault_path(), &before));

  cipher.broken_ = true;  // keyring locked or unavailable
  std::unique_ptr<Vault> w;
  EXPECT_EQ(storage.OpenOrCreate(&w), VaultError::kKeyringMissing);
  std::string after;
  ASSERT_TRUE(base::ReadFileToString(storage.vault_path(), &after));
  EXPECT_EQ(before, after);
}

TEST(CorvidPasskeyStorageTest, HalfAVaultIsNeverOverwritten) {
  base::ScopedTempDir dir;
  ASSERT_TRUE(dir.CreateUniqueTempDir());
  auto crypto = CreateBoringSslVaultCrypto();
  XorCipher cipher(0x22);
  PasskeyStorage storage(dir.GetPath().AppendASCII("Passkeys"), crypto.get(), &cipher);
  std::unique_ptr<Vault> v;
  ASSERT_EQ(storage.OpenOrCreate(&v), VaultError::kOk);
  std::string before;
  ASSERT_TRUE(base::ReadFileToString(storage.vault_path(), &before));
  ASSERT_TRUE(base::DeleteFile(storage.key_path()));

  std::unique_ptr<Vault> w;
  EXPECT_NE(storage.OpenOrCreate(&w), VaultError::kOk);
  std::string after;
  ASSERT_TRUE(base::ReadFileToString(storage.vault_path(), &after));
  EXPECT_EQ(before, after);
  EXPECT_FALSE(base::PathExists(storage.key_path()));
}

}  // namespace
}  // namespace corvid::passkeys
