// Compiled and tested against Chromium 155 in M2 (docs/notes/chromium-api-m2.md).
// Structural sanity check for the layout library JSON that the (untrusted) WebUI renderer asks us to persist.
// This is NOT the full validation: the authoritative schema (ui/layout/layout.schema.json) and repair logic run in
// TypeScript on load. The browser only refuses data that cannot possibly be a layout library, so a compromised or
// buggy renderer cannot fill the profile with arbitrary files.
#ifndef CORVID_CHROME_SHELL_LAYOUT_JSON_H_
#define CORVID_CHROME_SHELL_LAYOUT_JSON_H_

#include <string_view>

namespace corvid {

// True if |json| is a dict {"format":1,"active":<string>,"layouts":{<name>:{"version":1,"regions":{top,bottom,left,right,floating}}}}
// with at most kMaxLayouts layouts, each name 1..80 chars.
bool IsPlausibleLayoutLibrary(std::string_view json);

inline constexpr int kMaxLayouts = 32;

}  // namespace corvid

#endif  // CORVID_CHROME_SHELL_LAYOUT_JSON_H_
