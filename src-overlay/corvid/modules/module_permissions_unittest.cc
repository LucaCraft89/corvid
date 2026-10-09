// UNVERIFIED: not compiled.
#include "corvid/modules/module_permissions.h"

#include "testing/gtest/include/gtest/gtest.h"

namespace corvid {

TEST(ModulePermissionsTest, ParseAndBuiltinOnly) {
  EXPECT_EQ(ParseModulePermission("tabs.read"), ModulePermission::kTabsRead);
  EXPECT_FALSE(ParseModulePermission("root.everything"));
  EXPECT_TRUE(IsBuiltinOnly(*ParseModulePermission("internal.shell")));
  EXPECT_FALSE(IsBuiltinOnly(*ParseModulePermission("tabs.manage")));
}

TEST(ModulePermissionsTest, UiModCannotGetInternalPermissions) {
  ModulePermissionTable t;
  EXPECT_FALSE(t.Grant("example.x", /*builtin=*/false, {ModulePermission::kTabsRead, ModulePermission::kInternalShell}));
  EXPECT_FALSE(t.Has("example.x", ModulePermission::kTabsRead));  // all-or-nothing
  EXPECT_TRUE(t.Grant("example.x", false, {ModulePermission::kTabsRead}));
  EXPECT_TRUE(t.Has("example.x", ModulePermission::kTabsRead));
  EXPECT_FALSE(t.Has("example.x", ModulePermission::kTabsManage));
  t.RevokeAll("example.x");
  EXPECT_FALSE(t.Has("example.x", ModulePermission::kTabsRead));
}

TEST(ModulePermissionsTest, BuiltinMayHoldInternal) {
  ModulePermissionTable t;
  EXPECT_TRUE(t.Grant("corvid.layout", true, {ModulePermission::kInternalShell}));
  EXPECT_TRUE(t.Has("corvid.layout", ModulePermission::kInternalShell));
}

}  // namespace corvid
