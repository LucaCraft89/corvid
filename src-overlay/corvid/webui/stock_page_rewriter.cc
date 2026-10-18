// Compiled and tested against Chromium 155 (M2).
#include "corvid/webui/stock_page_rewriter.h"

#include "content/public/browser/browser_url_handler.h"
#include "corvid/webui/stock_page_policy.h"

namespace corvid {

bool HandleStockUrl(GURL* url, content::BrowserContext* /*browser_context*/) {
  if (url->SchemeIs("chrome") && IsStockFallbackHost(url->host())) return false;
  std::optional<GURL> rewritten = RewriteStockUrl(*url);
  if (!rewritten) return false;
  *url = *rewritten;
  return true;
}

void RegisterStockPageRewriter() {
  content::BrowserURLHandler::GetInstance()->AddHandlerPair(&HandleStockUrl, content::BrowserURLHandler::null_handler());
}

}  // namespace corvid
