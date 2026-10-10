// Compiled and tested against Chromium 155 (M2).
#include "corvid/theme/config_file_reader.h"

#include "base/environment.h"
#include "base/files/file_util.h"

namespace corvid {

bool IsAllowedAppearanceConfigFile(std::string_view rel) {
  constexpr std::string_view kAllowed[] = {"gtk-4.0/settings.ini", "gtk-3.0/settings.ini", "gtk-4.0/gtk.css",
                                           "gtk-3.0/gtk.css",      "gtk-4.0/colors.css",   "kdeglobals"};
  for (std::string_view a : kAllowed) {
    if (rel == a) return true;  // exact match only: no normalization tricks possible
  }
  return false;
}

std::optional<std::string> ReadAppearanceConfigFile(const base::FilePath& config_home, std::string_view relative_path) {
  if (!IsAllowedAppearanceConfigFile(relative_path)) return std::nullopt;
  std::string out;
  if (!base::ReadFileToStringWithMaxSize(config_home.AppendASCII(relative_path), &out, kMaxAppearanceFileBytes)) return std::nullopt;
  return out;
}

base::FilePath GetConfigHome() {
  auto env = base::Environment::Create();
  if (auto xdg = env->GetVar("XDG_CONFIG_HOME"); xdg && !xdg->empty() && (*xdg)[0] == '/') return base::FilePath(*xdg);
  if (auto home = env->GetVar("HOME"); home && !home->empty()) return base::FilePath(*home).AppendASCII(".config");
  return base::FilePath();
}

}  // namespace corvid
