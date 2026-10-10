// Compiled and tested against Chromium 155 in M2 (docs/notes/chromium-api-m2.md). Profile-scoped layout file with atomic writes.
#ifndef CORVID_CHROME_SHELL_LAYOUT_STORAGE_H_
#define CORVID_CHROME_SHELL_LAYOUT_STORAGE_H_

#include <optional>
#include <string>

#include "base/files/file_path.h"

namespace corvid {

class LayoutStorage {
 public:
  // profile_dir: the profile directory; the file is <profile_dir>/Corvid/layout.json.
  explicit LayoutStorage(const base::FilePath& profile_dir);

  // Blocking file IO: call from a thread pool task with MayBlock().
  std::optional<std::string> Read() const;
  bool Write(const std::string& json) const;                // write temp file then rename (atomic)
  void BackupCorrupt(const std::string& json) const;        // keeps the last 3 copies as layout.corrupt.N.json

  static constexpr size_t kMaxBytes = 1024 * 1024;           // refuse absurd files (renderer-supplied on write)

 private:
  base::FilePath dir_;
};

}  // namespace corvid

#endif  // CORVID_CHROME_SHELL_LAYOUT_STORAGE_H_
