// UNVERIFIED: never compiled or run. See header. Behavior spec: theme/providers/windows/index.ts.
#include "corvid/windows/accent/accent_watcher.h"

#include <windows.foundation.h>
#include <wrl/event.h>

#include "base/functional/bind.h"
#include "base/win/core_winrt_util.h"
#include "base/win/registry.h"
#include "base/win/scoped_hstring.h"

namespace corvid::windows {
namespace {

using ABI::Windows::UI::ViewManagement::IUISettings3;
using ABI::Windows::UI::ViewManagement::UIColorType;

uint32_t ToArgb(const ABI::Windows::UI::Color& c) {
  return (uint32_t{c.A} << 24) | (uint32_t{c.R} << 16) | (uint32_t{c.G} << 8) | c.B;
}

bool IsHighContrastOn() {
  HIGHCONTRASTW hc = {sizeof(hc)};
  return ::SystemParametersInfoW(SPI_GETHIGHCONTRAST, sizeof(hc), &hc, 0) &&
         (hc.dwFlags & HCF_HIGHCONTRASTON);
}

}  // namespace

AccentWatcher::AccentWatcher(scoped_refptr<base::SequencedTaskRunner> ui_runner,
                             Callback on_change)
    : ui_runner_(std::move(ui_runner)), on_change_(std::move(on_change)) {
  Microsoft::WRL::ComPtr<IInspectable> instance;
  base::win::ScopedHString class_id = base::win::ScopedHString::Create(
      RuntimeClass_Windows_UI_ViewManagement_UISettings);
  if (FAILED(base::win::RoActivateInstance(class_id.get(), &instance)) ||
      FAILED(instance.As(&settings_))) {
    settings_.Reset();  // Read() will return nullopt; TS side degrades to fallback.
    return;
  }
  auto handler = Microsoft::WRL::Callback<ABI::Windows::Foundation::ITypedEventHandler<
      ABI::Windows::UI::ViewManagement::UISettings*, IInspectable*>>(
      [this](auto*, auto*) {
        OnColorValuesChanged();
        return S_OK;
      });
  settings_->add_ColorValuesChanged(handler.Get(), &token_);
  // High-contrast changes arrive via WM_SETTINGCHANGE/WM_THEMECHANGED on the browser window; the
  // window shell (caption controls patch 0005) must also call on_change_. TODO(windows-host).
}

AccentWatcher::~AccentWatcher() {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (settings_) settings_->remove_ColorValuesChanged(token_);
}

void AccentWatcher::OnColorValuesChanged() {
  // Arbitrary thread: marshal only. The raw |this| capture is safe only if the destructor
  // unregisters first AND tasks tolerate a destroyed watcher; use a WeakPtrFactory in the real build.
  ui_runner_->PostTask(FROM_HERE, on_change_);
}

std::optional<RawAccentReading> AccentWatcher::Read() const {
  DCHECK_CALLED_ON_VALID_SEQUENCE(sequence_checker_);
  if (!settings_) return std::nullopt;
  RawAccentReading r;
  ABI::Windows::UI::Color c;
  Microsoft::WRL::ComPtr<ABI::Windows::UI::ViewManagement::IUISettings> base_settings;
  if (SUCCEEDED(settings_.As(&base_settings))) {
    if (SUCCEEDED(base_settings->GetColorValue(UIColorType::UIColorType_Accent, &c)))
      r.accent_argb = ToArgb(c);
    if (SUCCEEDED(base_settings->GetColorValue(UIColorType::UIColorType_Foreground, &c)))
      r.foreground_argb = ToArgb(c);
  }
  base::win::RegKey key(HKEY_CURRENT_USER,
                        L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
                        KEY_READ);
  DWORD v = 1;
  if (key.ReadValueDW(L"AppsUseLightTheme", &v) == ERROR_SUCCESS) r.apps_use_light_theme = v ? 1 : 0;
  r.high_contrast = IsHighContrastOn();
  return r;
}

}  // namespace corvid::windows
