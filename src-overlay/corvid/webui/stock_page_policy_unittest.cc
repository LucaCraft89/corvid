// UNVERIFIED: not compiled. Cases that depend on the generated table use hosts present in ui/pages/stock-pages.json.
#include "corvid/webui/stock_page_policy.h"
#include "corvid/webui/stock_page_rewriter.h"

#include "testing/gtest/include/gtest/gtest.h"
#include "url/gurl.h"
#include "url/url_util.h"

namespace corvid {

// corvid:// must be a standard scheme for GURL::host()/path() to work; production registers it in
// ContentClient::AddAdditionalSchemes (patches/ui/0200).
class StockPageTest : public testing::Test {
 protected:
  void SetUp() override { url::AddStandardScheme("corvid", url::SCHEME_WITH_HOST); }
  url::ScopedSchemeRegistryForTests scheme_registry_;
};

TEST_F(StockPageTest, StockPagePolicyTestReplacedAndRedirected) {
  auto d = LookupStockPage("settings");
  ASSERT_TRUE(d);
  EXPECT_EQ(d->action, StockPageAction::kReplaced);
  EXPECT_EQ(d->target_host, "settings");
  EXPECT_EQ(RewriteStockUrl(GURL("chrome://version/"))->spec(), "corvid://about/");
  EXPECT_EQ(RewriteStockUrl(GURL("chrome://credits/"))->host(), "about");
}

TEST_F(StockPageTest, StockPagePolicyTestKnownDiagnosticPagesAreBlocked) {
  for (const char* url : {"chrome://flags/", "chrome://net-internals/", "chrome://sync-internals/", "chrome://inspect/"}) {
    auto u = RewriteStockUrl(GURL(url));
    ASSERT_TRUE(u) << url;
    EXPECT_EQ(u->host(), "blocked") << url;
  }
}

TEST_F(StockPageTest, StockPagePolicyTestUnknownHostIsBlockedDenyByDefault) {
  auto u = RewriteStockUrl(GURL("chrome://totally-new-internals/"));
  ASSERT_TRUE(u);
  EXPECT_EQ(u->host(), "blocked");
  EXPECT_NE(u->query().find("url="), std::string::npos) << "blocked page is told what was requested";
}

TEST_F(StockPageTest, StockPagePolicyTestUntrustedAndSearchSchemesAreGoverned) {
  EXPECT_TRUE(RewriteStockUrl(GURL("chrome-untrusted://anything/")));
  EXPECT_TRUE(RewriteStockUrl(GURL("chrome-search://local-ntp/")));
}

TEST_F(StockPageTest, StockPagePolicyTestSubpathsOfReplacedPagesSurvive) {
  auto u = RewriteStockUrl(GURL("chrome://settings/layout#reset"));
  ASSERT_TRUE(u);
  EXPECT_EQ(u->host(), "settings");
  EXPECT_EQ(u->path(), "/layout");
  EXPECT_EQ(u->ref(), "reset");
}

TEST_F(StockPageTest, StockPagePolicyTestNonStockUrlsUntouched) {
  EXPECT_FALSE(RewriteStockUrl(GURL("https://example.com/")));
  EXPECT_FALSE(RewriteStockUrl(GURL("corvid://settings/")));
  EXPECT_FALSE(RewriteStockUrl(GURL("devtools://devtools/bundled/inspector.html")));  // DevTools stays (CR-9)
  EXPECT_FALSE(RewriteStockUrl(GURL("about:blank")));
}

TEST_F(StockPageTest, StockPageRewriterTestHandlerRewritesInPlace) {
  GURL url("chrome://history/");
  EXPECT_TRUE(HandleStockUrl(&url, nullptr));
  EXPECT_EQ(url.spec(), "corvid://history/");
  GURL web("https://example.com/");
  EXPECT_FALSE(HandleStockUrl(&web, nullptr));
  EXPECT_EQ(web.spec(), "https://example.com/");
}

}  // namespace corvid
