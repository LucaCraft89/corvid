// Compiled and tested against Chromium 155 (M2).
#include "corvid/chrome_shell/layout_storage.h"

#include <string>

#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "corvid/chrome_shell/layout_json.h"

namespace corvid {

LayoutStorage::LayoutStorage(const base::FilePath& profile_dir) : dir_(profile_dir.AppendASCII("Corvid")) {}

std::optional<std::string> LayoutStorage::Read() const {
  std::string out;
  if (!base::ReadFileToStringWithMaxSize(dir_.AppendASCII("layout.json"), &out, kMaxBytes)) return std::nullopt;
  return out;  // not validated here: unreadable/corrupt data is handled (and backed up) by the TypeScript loader
}

bool LayoutStorage::Write(const std::string& json) const {
  // Data comes from the WebUI renderer: refuse anything that cannot be a layout library.
  if (json.size() > kMaxBytes || !IsPlausibleLayoutLibrary(json)) return false;
  if (!base::CreateDirectory(dir_)) return false;
  // Writes a temp file in the same directory and renames it over the target.
  return base::ImportantFileWriter::WriteFileAtomically(dir_.AppendASCII("layout.json"), json);
}

void LayoutStorage::BackupCorrupt(const std::string& json) const {
  if (json.size() > kMaxBytes || !base::CreateDirectory(dir_)) return;
  // Keep the newest three: .1 newest ... .3 oldest. Shift 2->3, 1->2, then write 1.
  for (int i = 2; i >= 1; --i) {
    base::Move(dir_.AppendASCII("layout.corrupt." + std::to_string(i) + ".json"),
               dir_.AppendASCII("layout.corrupt." + std::to_string(i + 1) + ".json"));
  }
  base::ImportantFileWriter::WriteFileAtomically(dir_.AppendASCII("layout.corrupt.1.json"), json);
}

}  // namespace corvid
