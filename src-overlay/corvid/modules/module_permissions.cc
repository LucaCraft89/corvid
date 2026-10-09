// UNVERIFIED: not compiled.
#include "corvid/modules/module_permissions.h"

namespace corvid {

namespace {
struct Name { const char* name; ModulePermission perm; };
constexpr Name kNames[] = {
    {"tabs.read", ModulePermission::kTabsRead}, {"tabs.manage", ModulePermission::kTabsManage},
    {"bookmarks.read", ModulePermission::kBookmarksRead}, {"bookmarks.manage", ModulePermission::kBookmarksManage},
    {"storage.local", ModulePermission::kStorageLocal}, {"theme.read", ModulePermission::kThemeRead},
    {"layout.read", ModulePermission::kLayoutRead}, {"layout.write", ModulePermission::kLayoutWrite},
    {"notifications", ModulePermission::kNotifications}, {"internal.shell", ModulePermission::kInternalShell},
    {"internal.settings", ModulePermission::kInternalSettings}, {"internal.extensions", ModulePermission::kInternalExtensions},
};
}  // namespace

std::optional<ModulePermission> ParseModulePermission(std::string_view name) {
  for (const Name& n : kNames) {
    if (name == n.name) return n.perm;
  }
  return std::nullopt;
}

bool IsBuiltinOnly(ModulePermission p) {
  return p == ModulePermission::kInternalShell || p == ModulePermission::kInternalSettings ||
         p == ModulePermission::kInternalExtensions;
}

bool ModulePermissionTable::Grant(const std::string& module_id, bool builtin, const std::set<ModulePermission>& perms) {
  if (!builtin) {
    for (ModulePermission p : perms) {
      if (IsBuiltinOnly(p)) return false;
    }
  }
  for (ModulePermission p : perms) grants_.emplace(module_id, p);
  return true;
}

void ModulePermissionTable::RevokeAll(const std::string& module_id) {
  for (auto it = grants_.begin(); it != grants_.end();) {
    it = it->first == module_id ? grants_.erase(it) : std::next(it);
  }
}

bool ModulePermissionTable::Has(const std::string& module_id, ModulePermission p) const {
  return grants_.count({module_id, p}) > 0;
}

}  // namespace corvid
