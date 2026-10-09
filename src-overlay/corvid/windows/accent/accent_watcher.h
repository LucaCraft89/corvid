// UNVERIFIED: never compiled. Written against Chromium's WRL/ABI WinRT conventions
// (base/win/core_winrt_util.h, base/win/scoped_hstring.h, base/win/scoped_winrt_initializer.h);
// confirm every include and helper name against the pinned Chromium before the first build.
//
// Reads Windows UISettings (accent, foreground => dark/light) plus high contrast, and hands raw
// readings to the TS provider in theme/providers/windows/index.ts through a Mojo/pref bridge.
#ifndef CORVID_WINDOWS_ACCENT_ACCENT_WATCHER_H_
#define CORVID_WINDOWS_ACCENT_ACCENT_WATCHER_H_

#include <windows.ui.viewmanagement.h>
#include <wrl/client.h>

#include <cstdint>
#include <optional>

#include "base/functional/callback.h"
#include "base/sequence_checker.h"
#include "base/task/sequenced_task_runner.h"

namespace corvid::windows {

struct RawAccentReading {
  std::optional<uint32_t> accent_argb;      // UIColorType_Accent
  std::optional<uint32_t> foreground_argb;  // UIColorType_Foreground
  std::optional<int> apps_use_light_theme;  // registry fallback (0 = dark)
  bool high_contrast = false;               // SystemParametersInfo(SPI_GETHIGHCONTRAST)
};

class AccentWatcher {
 public:
  using Callback = base::RepeatingClosure;  // "something changed"; caller re-reads via Read().
  AccentWatcher(scoped_refptr<base::SequencedTaskRunner> ui_runner, Callback on_change);
  ~AccentWatcher();

  // Returns nullopt if UISettings could not be created (provider falls back; see TS side).
  std::optional<RawAccentReading> Read() const;

 private:
  // ColorValuesChanged fires on an arbitrary WinRT thread: it MUST only PostTask to |ui_runner_|.
  void OnColorValuesChanged();

  Microsoft::WRL::ComPtr<ABI::Windows::UI::ViewManagement::IUISettings3> settings_;
  EventRegistrationToken token_{};
  scoped_refptr<base::SequencedTaskRunner> ui_runner_;
  Callback on_change_;
  SEQUENCE_CHECKER(sequence_checker_);
};

}  // namespace corvid::windows

#endif  // CORVID_WINDOWS_ACCENT_ACCENT_WATCHER_H_
