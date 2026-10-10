// Compiled and tested against Chromium 155 in M2 (docs/notes/chromium-api-m2.md). Browser-side implementation of corvid.theme.mojom.LinuxAppearanceSource.
// Deliberately free of D-Bus: portal values come from an AppearanceSnapshot (fed by NativeThemeAppearanceObserver,
// which sees what upstream's portal_settings_linux.cc already read), config files come from the exact-match
// allow-list in config_file_reader.h. Kept free of Mojo types so it unit-tests without a message pipe; the thin
// mojom::LinuxAppearanceSource adapter that owns the Receiver is written with the WebUI controller.
#ifndef CORVID_THEME_LINUX_APPEARANCE_SOURCE_H_
#define CORVID_THEME_LINUX_APPEARANCE_SOURCE_H_

#include <optional>
#include <string>
#include <string_view>
#include <variant>

#include "base/files/file_path.h"
#include "base/functional/callback.h"
#include "corvid/theme/appearance_snapshot.h"

namespace corvid {

// Mirrors mojom PortalValue: a uint32 or an (r,g,b) triple in 0..1.
using PortalValueVariant = std::variant<uint32_t, std::array<double, 3>>;

class LinuxAppearanceSource {
 public:
  // |bad_message| is called (with a reason) when the caller asks for something outside the contract, e.g. a config
  // path that is not on the allow-list; production binds it to mojo::ReportBadMessage so the renderer is killed.
  LinuxAppearanceSource(base::FilePath config_home, std::string xdg_current_desktop,
                        base::RepeatingCallback<void(std::string_view)> bad_message);
  ~LinuxAppearanceSource();

  void UpdateSnapshot(const AppearanceSnapshot& snapshot) { snapshot_ = snapshot; }

  // key: "color-scheme" | "contrast" | "accent-color". nullopt = unavailable/unset. Unknown keys are a bad message.
  std::optional<PortalValueVariant> ReadPortalSetting(std::string_view key);
  // Allow-listed files only; others are a bad message and return nullopt. Blocking IO (MayBlock thread).
  std::optional<std::string> ReadConfigFile(std::string_view relative_path);
  // No gsettings subprocess is spawned: NativeTheme already carries GNOME's values. Always nullopt; the TS provider
  // falls through to portal/config files. Unknown keys are a bad message.
  std::optional<std::string> ReadGsettings(std::string_view key);
  const std::string& GetDesktop() const { return desktop_; }

 private:
  base::FilePath config_home_;
  std::string desktop_;
  base::RepeatingCallback<void(std::string_view)> bad_message_;
  AppearanceSnapshot snapshot_;
};

}  // namespace corvid

#endif  // CORVID_THEME_LINUX_APPEARANCE_SOURCE_H_
