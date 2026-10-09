// STAND-IN for the few base/files/file_util.h functions the overlay tests use.
#pragma once
#include <filesystem>
#include <fstream>
#include <iterator>
#include <sstream>
#include <string>
#include <string_view>
#include "base/files/file_path.h"
namespace base {
inline bool ReadFileToStringWithMaxSize(const FilePath& p, std::string* out, size_t max) {
  std::ifstream f(p.value(), std::ios::binary);
  if (!f) return false;
  std::ostringstream ss; ss << f.rdbuf();
  *out = ss.str();
  if (out->size() > max) { out->resize(max); return false; }  // real impl also fills a truncated prefix and returns false
  return true;
}
inline bool WriteFile(const FilePath& p, std::string_view data) {
  std::filesystem::create_directories(std::filesystem::path(p.value()).parent_path());
  std::ofstream f(p.value(), std::ios::binary);
  f.write(data.data(), static_cast<std::streamsize>(data.size()));
  return static_cast<bool>(f);
}
}  // namespace base
