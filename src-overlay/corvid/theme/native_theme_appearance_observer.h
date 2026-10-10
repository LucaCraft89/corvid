// Compiled and tested against Chromium 155 in M2 (docs/notes/chromium-api-m2.md). API names checked by reading ui/native_theme/native_theme.h and native_theme_observer.h
// from the chromium/chromium mirror (2026-10): NativeTheme::GetInstanceForNativeUi(), AddObserver/RemoveObserver,
// preferred_color_scheme(), preferred_contrast(), user_color(), NativeThemeObserver::OnNativeThemeUpdated.
#ifndef CORVID_THEME_NATIVE_THEME_APPEARANCE_OBSERVER_H_
#define CORVID_THEME_NATIVE_THEME_APPEARANCE_OBSERVER_H_

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/scoped_observation.h"
#include "corvid/theme/appearance_snapshot.h"
#include "ui/native_theme/native_theme.h"
#include "ui/native_theme/native_theme_observer.h"

namespace corvid {

// Calls |callback| with a fresh snapshot whenever NativeTheme reports a change and the snapshot actually differs.
// The callback is expected to forward to the WebUI over the LinuxAppearanceSource mojom observer.
class NativeThemeAppearanceObserver : public ui::NativeThemeObserver {
 public:
  using Callback = base::RepeatingCallback<void(const AppearanceSnapshot&)>;
  NativeThemeAppearanceObserver(ui::NativeTheme* theme, Callback callback);
  ~NativeThemeAppearanceObserver() override;

  AppearanceSnapshot Current() const;

  // ui::NativeThemeObserver:
  void OnNativeThemeUpdated(ui::NativeTheme* observed_theme) override;

 private:
  raw_ptr<ui::NativeTheme> theme_;
  Callback callback_;
  AppearanceSnapshot last_;
  base::ScopedObservation<ui::NativeTheme, ui::NativeThemeObserver> observation_{this};
};

}  // namespace corvid

#endif  // CORVID_THEME_NATIVE_THEME_APPEARANCE_OBSERVER_H_
