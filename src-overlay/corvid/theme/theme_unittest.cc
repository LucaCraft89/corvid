// Compiled and tested against Chromium 155 (M2).
#include "base/files/file_util.h"
#include "base/files/scoped_temp_dir.h"
#include "corvid/theme/appearance_snapshot.h"
#include "corvid/theme/config_file_reader.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace corvid {
namespace {

TEST(AppearanceSnapshotTest, SchemeMappingSwapsBetweenNativeThemeAndPortal) {
  EXPECT_EQ(MakeAppearanceSnapshot(NativeSchemeValue::kDark, NativeContrastValue::kNoPreference, std::nullopt).color_scheme, 1u);
  EXPECT_EQ(MakeAppearanceSnapshot(NativeSchemeValue::kLight, NativeContrastValue::kNoPreference, std::nullopt).color_scheme, 2u);
  EXPECT_EQ(MakeAppearanceSnapshot(NativeSchemeValue::kNoPreference, NativeContrastValue::kNoPreference, std::nullopt).color_scheme, 0u);
}

TEST(AppearanceSnapshotTest, ContrastAndAccent) {
  EXPECT_EQ(MakeAppearanceSnapshot(NativeSchemeValue::kLight, NativeContrastValue::kMore, std::nullopt).contrast, 1u);
  EXPECT_EQ(MakeAppearanceSnapshot(NativeSchemeValue::kLight, NativeContrastValue::kCustom, std::nullopt).contrast, 0u);
  auto s = MakeAppearanceSnapshot(NativeSchemeValue::kLight, NativeContrastValue::kNoPreference, 0xff3584e4u);
  ASSERT_TRUE(s.accent);
  EXPECT_NEAR((*s.accent)[0], 0x35 / 255.0, 1e-9);
  EXPECT_NEAR((*s.accent)[1], 0x84 / 255.0, 1e-9);
  EXPECT_NEAR((*s.accent)[2], 0xe4 / 255.0, 1e-9);
  EXPECT_FALSE(MakeAppearanceSnapshot(NativeSchemeValue::kLight, NativeContrastValue::kNoPreference, std::nullopt).accent);
}

TEST(ConfigFileReaderTest, AllowListIsExact) {
  EXPECT_TRUE(IsAllowedAppearanceConfigFile("kdeglobals"));
  EXPECT_TRUE(IsAllowedAppearanceConfigFile("gtk-4.0/settings.ini"));
  for (const char* bad : {"", "../kdeglobals", "/etc/passwd", "gtk-4.0/../kdeglobals", "kdeglobals/", "gtk-4.0/settings.ini ", "KDEGLOBALS", "gtk-2.0/gtkrc", "./kdeglobals"}) {
    EXPECT_FALSE(IsAllowedAppearanceConfigFile(bad)) << bad;
  }
}

TEST(ConfigFileReaderTest, ReadsAllowedRefusesOthers) {
  base::ScopedTempDir dir;
  ASSERT_TRUE(dir.CreateUniqueTempDir());
  ASSERT_TRUE(base::WriteFile(dir.GetPath().AppendASCII("kdeglobals"), "[General]\nAccentColor=1,2,3\n"));
  ASSERT_TRUE(base::WriteFile(dir.GetPath().AppendASCII("secret"), "no"));
  EXPECT_EQ(ReadAppearanceConfigFile(dir.GetPath(), "kdeglobals"), "[General]\nAccentColor=1,2,3\n");
  EXPECT_FALSE(ReadAppearanceConfigFile(dir.GetPath(), "secret"));
  EXPECT_FALSE(ReadAppearanceConfigFile(dir.GetPath(), "gtk-4.0/settings.ini"));  // allowed name, file missing
}

TEST(ConfigFileReaderTest, OversizeFileRefused) {
  base::ScopedTempDir dir;
  ASSERT_TRUE(dir.CreateUniqueTempDir());
  ASSERT_TRUE(base::WriteFile(dir.GetPath().AppendASCII("kdeglobals"), std::string(kMaxAppearanceFileBytes + 1, 'x')));
  EXPECT_FALSE(ReadAppearanceConfigFile(dir.GetPath(), "kdeglobals"));
}

}  // namespace
}  // namespace corvid
