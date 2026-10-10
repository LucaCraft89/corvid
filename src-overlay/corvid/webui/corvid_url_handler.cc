// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "corvid/webui/corvid_url_handler.h"

#include <algorithm>
#include <string>

#include "base/strings/escape.h"
#include "base/strings/strcat.h"
#include "content/public/browser/browser_url_handler.h"
#include "corvid/webui/corvid_resources.h"
#include "corvid/webui/stock_page_policy.h"

namespace corvid {

namespace {

// "/path?query#ref" of |url| without the leading authority.
std::string TailOf(const GURL& url) {
  return base::StrCat({url.path(), url.has_query() ? "?" : "", url.query(), url.has_ref() ? "#" : "", url.ref()});
}

}  // namespace

bool HandleCorvidUrl(GURL* url, content::BrowserContext*) {
  bool changed = false;
  if (std::optional<GURL> stock = RewriteStockUrl(*url)) {
    *url = *stock;  // corvid://<page>/... or corvid://blocked/?url=...
    changed = true;
  }
  if (!url->SchemeIs(kCorvidScheme)) return changed;

  const std::vector<std::string> pages = CorvidPageNames();
  const std::string host(url->host());
  if (std::ranges::find(pages, host) != pages.end()) {
    *url = GURL(base::StrCat({"chrome://", kInternalHostPrefix, host, TailOf(*url)}));
  } else {
    *url = GURL(base::StrCat({"chrome://", kInternalHostPrefix, "blocked/?url=",
                              base::EscapeQueryParamValue(url->spec(), /*use_plus=*/false)}));
  }
  return true;
}

bool HandleCorvidUrlReverse(GURL* url, content::BrowserContext*) {
  if (!url->SchemeIs("chrome") || !url->host().starts_with(kInternalHostPrefix)) return false;
  *url = GURL(base::StrCat({kCorvidScheme, "://", url->host().substr(sizeof(kInternalHostPrefix) - 1), TailOf(*url)}));
  return true;
}

void RegisterCorvidUrlHandlers(content::BrowserURLHandler* handler) {
  handler->AddHandlerPair(&HandleCorvidUrl, &HandleCorvidUrlReverse);
}

}  // namespace corvid
