// UNVERIFIED: not compiled.
#include "corvid/modules/module_manifest.h"

#include <algorithm>
#include <cctype>

#include "base/strings/string_util.h"

namespace corvid {

namespace {

bool IsLower(char c) { return c >= 'a' && c <= 'z'; }
bool IsAlnumLower(char c) { return IsLower(c) || (c >= '0' && c <= '9'); }

// ^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$
bool IsId(const std::string& id) {
  if (id.empty() || id.size() > 100) return false;
  size_t segments = 0;
  size_t i = 0;
  while (i < id.size()) {
    size_t j = id.find('.', i);
    const std::string seg = id.substr(i, j == std::string::npos ? std::string::npos : j - i);
    if (seg.empty() || !IsLower(seg[0])) return false;
    for (char c : seg) {
      const bool dash_ok = segments > 0;  // dashes only in non-first segments
      if (!(IsAlnumLower(c) || (dash_ok && c == '-'))) return false;
    }
    ++segments;
    if (j == std::string::npos) break;
    i = j + 1;
    if (i == id.size()) return false;  // trailing dot
  }
  return segments >= 2;
}

base::expected<std::set<ModulePermission>, std::string> ParsePermissions(const Dict& d, const char* key) {
  std::set<ModulePermission> out;
  const List* list = d.FindList(key);
  if (!list) return out;
  for (const base::Value& v : *list) {
    const std::string* s = v.GetIfString();
    if (!s) return base::unexpected(std::string(key) + " must contain strings");
    auto p = ParseModulePermission(*s);
    if (!p) return base::unexpected("unknown permission " + *s);
    if (!out.insert(*p).second) return base::unexpected("duplicate permission " + *s);
  }
  return out;
}

}  // namespace

bool IsValidModuleId(const std::string& id) { return IsId(id); }

bool IsSafeRelativeJsPath(const std::string& path) {
  if (path.size() < 4 || path.size() > 200 || path[0] == '/' || path.find("..") != std::string::npos) return false;
  if (!base::EndsWith(path, ".js")) return false;
  return std::all_of(path.begin(), path.end(), [](char c) { return std::isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '.' || c == '/' || c == '-'; });
}

base::expected<ModuleManifest, std::string> ParseModuleManifest(const Dict& dict) {
  ModuleManifest m;
  const std::string* id = dict.FindString("id");
  const std::string* version = dict.FindString("version");
  const std::string* kind = dict.FindString("kind");
  std::optional<int> api = dict.FindInt("apiVersion");
  if (!id || !IsValidModuleId(*id)) return base::unexpected("invalid or missing id");
  if (!version || version->empty()) return base::unexpected("missing version");
  if (!api || std::find(std::begin(kSupportedApiVersions), std::end(kSupportedApiVersions), *api) == std::end(kSupportedApiVersions)) {
    return base::unexpected("unsupported apiVersion");
  }
  if (!kind || (*kind != "builtin" && *kind != "ui-mod")) return base::unexpected("kind must be builtin or ui-mod");
  m.id = *id;
  m.version = *version;
  m.api_version = *api;
  m.kind = *kind == "builtin" ? ModuleKind::kBuiltin : ModuleKind::kUiMod;

  const bool corvid_ns = base::StartsWith(m.id, "corvid.");
  if (m.kind == ModuleKind::kBuiltin && !corvid_ns) return base::unexpected("builtin modules must use the corvid. namespace");
  if (m.kind == ModuleKind::kUiMod && corvid_ns) return base::unexpected("the corvid. namespace is reserved for builtin modules");

  auto req = ParsePermissions(dict, "permissions");
  if (!req.has_value()) return base::unexpected(req.error());
  auto opt = ParsePermissions(dict, "optionalPermissions");
  if (!opt.has_value()) return base::unexpected(opt.error());
  for (ModulePermission p : *opt) {
    if (req->count(p)) return base::unexpected("permission listed as both required and optional");
  }
  if (m.kind == ModuleKind::kUiMod) {
    for (ModulePermission p : *req) if (IsBuiltinOnly(p)) return base::unexpected("builtin-only permission requested by a ui-mod");
    for (ModulePermission p : *opt) if (IsBuiltinOnly(p)) return base::unexpected("builtin-only permission requested by a ui-mod");
  }
  m.permissions = std::move(*req);
  m.optional_permissions = std::move(*opt);

  if (const List* requires_list = dict.FindList("requires")) {
    for (const base::Value& v : *requires_list) {
      const std::string* s = v.GetIfString();
      if (!s || !IsValidModuleId(*s) || *s == m.id) return base::unexpected("invalid requires entry");
      m.requires_modules.push_back(*s);
    }
  }
  if (const std::string* entry = dict.FindString("entry")) {
    if (!IsSafeRelativeJsPath(*entry)) return base::unexpected("unsafe entry path");
    m.entry = *entry;
  } else if (m.kind == ModuleKind::kUiMod) {
    return base::unexpected("ui-mod needs an entry script");
  }
  if (const List* slots = dict.FindList("slots")) {
    for (const base::Value& v : *slots) {
      const Dict* s = v.GetIfDict();
      const std::string* comp = s ? s->FindString("component") : nullptr;
      if (!comp || comp->find('-') == std::string::npos) return base::unexpected("slot component must be a custom element name");
      if (m.kind == ModuleKind::kUiMod && s->FindString("role")) return base::unexpected("role is reserved for builtin modules");
      m.components.push_back(*comp);
    }
  }
  return m;
}

}  // namespace corvid
