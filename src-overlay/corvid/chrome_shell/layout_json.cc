// Compiled and tested against Chromium 155 (M2).
#include "corvid/chrome_shell/layout_json.h"

#include <optional>

#include "base/json/json_reader.h"
#include "corvid/base_compat.h"

namespace corvid {

namespace {

bool IsPlausibleLayout(const Dict& layout) {
  if (layout.FindInt("version") != 1) return false;
  const Dict* regions = layout.FindDict("regions");
  if (!regions) return false;
  for (const char* region : {"top", "bottom", "left", "right", "floating"}) {
    const Dict* r = regions->FindDict(region);
    if (!r || !r->FindList("slots")) return false;
  }
  return true;
}

}  // namespace

bool IsPlausibleLayoutLibrary(std::string_view json) {
  std::optional<Dict> root = base::JSONReader::ReadDict(json, base::JSON_PARSE_RFC);
  if (!root) return false;
  if (root->FindInt("format") != 1) return false;
  const std::string* active = root->FindString("active");
  if (!active || active->empty() || active->size() > 80) return false;
  const Dict* layouts = root->FindDict("layouts");
  if (!layouts || layouts->size() > static_cast<size_t>(kMaxLayouts)) return false;
  for (const auto [name, value] : *layouts) {
    if (name.empty() || name.size() > 80) return false;
    const Dict* layout = value.GetIfDict();
    if (!layout || !IsPlausibleLayout(*layout)) return false;
  }
  return true;
}

}  // namespace corvid
