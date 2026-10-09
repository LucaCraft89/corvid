// UNVERIFIED: not compiled.
// Serves the fixed allow-list of appearance config files to the WebUI color provider. Anything else is refused.
#ifndef CORVID_THEME_CONFIG_FILE_READER_H_
#define CORVID_THEME_CONFIG_FILE_READER_H_

#include <optional>
#include <string>
#include <string_view>

#include "base/files/file_path.h"

namespace corvid {

inline constexpr size_t kMaxAppearanceFileBytes = 256 * 1024;

// True only for the exact relative paths the Linux color provider may read (mirrors ALLOWED_CONFIG_FILES in
// theme/providers/linux/provider.ts). Rejects absolute paths, "..", and everything not listed.
bool IsAllowedAppearanceConfigFile(std::string_view relative_path);

// Reads <config_home>/<relative_path> if allowed. nullopt if not allowed, missing, unreadable or too large.
// Blocking IO: call on a thread pool with MayBlock().
std::optional<std::string> ReadAppearanceConfigFile(const base::FilePath& config_home, std::string_view relative_path);

// XDG_CONFIG_HOME or $HOME/.config. Blocking-free (reads env only).
base::FilePath GetConfigHome();

}  // namespace corvid

#endif  // CORVID_THEME_CONFIG_FILE_READER_H_
