// STAND-IN for base/files/file_path.h (std::filesystem). See testing/gtest/include/gtest/gtest.h.
#pragma once
#include <string>
#include <string_view>
namespace base {
class FilePath {
 public:
  FilePath() = default;
  explicit FilePath(std::string p) : p_(std::move(p)) {}
  FilePath AppendASCII(std::string_view s) const { return FilePath(p_.empty() ? std::string(s) : p_ + "/" + std::string(s)); }
  const std::string& value() const { return p_; }
  bool empty() const { return p_.empty(); }
 private:
  std::string p_;
};
}  // namespace base
