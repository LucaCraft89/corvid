// UNVERIFIED: not compiled. Cases mirror ui/pages/shared/logic.test.ts.
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

}  // namespace
}  // namespace corvid
