// UNVERIFIED: not compiled.
#include "corvid/theme/linux_appearance_source.h"

#include <utility>

#include "corvid/theme/config_file_reader.h"

namespace corvid {

LinuxAppearanceSource::LinuxAppearanceSource(base::FilePath config_home, std::string xdg_current_desktop,
                                             base::RepeatingCallback<void(std::string_view)> bad_message)
    : config_home_(std::move(config_home)), desktop_(std::move(xdg_current_desktop)), bad_message_(std::move(bad_message)) {}

LinuxAppearanceSource::~LinuxAppearanceSource() = default;

std::optional<PortalValueVariant> LinuxAppearanceSource::ReadPortalSetting(std::string_view key) {
  if (key == "color-scheme") return PortalValueVariant(snapshot_.color_scheme);
  if (key == "contrast") return PortalValueVariant(snapshot_.contrast);
  if (key == "accent-color") {
    if (!snapshot_.accent) return std::nullopt;
    return PortalValueVariant(*snapshot_.accent);
  }
  bad_message_.Run("unknown portal key");
  return std::nullopt;
}

std::optional<std::string> LinuxAppearanceSource::ReadConfigFile(std::string_view relative_path) {
  if (!IsAllowedAppearanceConfigFile(relative_path)) {
    bad_message_.Run("config file not on the appearance allow-list");
    return std::nullopt;
  }
  return ReadAppearanceConfigFile(config_home_, relative_path);
}

std::optional<std::string> LinuxAppearanceSource::ReadGsettings(std::string_view key) {
  if (key != "color-scheme" && key != "accent-color") bad_message_.Run("unknown gsettings key");
  return std::nullopt;
}

}  // namespace corvid
