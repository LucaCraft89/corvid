// Uses the process-wide NativeTheme fed by ui::MockOsSettingsProvider, exactly like ui/native_theme/native_theme_unittest.cc
// (the old ui::TestNativeTheme no longer exists in 155; verified in docs/notes/chromium-api-m2.md).
#include "corvid/theme/native_theme_appearance_observer.h"

#include <memory>
#include <vector>

#include "base/functional/bind.h"
#include "base/memory/raw_ptr.h"
#include "testing/gtest/include/gtest/gtest.h"
#include "ui/native_theme/mock_os_settings_provider.h"
#include "ui/native_theme/native_theme.h"

namespace corvid {
namespace {

class NativeThemeObserverTest : public testing::Test {
 protected:
  void SetUp() override {
    observer_ = std::make_unique<NativeThemeAppearanceObserver>(
        theme_, base::BindRepeating([](std::vector<AppearanceSnapshot>* out, const AppearanceSnapshot& s) { out->push_back(s); }, &seen_));
  }
  ui::MockOsSettingsProvider os_settings_;  // declared first: overrides the real provider for the test's lifetime
  raw_ptr<ui::NativeTheme> theme_ = ui::NativeTheme::GetInstanceForNativeUi();
  std::vector<AppearanceSnapshot> seen_;
  std::unique_ptr<NativeThemeAppearanceObserver> observer_;
};

TEST_F(NativeThemeObserverTest, NoCallbackWhenNothingChanged) {
  theme_->NotifyOnNativeThemeUpdated();
  theme_->NotifyOnNativeThemeUpdated();
  EXPECT_TRUE(seen_.empty()) << "NativeTheme notifies for unrelated reasons; identical snapshots are dropped";
}

TEST_F(NativeThemeObserverTest, SchemeChangeIsForwardedOnceInPortalNumbering) {
  os_settings_.SetPreferredColorScheme(ui::NativeTheme::PreferredColorScheme::kDark);
  theme_->NotifyOnNativeThemeUpdated();
  theme_->NotifyOnNativeThemeUpdated();  // duplicate
  ASSERT_EQ(seen_.size(), 1u);
  EXPECT_EQ(seen_[0].color_scheme, 1u);  // portal: 1 = prefer dark (NativeTheme kDark is 2)
  EXPECT_EQ(observer_->Current(), seen_[0]);
}

TEST_F(NativeThemeObserverTest, AccentAndContrastChangesAreForwarded) {
  // NativeTheme re-reads every setting from the OS provider on each change, so drive the mock (not set_user_color()).
  os_settings_.SetAccentColor(SkColorSetRGB(0x35, 0x84, 0xe4));
  os_settings_.SetPreferredContrast(ui::NativeTheme::PreferredContrast::kMore);
  theme_->NotifyOnNativeThemeUpdated();
  ASSERT_FALSE(seen_.empty());
  EXPECT_EQ(seen_.back().contrast, 1u);
  ASSERT_TRUE(seen_.back().accent);
}

TEST_F(NativeThemeObserverTest, StopsObservingAfterDestruction) {
  observer_.reset();
  os_settings_.SetPreferredColorScheme(ui::NativeTheme::PreferredColorScheme::kLight);
  theme_->NotifyOnNativeThemeUpdated();
  EXPECT_TRUE(seen_.empty());
}

}  // namespace
}  // namespace corvid
