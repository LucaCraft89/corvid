// UNVERIFIED: not compiled. Assumes ui::TestNativeTheme (ui/native_theme/test/test_native_theme.h) exposes the
// set_preferred_color_scheme / set_preferred_contrast / set_user_color setters and NotifyOnNativeThemeUpdated();
// if the pinned tree names them differently, only the calls in the tests below need changing.
#include "corvid/theme/native_theme_appearance_observer.h"

#include <memory>
#include <vector>

#include "base/functional/bind.h"
#include "testing/gtest/include/gtest/gtest.h"
#include "ui/native_theme/test/test_native_theme.h"

namespace corvid {
namespace {

class NativeThemeObserverTest : public testing::Test {
 protected:
  void SetUp() override {
    observer_ = std::make_unique<NativeThemeAppearanceObserver>(
        &theme_, base::BindRepeating([](std::vector<AppearanceSnapshot>* out, const AppearanceSnapshot& s) { out->push_back(s); }, &seen_));
  }
  ui::TestNativeTheme theme_;
  std::vector<AppearanceSnapshot> seen_;
  std::unique_ptr<NativeThemeAppearanceObserver> observer_;
};

TEST_F(NativeThemeObserverTest, NoCallbackWhenNothingChanged) {
  theme_.NotifyOnNativeThemeUpdated();
  theme_.NotifyOnNativeThemeUpdated();
  EXPECT_TRUE(seen_.empty()) << "NativeTheme notifies for unrelated reasons; identical snapshots are dropped";
}

TEST_F(NativeThemeObserverTest, SchemeChangeIsForwardedOnceInPortalNumbering) {
  theme_.set_preferred_color_scheme(ui::NativeTheme::PreferredColorScheme::kDark);
  theme_.NotifyOnNativeThemeUpdated();
  theme_.NotifyOnNativeThemeUpdated();  // duplicate
  ASSERT_EQ(seen_.size(), 1u);
  EXPECT_EQ(seen_[0].color_scheme, 1u);  // portal: 1 = prefer dark (NativeTheme kDark is 2)
  EXPECT_EQ(observer_->Current(), seen_[0]);
}

TEST_F(NativeThemeObserverTest, AccentAndContrastChangesAreForwarded) {
  theme_.set_user_color(SkColorSetRGB(0x35, 0x84, 0xe4));
  theme_.set_preferred_contrast(ui::NativeTheme::PreferredContrast::kMore);
  theme_.NotifyOnNativeThemeUpdated();
  ASSERT_EQ(seen_.size(), 1u);
  EXPECT_EQ(seen_[0].contrast, 1u);
  ASSERT_TRUE(seen_[0].accent);
}

TEST_F(NativeThemeObserverTest, StopsObservingAfterDestruction) {
  observer_.reset();
  theme_.set_preferred_color_scheme(ui::NativeTheme::PreferredColorScheme::kLight);
  theme_.NotifyOnNativeThemeUpdated();
  EXPECT_TRUE(seen_.empty());
}

}  // namespace
}  // namespace corvid
