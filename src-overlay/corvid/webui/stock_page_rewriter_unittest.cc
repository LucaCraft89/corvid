// Compiled and tested against Chromium 155 (M2).
#include "corvid/webui/stock_page_rewriter.h"

#include "testing/gtest/include/gtest/gtest.h"
#include "url/gurl.h"
#include "url/url_util.h"

namespace corvid {

class StockPageRewriterTest : public testing::Test {
 protected:
  StockPageRewriterTest() {
    for (const char* scheme : {"chrome", "corvid"}) url::AddStandardScheme(scheme, url::SCHEME_WITH_HOST);
  }
  url::ScopedSchemeRegistryForTests scheme_registry_;
};

TEST_F(StockPageRewriterTest, HandlerRewritesInPlace) {
  GURL url("chrome://newtab/");
  EXPECT_TRUE(HandleStockUrl(&url, nullptr));
  EXPECT_EQ(url.spec(), "corvid://newtab/");
}

TEST_F(StockPageRewriterTest, HandlerLeavesWebUrlsAlone) {
  GURL web("https://example.com/");
  EXPECT_FALSE(HandleStockUrl(&web, nullptr));
  EXPECT_EQ(web.spec(), "https://example.com/");
}

TEST_F(StockPageRewriterTest, UnknownStockHostBecomesBlockedPage) {
  GURL url("chrome://definitely-not-a-page/");
  EXPECT_TRUE(HandleStockUrl(&url, nullptr));
  EXPECT_EQ(url.host(), "blocked");
}

}  // namespace corvid
