// UNVERIFIED: not compiled. Browser-side enforcement point for module permissions.
// Mirrors ui/modules/permissions.ts. The renderer (WebUI) can only reach a Mojo capability that the
// browser bound for the granted permission; ungranted capabilities are never bound.
#ifndef CORVID_MODULES_MODULE_PERMISSIONS_H_
#define CORVID_MODULES_MODULE_PERMISSIONS_H_

#include <optional>
#include <set>
#include <string>
#include <string_view>

namespace corvid {

enum class ModulePermission {
  kTabsRead, kTabsManage, kBookmarksRead, kBookmarksManage, kStorageLocal,
  kThemeRead, kLayoutRead, kLayoutWrite, kNotifications,
  kInternalShell, kInternalSettings, kInternalExtensions,
};

std::optional<ModulePermission> ParseModulePermission(std::string_view name);
bool IsBuiltinOnly(ModulePermission p);

// Tracks grants per module id. Builtin modules receive their declared permissions;
// ui-mods only what the user consented to, and never builtin-only ones.
class ModulePermissionTable {
 public:
  // Returns false (and grants nothing) if a ui-mod asks for a builtin-only permission.
  bool Grant(const std::string& module_id, bool builtin, const std::set<ModulePermission>& perms);
  void RevokeAll(const std::string& module_id);
  bool Has(const std::string& module_id, ModulePermission p) const;

 private:
  std::set<std::pair<std::string, ModulePermission>> grants_;
};

}  // namespace corvid

#endif  // CORVID_MODULES_MODULE_PERMISSIONS_H_
