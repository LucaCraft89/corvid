// UNVERIFIED: not compiled.
#include "corvid/theme/native_theme_appearance_observer.h"

#include <utility>

namespace corvid {

namespace {
NativeSchemeValue ToScheme(ui::NativeTheme::PreferredColorScheme s) {
  switch (s) {
    case ui::NativeTheme::PreferredColorScheme::kLight: return NativeSchemeValue::kLight;
    case ui::NativeTheme::PreferredColorScheme::kDark: return NativeSchemeValue::kDark;
    case ui::NativeTheme::PreferredColorScheme::kNoPreference: break;
  }
  return NativeSchemeValue::kNoPreference;
}
NativeContrastValue ToContrast(ui::NativeTheme::PreferredContrast c) {
  switch (c) {
    case ui::NativeTheme::PreferredContrast::kMore: return NativeContrastValue::kMore;
    case ui::NativeTheme::PreferredContrast::kLess: return NativeContrastValue::kLess;
    case ui::NativeTheme::PreferredContrast::kCustom: return NativeContrastValue::kCustom;
    case ui::NativeTheme::PreferredContrast::kNoPreference: break;
  }
  return NativeContrastValue::kNoPreference;
}
}  // namespace

NativeThemeAppearanceObserver::NativeThemeAppearanceObserver(ui::NativeTheme* theme, Callback callback)
    : theme_(theme), callback_(std::move(callback)), last_(Current()) {
  observation_.Observe(theme_);
}

NativeThemeAppearanceObserver::~NativeThemeAppearanceObserver() = default;

AppearanceSnapshot NativeThemeAppearanceObserver::Current() const {
  std::optional<uint32_t> accent;
  if (std::optional<SkColor> c = theme_->user_color()) accent = static_cast<uint32_t>(*c);
  return MakeAppearanceSnapshot(ToScheme(theme_->preferred_color_scheme()), ToContrast(theme_->preferred_contrast()), accent);
}

void NativeThemeAppearanceObserver::OnNativeThemeUpdated(ui::NativeTheme* observed_theme) {
  if (observed_theme != theme_) return;
  AppearanceSnapshot now = Current();
  if (now == last_) return;  // NativeTheme notifies for many unrelated reasons
  last_ = now;
  callback_.Run(now);
}

}  // namespace corvid
