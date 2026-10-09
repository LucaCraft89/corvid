// STAND-IN for base/environment.h.
#pragma once
#include <cstdlib>
#include <memory>
#include <optional>
#include <string>
namespace base {
class Environment {
 public:
  static std::unique_ptr<Environment> Create() { return std::make_unique<Environment>(); }
  std::optional<std::string> GetVar(const char* name) const {
    const char* v = std::getenv(name);
    return v ? std::optional<std::string>(v) : std::nullopt;
  }
};
}  // namespace base
