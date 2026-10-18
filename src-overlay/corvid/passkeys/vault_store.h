// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT (G4). File persistence for the sealed vault: atomic write (tmp + fsync + rename), mode 0600, and a rollback
// check (the stored revision must never go backwards: a copy of an older vault file is rejected). Blocking I/O: call on
// the vault sequence only.
#ifndef CORVID_PASSKEYS_VAULT_STORE_H_
#define CORVID_PASSKEYS_VAULT_STORE_H_

#include <cstdint>
#include <optional>
#include <string>

#include "base/files/file_path.h"

namespace corvid::passkeys {

class VaultStore {
 public:
  explicit VaultStore(const base::FilePath& path);
  bool Exists() const;
  // Returns the file JSON, or nullopt if absent/unreadable.
  std::optional<std::string> Read() const;
  // False on any I/O failure (the old file is left untouched) or if `revision` < the highest revision seen so far
  // (recorded in `<path>.rev`, written after the vault file).
  bool Write(const std::string& file_json, uint64_t revision);
  // Highest revision ever written or accepted; 0 if none. Open() callers reject vaults older than this.
  uint64_t HighestRevision() const;

 private:
  base::FilePath path_;
};

}  // namespace corvid::passkeys

#endif  // CORVID_PASSKEYS_VAULT_STORE_H_
