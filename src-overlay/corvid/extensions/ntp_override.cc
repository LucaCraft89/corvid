// UNVERIFIED: not compiled.
#include "corvid/extensions/ntp_override.h"

#include <algorithm>

namespace corvid {

NtpResolution ResolveNewTab(const std::vector<NtpCandidate>& extensions,
                            const std::optional<std::string>& picked,
                            bool incognito,
                            bool force_default) {
  if (force_default) return {};
  std::vector<const NtpCandidate*> eligible;
  for (const NtpCandidate& e : extensions) {
    if (e.overrides_newtab && (!incognito || e.incognito_allowed)) eligible.push_back(&e);
  }
  if (picked && *picked == "corvid") return {};
  if (picked) {
    for (const NtpCandidate* e : eligible) {
      if (e->extension_id == *picked) return {e->extension_id};
    }
  }
  const NtpCandidate* latest = nullptr;
  for (const NtpCandidate* e : eligible) {
    if (!latest || e->enabled_at > latest->enabled_at) latest = e;
  }
  return latest ? NtpResolution{latest->extension_id} : NtpResolution{};
}

}  // namespace corvid
