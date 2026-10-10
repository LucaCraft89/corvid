// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// corvid:// is an alias scheme over chrome:// (see docs/notes/corvid-scheme.md): users and the omnibox see corvid://x,
// the renderer and WebUI machinery load chrome://corvid-x.
#ifndef CORVID_WEBUI_BRAND_URL_HANDLER_H_
#define CORVID_WEBUI_BRAND_URL_HANDLER_H_

#include <string_view>

#include "url/gurl.h"

namespace content {
class BrowserContext;
class BrowserURLHandler;
}  // namespace content

namespace corvid {


// Forward (BrowserURLHandler::URLHandler): stock chrome:// -> Corvid page (or blocked page); corvid://x -> chrome://corvid-x.
// Unknown corvid:// hosts load the blocked page. Returns true when |url| was changed.
bool HandleBrandUrl(GURL* url, content::BrowserContext* browser_context);

// Reverse (what the user sees): chrome://corvid-x -> corvid://x. Returns true when |url| was changed.
bool HandleBrandUrlReverse(GURL* url, content::BrowserContext* browser_context);

// Adds the pair as the first handler (it must run before every other chrome:// handler). patches/ui/0200.
void RegisterBrandUrlHandlers(content::BrowserURLHandler* handler);

}  // namespace corvid

#endif  // CORVID_WEBUI_BRAND_URL_HANDLER_H_
