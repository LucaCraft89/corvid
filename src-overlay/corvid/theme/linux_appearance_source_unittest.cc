// UNVERIFIED: not compiled.
#include "corvid/theme/linux_appearance_source.h"

#include <memory>
#include <string>
#include <vector>

#include "base/files/file_util.h"
#include "base/files/scoped_temp_dir.h"
#include "base/functional/bind.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace corvid {
namespace {

class LinuxAppearanceSourceTest : public testing::Test {
 protected:
  void SetUp() override {
    ASSERT_TRUE(dir_.CreateUniqueTempDir());
    source_ = std::make_unique<LinuxAppearanceSource>(
        dir_.GetPath(), "KDE",
        base::BindRepeating([](std::vector<std::string>* out, std::string_view why) { out->push_back(std::string(why)); }, &bad_));
  }
  base::ScopedTempDir dir_;
  std::vector<std::string> bad_;
  std::unique_ptr<LinuxAppearanceSource> source_;
};

TEST_F(LinuxAppearanceSourceTest, PortalValuesComeFromSnapshot) {
  source_->UpdateSnapshot(MakeAppearanceSnapshot(NativeSchemeValue::kDark, NativeContrastValue::kMore, 0xff3584e4u));
  EXPECT_EQ(std::get<uint32_t>(*source_->ReadPortalSetting("color-scheme")), 1u);
  EXPECT_EQ(std::get<uint32_t>(*source_->ReadPortalSetting("contrast")), 1u);
  auto accent = std::get<std::array<double, 3>>(*source_->ReadPortalSetting("accent-color"));
  EXPECT_NEAR(accent[0], 0x35 / 255.0, 1e-9);
  EXPECT_TRUE(bad_.empty());
}

TEST_F(LinuxAppearanceSourceTest, UnsetAccentIsNullNotBadMessage) {
  EXPECT_FALSE(source_->ReadPortalSetting("accent-color"));
  EXPECT_TRUE(bad_.empty());
}

TEST_F(LinuxAppearanceSourceTest, UnknownPortalKeyIsBadMessage) {
  EXPECT_FALSE(source_->ReadPortalSetting("../../org.gnome.secrets"));
  EXPECT_EQ(bad_.size(), 1u);
}

TEST_F(LinuxAppearanceSourceTest, ConfigFileAllowListEnforced) {
  ASSERT_TRUE(base::WriteFile(dir_.GetPath().AppendASCII("kdeglobals"), "[General]\nAccentColor=1,2,3\n"));
  EXPECT_EQ(source_->ReadConfigFile("kdeglobals"), "[General]\nAccentColor=1,2,3\n");
  EXPECT_TRUE(bad_.empty());
  EXPECT_FALSE(source_->ReadConfigFile("../.ssh/id_ed25519"));
  EXPECT_FALSE(source_->ReadConfigFile("/etc/passwd"));
  EXPECT_EQ(bad_.size(), 2u);
}

TEST_F(LinuxAppearanceSourceTest, AllowedButMissingFileIsNullNotBadMessage) {
  EXPECT_FALSE(source_->ReadConfigFile("gtk-4.0/settings.ini"));
  EXPECT_TRUE(bad_.empty());
}

TEST_F(LinuxAppearanceSourceTest, GsettingsNeverSpawnsAndRejectsOtherKeys) {
  EXPECT_FALSE(source_->ReadGsettings("color-scheme"));
  EXPECT_TRUE(bad_.empty());
  EXPECT_FALSE(source_->ReadGsettings("clipboard-history"));
  EXPECT_EQ(bad_.size(), 1u);
  EXPECT_EQ(source_->GetDesktop(), "KDE");
}

}  // namespace
}  // namespace corvid
