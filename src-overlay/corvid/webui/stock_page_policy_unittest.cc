// UNVERIFIED: not compiled.
#include "corvid/webui/stock_page_policy.h"

#include "testing/gtest/include/gtest/gtest.h"
#include "url/gurl.h"

namespace corvid {

TEST(StockPagePolicyTest, ReplacedAndRedirected) {
  auto d = LookupStockPage("settings");
  ASSERT_TRUE(d);
  EXPECT_EQ(d->action, StockPageAction::kReplaced);
  EXPECT_EQ(d->target_host, "settings");
  EXPECT_EQ(RewriteStockUrl(GURL("chrome://version/"))->spec(), "corvid://about/");
}

TEST(StockPagePolicyTest, UnknownHostIsBlocked) {
  auto u = RewriteStockUrl(GURL("chrome://totally-new-internals/"));
  ASSERT_TRUE(u);
  EXPECT_EQ(u->host(), "blocked");
}

TEST(StockPagePolicyTest, NonStockUrlsUntouched) {
  EXPECT_FALSE(RewriteStockUrl(GURL("https://example.com/")));
  EXPECT_FALSE(RewriteStockUrl(GURL("corvid://settings/")));
}

}  // namespace corvid
