// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "corvid/passkeys/vault_store.h"

#include "base/files/file.h"
#include "base/files/file_util.h"
#include "base/strings/string_number_conversions.h"

namespace corvid::passkeys {

namespace {
base::FilePath RevPath(const base::FilePath& p) { return p.AddExtension(FILE_PATH_LITERAL("rev")); }

bool WriteAtomic(const base::FilePath& path, const std::string& data) {
  base::FilePath tmp = path.AddExtension(FILE_PATH_LITERAL("tmp"));
  {
    base::File f(tmp, base::File::FLAG_CREATE_ALWAYS | base::File::FLAG_WRITE);
    if (!f.IsValid()) return false;
    if (f.WriteAtCurrentPos(base::as_byte_span(data)) != static_cast<int>(data.size())) return false;
    if (!f.Flush()) return false;  // fsync
  }
#if BUILDFLAG(IS_POSIX)
  if (!base::SetPosixFilePermissions(tmp, base::FILE_PERMISSION_READ_BY_USER | base::FILE_PERMISSION_WRITE_BY_USER))
    return false;
#endif
  return base::ReplaceFile(tmp, path, nullptr);  // rename(2): atomic on POSIX, MoveFileEx on Windows
}
}  // namespace

VaultStore::VaultStore(const base::FilePath& path) : path_(path) {}

bool VaultStore::Exists() const { return base::PathExists(path_); }

std::optional<std::string> VaultStore::Read() const {
  std::string s;
  if (!base::ReadFileToString(path_, &s)) return std::nullopt;
  return s;
}

uint64_t VaultStore::HighestRevision() const {
  std::string s;
  uint64_t r = 0;
  if (base::ReadFileToString(RevPath(path_), &s) && base::StringToUint64(s, &r)) return r;
  return 0;
}

bool VaultStore::Write(const std::string& file_json, uint64_t revision) {
  if (revision < HighestRevision()) return false;
  if (!base::CreateDirectory(path_.DirName())) return false;
  if (!WriteAtomic(path_, file_json)) return false;
  // If this second write fails the vault is still valid; the rollback floor just stays one revision behind.
  WriteAtomic(RevPath(path_), base::NumberToString(revision));
  return true;
}

}  // namespace corvid::passkeys
