// Compiled and tested against Chromium 155 (M2).
#include "corvid/theme/appearance_snapshot.h"

namespace corvid {

AppearanceSnapshot MakeAppearanceSnapshot(NativeSchemeValue scheme, NativeContrastValue contrast, std::optional<uint32_t> user_color_argb) {
  AppearanceSnapshot s;
  switch (scheme) {
    case NativeSchemeValue::kDark: s.color_scheme = 1; break;
    case NativeSchemeValue::kLight: s.color_scheme = 2; break;
    case NativeSchemeValue::kNoPreference: s.color_scheme = 0; break;
  }
  // "more" contrast is the only value the portal expresses; kCustom (forced colors) is not a contrast preference.
  s.contrast = contrast == NativeContrastValue::kMore ? 1 : 0;
  if (user_color_argb) {
    const uint32_t c = *user_color_argb;
    s.accent = std::array<double, 3>{((c >> 16) & 0xff) / 255.0, ((c >> 8) & 0xff) / 255.0, (c & 0xff) / 255.0};
  }
  return s;
}

}  // namespace corvid
