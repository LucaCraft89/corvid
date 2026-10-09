// UNVERIFIED: not compiled. Mirrors ALLOWED_CONFIG_FILES in theme/providers/linux/provider.ts.
#ifndef CORVID_THEME_CONFIG_FILE_ALLOWLIST_H_
#define CORVID_THEME_CONFIG_FILE_ALLOWLIST_H_

#include <string_view>

namespace corvid {

// True only for the exact relative paths the Linux color provider is allowed to read.
inline bool IsAllowedAppearanceConfigFile(std::string_view rel) {
  constexpr std::string_view kAllowed[] = {"gtk-4.0/settings.ini", "gtk-3.0/settings.ini", "gtk-4.0/gtk.css",
                                           "gtk-3.0/gtk.css",      "gtk-4.0/colors.css",   "kdeglobals"};
  for (std::string_view a : kAllowed) {
    if (rel == a) return true;
  }
  return false;
}

}  // namespace corvid

#endif  // CORVID_THEME_CONFIG_FILE_ALLOWLIST_H_
