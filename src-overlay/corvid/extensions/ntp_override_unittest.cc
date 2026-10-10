// Compiled and tested against Chromium 155 in M2 (docs/notes/chromium-api-m2.md). Cases mirror ui/pages/shared/logic.test.ts.
#include "corvid/extensions/ntp_override.h"

#include "testing/gtest/include/gtest/gtest.h"

namespace corvid {
namespace {

NtpCandidate Ext(const char* id, int64_t t, bool overrides = true, bool incognito = false) {
  return {id, base::Time::FromMillisecondsSinceUnixEpoch(t), overrides, incognito};
}

TEST(NtpOverrideTest, DefaultWhenNoExtensions) {
  EXPECT_FALSE(ResolveNewTab({}, std::nullopt, false, false).extension_id);
}

TEST(NtpOverrideTest, MostRecentlyEnabledWins) {
  std::vector<NtpCandidate> v = {Ext("a", 100), Ext("b", 200), Ext("c", 300, false)};
  EXPECT_EQ(*ResolveNewTab(v, std::nullopt, false, false).extension_id, "b");
}

TEST(NtpOverrideTest, PickerAndEscapes) {
  std::vector<NtpCandidate> v = {Ext("a", 100), Ext("b", 200)};
  EXPECT_EQ(*ResolveNewTab(v, "a", false, false).extension_id, "a");
  EXPECT_FALSE(ResolveNewTab(v, "corvid", false, false).extension_id);
  EXPECT_FALSE(ResolveNewTab(v, std::nullopt, false, true).extension_id);
  EXPECT_EQ(*ResolveNewTab(v, "gone", false, false).extension_id, "b");
}

TEST(NtpOverrideTest, IncognitoHonorsExtensionSetting) {
  EXPECT_FALSE(ResolveNewTab({Ext("a", 1)}, std::nullopt, true, false).extension_id);
  EXPECT_EQ(*ResolveNewTab({Ext("a", 1, true, true)}, std::nullopt, true, false).extension_id, "a");
}

TEST(NtpOverrideTest, PickedExtensionThatCannotOverrideFallsBackToAutomatic) {
  std::vector<NtpCandidate> v = {Ext("a", 100), Ext("b", 200, /*overrides=*/false)};
  EXPECT_EQ(*ResolveNewTab(v, "b", false, false).extension_id, "a");
}

TEST(NtpOverrideTest, PickedExtensionNotAllowedInIncognitoIsIgnoredThere) {
  std::vector<NtpCandidate> v = {Ext("a", 100, true, /*incognito=*/true), Ext("b", 200)};
  EXPECT_EQ(*ResolveNewTab(v, "b", /*incognito=*/true, false).extension_id, "a");
  EXPECT_EQ(*ResolveNewTab(v, "b", /*incognito=*/false, false).extension_id, "b");
}

TEST(NtpOverrideTest, ForceDefaultBeatsPicker) {
  std::vector<NtpCandidate> v = {Ext("a", 100)};
  EXPECT_FALSE(ResolveNewTab(v, "a", false, /*force_default=*/true).extension_id);
}

TEST(NtpOverrideTest, ExplicitCorvidPickBeatsNewerExtension) {
  std::vector<NtpCandidate> v = {Ext("a", 999)};
  EXPECT_FALSE(ResolveNewTab(v, "corvid", false, false).extension_id);
}

TEST(NtpOverrideTest, TieOnEnabledTimeIsStableFirstWins) {
  std::vector<NtpCandidate> v = {Ext("a", 100), Ext("b", 100)};
  EXPECT_EQ(*ResolveNewTab(v, std::nullopt, false, false).extension_id, "a");
}

}  // namespace
}  // namespace corvid
