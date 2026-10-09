// UNVERIFIED: not compiled. Browser-side manifest validation. The browser does NOT trust the WebUI to have
// validated a manifest: this mirrors the security-relevant rules of ui/modules/manifest.ts (schema shape,
// namespaces, builtin-only permissions, entry path). Full semantic checks stay in TypeScript.
#ifndef CORVID_MODULES_MODULE_MANIFEST_H_
#define CORVID_MODULES_MODULE_MANIFEST_H_

#include <set>
#include <string>
#include <vector>

#include "base/types/expected.h"
#include "corvid/base_compat.h"
#include "corvid/modules/module_permissions.h"

namespace corvid {

enum class ModuleKind { kBuiltin, kUiMod };

struct ModuleManifest {
  std::string id;
  std::string version;
  int api_version = 0;
  ModuleKind kind = ModuleKind::kUiMod;
  std::set<ModulePermission> permissions;
  std::set<ModulePermission> optional_permissions;
  std::vector<std::string> requires_modules;
  std::string entry;  // relative path inside the module package; empty for builtins without code
  std::vector<std::string> components;  // custom element tags declared in slots
};

inline constexpr int kSupportedApiVersions[] = {0};

// Returns the parsed manifest or a human-readable error.
base::expected<ModuleManifest, std::string> ParseModuleManifest(const Dict& dict);

// Rules exposed for tests.
bool IsValidModuleId(const std::string& id);
bool IsSafeRelativeJsPath(const std::string& path);

}  // namespace corvid

#endif  // CORVID_MODULES_MODULE_MANIFEST_H_
