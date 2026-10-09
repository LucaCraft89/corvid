// UNVERIFIED: not compiled.
#include "corvid/chrome_shell/layout_storage.h"

#include "base/files/file_util.h"
#include "base/files/important_file_writer.h"
#include "base/strings/stringprintf.h"

namespace corvid {

LayoutStorage::LayoutStorage(const base::FilePath& profile_dir) : dir_(profile_dir.AppendASCII("Corvid")) {}

std::optional<std::string> LayoutStorage::Read() const {
  std::string out;
  if (!base::ReadFileToStringWithMaxSize(dir_.AppendASCII("layout.json"), &out, kMaxBytes)) return std::nullopt;
  return out;
}

bool LayoutStorage::Write(const std::string& json) const {
  if (json.size() > kMaxBytes) return false;
  if (!base::CreateDirectory(dir_)) return false;
  // ImportantFileWriter writes to a temp file in the same directory and renames over the target.
  return base::ImportantFileWriter::WriteFileAtomically(dir_.AppendASCII("layout.json"), json);
}

void LayoutStorage::BackupCorrupt(const std::string& json) const {
  if (json.size() > kMaxBytes || !base::CreateDirectory(dir_)) return;
  for (int i = 2; i >= 1; --i) {
    base::Move(dir_.AppendASCII(base::StringPrintf("layout.corrupt.%d.json", i)),
               dir_.AppendASCII(base::StringPrintf("layout.corrupt.%d.json", i + 1)));
  }
  base::ImportantFileWriter::WriteFileAtomically(dir_.AppendASCII("layout.corrupt.1.json"), json);
}

}  // namespace corvid
