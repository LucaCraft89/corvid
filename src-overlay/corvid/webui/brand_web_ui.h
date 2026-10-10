// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#ifndef CORVID_WEBUI_BRAND_WEB_UI_H_
#define CORVID_WEBUI_BRAND_WEB_UI_H_

namespace corvid {

// Registers one WebUIConfig per bundled Corvid page (chrome://corvid-<page>). Called from RegisterChromeWebUIConfigs()
// (patches/ui/0200).
void RegisterWebUIConfigs();

// Deny by default (patches/ui/0220): removes every chrome:// WebUIConfig that is not a Corvid page or a *.top-chrome shell WebUI, so a stock page
// cannot be created by any path that bypasses the URL handler. Call at the end of RegisterChromeWebUIConfigs().
void RemoveStockWebUIConfigs();

}  // namespace corvid

#endif  // CORVID_WEBUI_BRAND_WEB_UI_H_
