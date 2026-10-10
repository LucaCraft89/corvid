// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "corvid/webui/brand_url_handler.h"

#include "corvid/webui/corvid_resources.h"
#include "testing/gtest/include/gtest/gtest.h"
#include "url/gurl.h"
#include "url/url_util.h"

namespace corvid {

class BrandUrlHandlerTest : public testing::Test {
 protected:
  BrandUrlHandlerTest() {
    for (const char* scheme : {"chrome", "corvid"}) url::AddStandardScheme(scheme, url::SCHEME_WITH_HOST);
  }
  url::ScopedSchemeRegistryForTests scheme_registry_;
};

TEST_F(BrandUrlHandlerTest, BundledPagesIncludeTheStockTargets) {
  const auto pages = CorvidPageNames();
  for (const char* want : {"blocked", "newtab", "settings", "history", "downloads", "extensions", "about", "error"}) {
    EXPECT_NE(std::ranges::find(pages, want), pages.end()) << want;
  }
}

TEST_F(BrandUrlHandlerTest, CorvidUrlLoadsInternalHost) {
  GURL url("corvid://settings/privacy?x=1#top");
  EXPECT_TRUE(HandleBrandUrl(&url, nullptr));
  EXPECT_EQ(url.spec(), "chrome://corvid-settings/privacy?x=1#top");
}

TEST_F(BrandUrlHandlerTest, StockUrlGoesStraightToCorvidPage) {
  GURL url("chrome://history/");
  EXPECT_TRUE(HandleBrandUrl(&url, nullptr));
  EXPECT_EQ(url.spec(), "chrome://corvid-history/");
}

TEST_F(BrandUrlHandlerTest, StockBlockedAndUnknownHostsGoToBlockedPage) {
  for (const char* in : {"chrome://net-internals/", "chrome://no-such-host/", "corvid://no-such-page/"}) {
    GURL url(in);
    EXPECT_TRUE(HandleBrandUrl(&url, nullptr)) << in;
    EXPECT_EQ(url.host(), "corvid-blocked") << in;
    EXPECT_NE(url.query().find("url="), std::string::npos) << in;
    EXPECT_EQ(url.query().find('.'), std::string::npos) << in;
  }
}

TEST_F(BrandUrlHandlerTest, InternalHostsAndWebUrlsAreLeftAlone) {
  GURL internal("chrome://corvid-settings/");
  EXPECT_FALSE(HandleBrandUrl(&internal, nullptr));
  GURL web("https://example.com/");
  EXPECT_FALSE(HandleBrandUrl(&web, nullptr));
}

TEST_F(BrandUrlHandlerTest, UnlistedTopChromeHostsPassThroughListedOnesAreBlocked) {
  GURL omnibox("chrome://omnibox-popup.top-chrome/");
  EXPECT_FALSE(HandleBrandUrl(&omnibox, nullptr));
  GURL tab_strip("chrome://tab-strip.top-chrome/");
  EXPECT_TRUE(HandleBrandUrl(&tab_strip, nullptr));
  EXPECT_EQ(tab_strip.host(), "corvid-blocked");
}

TEST_F(BrandUrlHandlerTest, HeadlessCommandHostIsNotRewritten) {
  GURL url("chrome://headless/headless_command.html");
  EXPECT_FALSE(HandleBrandUrl(&url, nullptr));
}

TEST_F(BrandUrlHandlerTest, ReverseShowsCorvidScheme) {
  GURL url("chrome://corvid-settings/privacy?x=1");
  EXPECT_TRUE(HandleBrandUrlReverse(&url, nullptr));
  EXPECT_EQ(url.spec(), "corvid://settings/privacy?x=1");
  GURL other("chrome://version/");
  EXPECT_FALSE(HandleBrandUrlReverse(&other, nullptr));
}

}  // namespace corvid
