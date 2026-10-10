// Compiled and tested against Chromium 155 in M2 (docs/notes/chromium-api-m2.md). Browser-side module registry and permission authority.
// The TypeScript ModuleHost (ui/modules/host.ts) runs module code in the WebUI; this class is what the browser
// consults before binding any Mojo capability for that module. A module that is not Loaded, or that lacks a
// permission, gets no capability.
#ifndef CORVID_MODULES_MODULE_HOST_SERVICE_H_
#define CORVID_MODULES_MODULE_HOST_SERVICE_H_

#include <map>
#include <set>
#include <string>
#include <vector>

#include "base/types/expected.h"
#include "corvid/modules/module_manifest.h"
#include "corvid/modules/module_permissions.h"

namespace corvid {

class ModuleHostService {
 public:
  ModuleHostService();
  ~ModuleHostService();

  base::expected<ModuleManifest, std::string> Install(const Dict& manifest);
  bool Uninstall(const std::string& id);  // refused (false) unless installed and not loaded

  // Loads |id| and any `requires` first (they must be installed). For ui-mods, |user_granted| is what the user
  // consented to: it must contain every required permission; granted optional permissions are kept only if
  // declared. Builtins receive everything they declare. Returns an error string on refusal; state is unchanged then.
  base::expected<void, std::string> Load(const std::string& id, const std::set<ModulePermission>& user_granted);

  // Unloads |id| and everything loaded that depends on it. Returns unloaded ids, dependents first.
  std::vector<std::string> Unload(const std::string& id);

  bool IsLoaded(const std::string& id) const;
  // The only question Mojo binders may ask.
  bool Authorize(const std::string& id, ModulePermission p) const;
  // Components available to the layout palette (loaded modules only).
  std::vector<std::string> LoadedComponents() const;

 private:
  struct Entry {
    ModuleManifest manifest;
    bool loaded = false;
  };
  base::expected<void, std::string> LoadImpl(const std::string& id, const std::set<ModulePermission>& user_granted,
                                             std::vector<std::string>& stack);

  std::map<std::string, Entry> modules_;
  ModulePermissionTable permissions_;
};

}  // namespace corvid

#endif  // CORVID_MODULES_MODULE_HOST_SERVICE_H_
