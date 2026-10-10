// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "corvid/webui/brand_url_handler.h"

#include <algorithm>
#include <string>

#include "base/strings/escape.h"
#include "base/strings/strcat.h"
#include "content/public/browser/browser_url_handler.h"
#include "corvid/webui/corvid_resources.h"
#include "corvid/webui/stock_page_policy.h"
#include "corvid/webui/brand.h"

namespace corvid {

namespace {

// "/path?query#ref" of |url| without the leading authority.
std::string TailOf(const GURL& url) {
  return base::StrCat({url.path(), url.has_query() ? "?" : "", url.query(), url.has_ref() ? "#" : "", url.ref()});
}

}  // namespace

bool HandleBrandUrl(GURL* url, content::BrowserContext*) {
  bool changed = false;
  if (std::optional<GURL> stock = RewriteStockUrl(*url)) {
    *url = *stock;  // corvid://<page>/... or corvid://blocked/?url=...
    changed = true;
  }
  if (!url->SchemeIs(kBrandScheme)) return changed;

  const std::vector<std::string> pages = CorvidPageNames();
  const std::string host(url->host());
  if (std::ranges::find(pages, host) != pages.end()) {
    *url = GURL(base::StrCat({"chrome://", kBrandHostPrefix, host, TailOf(*url)}));
  } else {
    *url = GURL(base::StrCat({"chrome://", kBrandHostPrefix, "blocked/?url=",
                              base::EscapeQueryParamValue(url->spec(), /*use_plus=*/false)}));
  }
  return true;
}

bool HandleBrandUrlReverse(GURL* url, content::BrowserContext*) {
  if (!url->SchemeIs("chrome") || !url->host().starts_with(kBrandHostPrefix)) return false;
  *url = GURL(base::StrCat({kBrandScheme, "://", url->host().substr(sizeof(kBrandHostPrefix) - 1), TailOf(*url)}));
  return true;
}

void RegisterBrandUrlHandlers(content::BrowserURLHandler* handler) {
  handler->AddHandlerPair(&HandleBrandUrl, &HandleBrandUrlReverse);
}

}  // namespace corvid
