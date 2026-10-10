// Compiled and tested against Chromium 155 in M2 (docs/notes/chromium-api-m2.md). Cases mirror ui/modules/modules.test.ts.
#include "corvid/modules/module_host_service.h"

#include "base/json/json_reader.h"
#include "corvid/modules/module_manifest.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace corvid {
namespace {

Dict Parse(const char* json) {
  auto d = base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC);
  EXPECT_TRUE(d) << json;
  return d ? std::move(*d) : Dict();
}

constexpr char kUiMod[] = R"({"id":"example.thing","version":"1.0.0","apiVersion":0,"name":"T","kind":"ui-mod","entry":"index.js",
  "permissions":["tabs.read"],"optionalPermissions":["bookmarks.read"],
  "slots":[{"slot":"window.right","component":"thing-panel"}]})";
constexpr char kBuiltinA[] = R"({"id":"corvid.a","version":"0.1.0","apiVersion":0,"name":"A","kind":"builtin","permissions":["internal.shell"]})";
constexpr char kBuiltinB[] = R"({"id":"corvid.b","version":"0.1.0","apiVersion":0,"name":"B","kind":"builtin","requires":["corvid.a"],
  "slots":[{"slot":"window.top","component":"corvid-b","role":"tabs"}]})";

TEST(ModuleManifestTest, IdAndPathRules) {
  EXPECT_TRUE(IsValidModuleId("corvid.tabstrip"));
  EXPECT_TRUE(IsValidModuleId("example.sample-panel"));
  EXPECT_FALSE(IsValidModuleId("corvid"));
  EXPECT_FALSE(IsValidModuleId("Corvid.x"));
  EXPECT_FALSE(IsValidModuleId("corvid.x."));
  EXPECT_FALSE(IsValidModuleId("cor-vid.x"));
  EXPECT_TRUE(IsSafeRelativeJsPath("dist/index.js"));
  EXPECT_FALSE(IsSafeRelativeJsPath("../evil.js"));
  EXPECT_FALSE(IsSafeRelativeJsPath("/abs.js"));
  EXPECT_FALSE(IsSafeRelativeJsPath("a.txt"));
}

TEST(ModuleManifestTest, SemanticRefusals) {
  auto bad = [](const char* json) { return !ParseModuleManifest(Parse(json)).has_value(); };
  EXPECT_TRUE(bad(R"({"id":"corvid.sneaky","version":"1","apiVersion":0,"kind":"ui-mod","entry":"a.js"})"));
  EXPECT_TRUE(bad(R"({"id":"example.x","version":"1","apiVersion":0,"kind":"builtin"})"));
  EXPECT_TRUE(bad(R"({"id":"example.x","version":"1","apiVersion":9,"kind":"ui-mod","entry":"a.js"})"));
  EXPECT_TRUE(bad(R"({"id":"example.x","version":"1","apiVersion":0,"kind":"ui-mod","entry":"a.js","permissions":["internal.shell"]})"));
  EXPECT_TRUE(bad(R"({"id":"example.x","version":"1","apiVersion":0,"kind":"ui-mod","entry":"a.js","permissions":["root"]})"));
  EXPECT_TRUE(bad(R"({"id":"example.x","version":"1","apiVersion":0,"kind":"ui-mod"})"));
  EXPECT_TRUE(bad(R"({"id":"example.x","version":"1","apiVersion":0,"kind":"ui-mod","entry":"a.js","slots":[{"component":"x-y","role":"tabs"}]})"));
  EXPECT_TRUE(bad(R"({"id":"example.x","version":"1","apiVersion":0,"kind":"ui-mod","entry":"a.js","permissions":["tabs.read"],"optionalPermissions":["tabs.read"]})"));
  EXPECT_FALSE(bad(kUiMod));
}

TEST(ModuleHostServiceTest, DeniedRequiredPermissionRefusesLoad) {
  ModuleHostService h;
  ASSERT_TRUE(h.Install(Parse(kUiMod)).has_value());
  EXPECT_FALSE(h.Load("example.thing", {}).has_value());
  EXPECT_FALSE(h.IsLoaded("example.thing"));
  EXPECT_FALSE(h.Authorize("example.thing", ModulePermission::kTabsRead));
}

TEST(ModuleHostServiceTest, OnlyDeclaredAndConsentedPermissionsAreAuthorized) {
  ModuleHostService h;
  ASSERT_TRUE(h.Install(Parse(kUiMod)).has_value());
  ASSERT_TRUE(h.Load("example.thing", {ModulePermission::kTabsRead, ModulePermission::kTabsManage, ModulePermission::kInternalShell}).has_value());
  EXPECT_TRUE(h.Authorize("example.thing", ModulePermission::kTabsRead));
  EXPECT_FALSE(h.Authorize("example.thing", ModulePermission::kBookmarksRead));  // optional, not consented
  EXPECT_FALSE(h.Authorize("example.thing", ModulePermission::kTabsManage));     // consented but never declared
  EXPECT_FALSE(h.Authorize("example.thing", ModulePermission::kInternalShell));
  EXPECT_EQ(h.LoadedComponents(), std::vector<std::string>{"thing-panel"});
}

TEST(ModuleHostServiceTest, UnloadRevokesEverything) {
  ModuleHostService h;
  ASSERT_TRUE(h.Install(Parse(kUiMod)).has_value());
  ASSERT_TRUE(h.Load("example.thing", {ModulePermission::kTabsRead}).has_value());
  EXPECT_EQ(h.Unload("example.thing"), std::vector<std::string>{"example.thing"});
  EXPECT_FALSE(h.Authorize("example.thing", ModulePermission::kTabsRead));
  EXPECT_TRUE(h.LoadedComponents().empty());
  EXPECT_TRUE(h.Uninstall("example.thing"));
}

TEST(ModuleHostServiceTest, DependenciesLoadFirstAndUnloadCascades) {
  ModuleHostService h;
  ASSERT_TRUE(h.Install(Parse(kBuiltinA)).has_value());
  ASSERT_TRUE(h.Install(Parse(kBuiltinB)).has_value());
  ASSERT_TRUE(h.Load("corvid.b", {}).has_value());
  EXPECT_TRUE(h.IsLoaded("corvid.a"));
  EXPECT_TRUE(h.Authorize("corvid.a", ModulePermission::kInternalShell));
  EXPECT_EQ(h.Unload("corvid.a"), (std::vector<std::string>{"corvid.b", "corvid.a"}));
}

TEST(ModuleHostServiceTest, MissingDependencyDuplicateInstallAndUninstallLoaded) {
  ModuleHostService h;
  Dict needs_missing = Parse(R"({"id":"corvid.c","version":"1","apiVersion":0,"kind":"builtin","requires":["corvid.zzz"]})");
  ASSERT_TRUE(h.Install(needs_missing.Clone()).has_value());
  EXPECT_FALSE(h.Install(needs_missing.Clone()).has_value());
  EXPECT_FALSE(h.Load("corvid.c", {}).has_value());
  ASSERT_TRUE(h.Install(Parse(kBuiltinA)).has_value());
  ASSERT_TRUE(h.Load("corvid.a", {}).has_value());
  EXPECT_FALSE(h.Uninstall("corvid.a"));
  EXPECT_FALSE(h.Load("nope.nope", {}).has_value());
}

}  // namespace
}  // namespace corvid
