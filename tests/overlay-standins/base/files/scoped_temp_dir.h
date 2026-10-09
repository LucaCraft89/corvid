// STAND-IN for base/files/scoped_temp_dir.h.
#pragma once
#include <cstdlib>
#include <filesystem>
#include "base/files/file_path.h"
namespace base {
class ScopedTempDir {
 public:
  ~ScopedTempDir() { if (!dir_.empty()) std::filesystem::remove_all(dir_.value()); }
  bool CreateUniqueTempDir() {
    std::string t = (std::filesystem::temp_directory_path() / "corvid-standin-XXXXXX").string();
    if (!mkdtemp(t.data())) return false;
    dir_ = FilePath(t);
    return true;
  }
  const FilePath& GetPath() const { return dir_; }
 private:
  FilePath dir_;
};
}  // namespace base
