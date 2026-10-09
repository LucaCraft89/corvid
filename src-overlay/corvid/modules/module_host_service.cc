// UNVERIFIED: not compiled.
#include "corvid/modules/module_host_service.h"

#include <algorithm>

namespace corvid {

base::expected<ModuleManifest, std::string> ModuleHostService::Install(const Dict& manifest) {
  auto parsed = ParseModuleManifest(manifest);
  if (!parsed.has_value()) return parsed;
  if (modules_.count(parsed->id)) return base::unexpected("module already installed: " + parsed->id);
  modules_[parsed->id] = Entry{*parsed, false};
  return parsed;
}

bool ModuleHostService::Uninstall(const std::string& id) {
  auto it = modules_.find(id);
  if (it == modules_.end() || it->second.loaded) return false;
  modules_.erase(it);
  return true;
}

base::expected<void, std::string> ModuleHostService::Load(const std::string& id, const std::set<ModulePermission>& user_granted) {
  std::vector<std::string> stack;
  return LoadImpl(id, user_granted, stack);
}

base::expected<void, std::string> ModuleHostService::LoadImpl(const std::string& id, const std::set<ModulePermission>& user_granted,
                                                              std::vector<std::string>& stack) {
  auto it = modules_.find(id);
  if (it == modules_.end()) return base::unexpected("unknown module " + id);
  if (it->second.loaded) return {};
  if (std::find(stack.begin(), stack.end(), id) != stack.end()) return base::unexpected("dependency cycle at " + id);
  stack.push_back(id);
  const ModuleManifest& m = it->second.manifest;
  for (const std::string& dep : m.requires_modules) {
    if (!modules_.count(dep)) return base::unexpected(id + " requires missing module " + dep);
    auto r = LoadImpl(dep, user_granted /* dependencies are builtins in practice */, stack);
    if (!r.has_value()) return r;
  }
  stack.pop_back();

  std::set<ModulePermission> grant;
  if (m.kind == ModuleKind::kBuiltin) {
    grant = m.permissions;
    grant.insert(m.optional_permissions.begin(), m.optional_permissions.end());
  } else {
    for (ModulePermission p : m.permissions) {
      if (!user_granted.count(p)) return base::unexpected("required permission denied");
      grant.insert(p);
    }
    for (ModulePermission p : m.optional_permissions) {
      if (user_granted.count(p)) grant.insert(p);  // never grant anything that was not declared
    }
  }
  if (!permissions_.Grant(m.id, m.kind == ModuleKind::kBuiltin, grant)) return base::unexpected("permission policy refused the grant");
  it->second.loaded = true;
  return {};
}

std::vector<std::string> ModuleHostService::Unload(const std::string& id) {
  std::vector<std::string> out;
  auto it = modules_.find(id);
  if (it == modules_.end()) return out;
  for (auto& [other_id, other] : modules_) {
    if (other.loaded && std::find(other.manifest.requires_modules.begin(), other.manifest.requires_modules.end(), id) !=
                            other.manifest.requires_modules.end()) {
      auto sub = Unload(other_id);
      out.insert(out.end(), sub.begin(), sub.end());
    }
  }
  if (it->second.loaded) {
    it->second.loaded = false;
    permissions_.RevokeAll(id);
    out.push_back(id);
  }
  return out;
}

bool ModuleHostService::IsLoaded(const std::string& id) const {
  auto it = modules_.find(id);
  return it != modules_.end() && it->second.loaded;
}

bool ModuleHostService::Authorize(const std::string& id, ModulePermission p) const {
  return IsLoaded(id) && permissions_.Has(id, p);
}

std::vector<std::string> ModuleHostService::LoadedComponents() const {
  std::vector<std::string> out;
  for (const auto& [id, e] : modules_) {
    if (e.loaded) out.insert(out.end(), e.manifest.components.begin(), e.manifest.components.end());
  }
  return out;
}

}  // namespace corvid
