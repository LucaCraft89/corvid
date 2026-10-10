// Compiled and tested against Chromium 155 in M2 (docs/notes/chromium-api-m2.md). See stock_page_policy.h.
#include "corvid/webui/stock_page_policy.h"


#include "base/strings/escape.h"
#include "base/strings/strcat.h"

namespace corvid {

namespace {

struct Entry {
  const char* host;
  int action;
  const char* target;
};

// {"host", action, "target"}, sorted by host (generator sorts).
constexpr Entry kTable[] = {
#include "corvid/webui/stock_page_table.inc"
};

constexpr char kCorvidScheme[] = "corvid";  // from branding url_scheme at render time

}  // namespace

std::optional<StockPageDecision> LookupStockPage(std::string_view host) {
  for (const Entry& e : kTable) {
    if (host == e.host) {
      return StockPageDecision{static_cast<StockPageAction>(e.action), e.target};
    }
  }
  return std::nullopt;
}

std::optional<GURL> RewriteStockUrl(const GURL& url) {
  if (!url.SchemeIs("chrome") && !url.SchemeIs("chrome-untrusted") && !url.SchemeIs("chrome-search")) {
    return std::nullopt;
  }
  // Corvid's own pages live at chrome://corvid-<page> (corvid_url_handler.h); they are not stock pages.
  if (url.SchemeIs("chrome") && url.host().starts_with("corvid-")) return std::nullopt;
  auto decision = LookupStockPage(url.host());
  // Views-embedded top-chrome WebUIs the stock shell needs until the Corvid shell replaces it (M5). Hosts listed in the
  // table are still blocked; this only lets unlisted ones (omnibox popup, ...) keep working.
  if (!decision && url.SchemeIs("chrome") && url.host().ends_with(".top-chrome")) return std::nullopt;
  const std::string host = decision ? decision->target_host : "blocked";
  std::string spec = base::StrCat({kCorvidScheme, "://", host, "/"});
  if (!decision || decision->action == StockPageAction::kBlocked) {
    // Deny by default; tell the blocked page what was requested (display only).
    base::StrAppend(&spec, {"?url=", base::EscapeQueryParamValue(url.spec(), /*use_plus=*/false)});
  } else if (url.has_path() && url.path().size() > 1) {
    // Keep sub-paths for replaced pages that have sections (settings/layout#reset).
    spec = base::StrCat({kCorvidScheme, "://", host, url.path(), url.has_ref() ? "#" : "", url.ref()});
  }
  return GURL(spec);
}

}  // namespace corvid
