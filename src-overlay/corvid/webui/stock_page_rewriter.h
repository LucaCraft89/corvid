// UNVERIFIED: not compiled. API checked against content/public/browser/browser_url_handler.h (chromium mirror, 2026-10):
// typedef bool (*URLHandler)(GURL*, BrowserContext*); AddHandlerPair(handler, reverse_handler); null_handler().
#ifndef CORVID_WEBUI_STOCK_PAGE_REWRITER_H_
#define CORVID_WEBUI_STOCK_PAGE_REWRITER_H_

#include "url/gurl.h"

namespace content {
class BrowserContext;
}

namespace corvid {

// BrowserURLHandler::URLHandler: rewrites stock chrome:// URLs to Corvid pages (or corvid://blocked). Returns true
// when it rewrote |url|. Safe to call with a null |browser_context| (used by tests).
bool HandleStockUrl(GURL* url, content::BrowserContext* browser_context);

// Registers HandleStockUrl with BrowserURLHandler (forward only). Call once during early browser startup,
// before other handlers that might claim chrome:// URLs (patches/ui/0220).
void RegisterStockPageRewriter();

}  // namespace corvid

#endif  // CORVID_WEBUI_STOCK_PAGE_REWRITER_H_
