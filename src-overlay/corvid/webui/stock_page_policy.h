// UNVERIFIED: not compiled (no Chromium checkout was available). Review against the pinned tree.
// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#ifndef CORVID_WEBUI_STOCK_PAGE_POLICY_H_
#define CORVID_WEBUI_STOCK_PAGE_POLICY_H_

#include <optional>
#include <string>
#include <string_view>

#include "url/gurl.h"

namespace corvid {

enum class StockPageAction { kReplaced = 0, kRedirected = 1, kBlocked = 2 };

struct StockPageDecision {
  StockPageAction action;
  // Corvid page host to load instead (e.g. "settings"); "blocked" for blocked pages.
  std::string target_host;
};

// Source of truth: ui/pages/stock-pages.json (generated into stock_page_table.inc).
// Returns the decision for a stock chrome:// (or chrome-untrusted://) host.
// Unknown hosts under those schemes are BLOCKED (deny by default).
std::optional<StockPageDecision> LookupStockPage(std::string_view host);

// Rewrites a stock URL to its Corvid replacement, or to corvid://blocked?url=<original>.
// Returns nullopt for URLs this policy does not govern (non chrome:// schemes, corvid://, web URLs).
std::optional<GURL> RewriteStockUrl(const GURL& url);

}  // namespace corvid

#endif  // CORVID_WEBUI_STOCK_PAGE_POLICY_H_
