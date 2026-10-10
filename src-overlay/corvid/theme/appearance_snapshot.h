// Compiled and tested against Chromium 155 in M2 (docs/notes/chromium-api-m2.md).
// Linux appearance transport (color-scheme, contrast, accent) in the shape the TypeScript provider expects
// (theme/providers/linux/provider.ts reads portal-style values: color-scheme 0/1/2, contrast 0/1,
// accent (r,g,b) doubles in 0..1).
//
// D-Bus is NOT written here on purpose. Chromium already reads org.freedesktop.portal.Settings in
// ui/linux/portal_settings_linux.cc (color-scheme always; accent-color behind features::kUsePortalAccentColor) and pushes
// the results through LinuxUiTheme::SetColorScheme / SetAccentColor into NativeTheme (preferred_color_scheme(),
// preferred_contrast(), user_color()). This layer snapshots NativeTheme, so Corvid reuses upstream D-Bus code
// (skills/platform-color-provider: "extend it rather than duplicating").
#ifndef CORVID_THEME_APPEARANCE_SNAPSHOT_H_
#define CORVID_THEME_APPEARANCE_SNAPSHOT_H_

#include <array>
#include <cstdint>
#include <optional>

namespace corvid {

// Mirrors ui::NativeTheme::PreferredColorScheme (kNoPreference=0, kLight=1, kDark=2).
enum class NativeSchemeValue : int { kNoPreference = 0, kLight = 1, kDark = 2 };
// Mirrors ui::NativeTheme::PreferredContrast (kNoPreference=0, kMore=1, kLess=2, kCustom=3).
enum class NativeContrastValue : int { kNoPreference = 0, kMore = 1, kLess = 2, kCustom = 3 };

struct AppearanceSnapshot {
  // freedesktop values: color-scheme 0 no preference, 1 prefer dark, 2 prefer light. NOTE the swap versus NativeTheme.
  uint32_t color_scheme = 0;
  // freedesktop contrast: 0 no preference, 1 higher contrast.
  uint32_t contrast = 0;
  // sRGB 0..1; nullopt = unset (the TS parser treats out-of-range triples as unset too).
  std::optional<std::array<double, 3>> accent;

  bool operator==(const AppearanceSnapshot&) const = default;
};

// |user_color_argb| is NativeTheme::user_color() as SkColor (ARGB) or nullopt.
AppearanceSnapshot MakeAppearanceSnapshot(NativeSchemeValue scheme, NativeContrastValue contrast, std::optional<uint32_t> user_color_argb);

}  // namespace corvid

#endif  // CORVID_THEME_APPEARANCE_SNAPSHOT_H_
