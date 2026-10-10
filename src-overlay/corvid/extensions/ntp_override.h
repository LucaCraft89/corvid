// Compiled and tested against Chromium 155 in M2 (docs/notes/chromium-api-m2.md). Mirrors ui/pages/shared/logic.ts resolveNewTab (the TS version is unit tested).
#ifndef CORVID_EXTENSIONS_NTP_OVERRIDE_H_
#define CORVID_EXTENSIONS_NTP_OVERRIDE_H_

#include <optional>
#include <string>
#include <vector>

#include "base/time/time.h"

namespace corvid {

struct NtpCandidate {
  std::string extension_id;
  base::Time enabled_at;
  bool overrides_newtab = false;
  bool incognito_allowed = false;
};

struct NtpResolution {
  // Empty => Corvid's own corvid://newtab.
  std::optional<std::string> extension_id;
};

// picked: nullopt = automatic; "corvid" = Corvid default; otherwise an extension id.
NtpResolution ResolveNewTab(const std::vector<NtpCandidate>& extensions,
                            const std::optional<std::string>& picked,
                            bool incognito,
                            bool force_default);

}  // namespace corvid

#endif  // CORVID_EXTENSIONS_NTP_OVERRIDE_H_
