// UNVERIFIED: not compiled. Cases that name hosts use hosts present in ui/pages/stock-pages.json
// (docs/stock-pages.md); the table-wide test re-includes the generated table so it cannot drift from it.
#include "corvid/webui/stock_page_policy.h"

#include <iterator>
#include <set>
#include <string>

#include "testing/gtest/include/gtest/gtest.h"
#include "url/gurl.h"
#include "url/url_util.h"

namespace corvid {

namespace {
struct Row {
  const char* host;
  int action;
  const char* target;
};
constexpr Row kRows[] = {
#include "corvid/webui/stock_page_table.inc"
};
}  // namespace

// The chrome*:// and corvid:// schemes are registered by content/the Corvid patch in production; the bare
// base test suite registers none of them, and without a standard scheme GURL::host() is empty.
class StockPagePolicyTest : public testing::Test {
 protected:
  StockPagePolicyTest() {
    for (const char* scheme : {"chrome", "chrome-untrusted", "chrome-search", "corvid"}) {
      url::AddStandardScheme(scheme, url::SCHEME_WITH_HOST);
    }
  }
  url::ScopedSchemeRegistryForTests scheme_registry_;
};

TEST_F(StockPagePolicyTest, ReplacedAndRedirected) {
  auto d = LookupStockPage("settings");
  ASSERT_TRUE(d);
  EXPECT_EQ(d->action, StockPageAction::kReplaced);
  EXPECT_EQ(d->target_host, "settings");
  EXPECT_EQ(RewriteStockUrl(GURL("chrome://version/"))->spec(), "corvid://about/");
  EXPECT_EQ(RewriteStockUrl(GURL("chrome://credits/"))->host(), "about");
}

TEST_F(StockPagePolicyTest, KnownDiagnosticPagesAreBlocked) {
  for (const char* url : {"chrome://flags/", "chrome://net-internals/", "chrome://sync-internals/", "chrome://inspect/"}) {
    auto u = RewriteStockUrl(GURL(url));
    ASSERT_TRUE(u) << url;
    EXPECT_EQ(u->host(), "blocked") << url;
  }
}

TEST_F(StockPagePolicyTest, UnknownHostIsBlockedDenyByDefault) {
  auto u = RewriteStockUrl(GURL("chrome://totally-new-internals/"));
  ASSERT_TRUE(u);
  EXPECT_EQ(u->host(), "blocked");
  EXPECT_NE(u->query().find("url="), std::string::npos) << "blocked page is told what was requested";
}

TEST_F(StockPagePolicyTest, UntrustedAndSearchSchemesAreGoverned) {
  auto u = RewriteStockUrl(GURL("chrome-untrusted://anything/"));
  ASSERT_TRUE(u);
  EXPECT_EQ(u->host(), "blocked");
  EXPECT_TRUE(RewriteStockUrl(GURL("chrome-search://local-ntp/")));
}

TEST_F(StockPagePolicyTest, SubpathsOfReplacedPagesSurvive) {
  auto u = RewriteStockUrl(GURL("chrome://settings/layout#reset"));
  ASSERT_TRUE(u);
  EXPECT_EQ(u->host(), "settings");
  EXPECT_EQ(u->path(), "/layout");
  EXPECT_EQ(u->ref(), "reset");
}

TEST_F(StockPagePolicyTest, NonStockUrlsUntouched) {
  EXPECT_FALSE(RewriteStockUrl(GURL("https://example.com/")));
  EXPECT_FALSE(RewriteStockUrl(GURL("corvid://settings/")));
  EXPECT_FALSE(RewriteStockUrl(GURL("devtools://devtools/bundled/inspector.html")));  // DevTools stays (CR-9)
  EXPECT_FALSE(RewriteStockUrl(GURL("about:blank")));
}

TEST_F(StockPagePolicyTest, WholeTableIsConsistent) {
  ASSERT_GT(std::size(kRows), 50u) << "table suspiciously small";
  std::set<std::string> seen;
  for (const Row& r : kRows) {
    EXPECT_TRUE(seen.insert(r.host).second) << "duplicate host in table: " << r.host;
    auto d = LookupStockPage(r.host);
    ASSERT_TRUE(d) << r.host;
    EXPECT_EQ(static_cast<int>(d->action), r.action) << r.host;
    EXPECT_EQ(d->target_host, r.target) << r.host;
    ASSERT_LE(r.action, 2) << r.host;
    // Blocked rows point at the blocked page; replaced/redirected rows never do.
    if (r.action == 2) {
      EXPECT_STREQ(r.target, "blocked") << r.host;
    } else {
      EXPECT_STRNE(r.target, "blocked") << r.host;
    }
    // Every row rewrites to a corvid:// URL on the right host, for all three governed schemes.
    for (const char* scheme : {"chrome", "chrome-untrusted", "chrome-search"}) {
      auto u = RewriteStockUrl(GURL(std::string(scheme) + "://" + r.host + "/"));
      ASSERT_TRUE(u) << scheme << "://" << r.host;
      EXPECT_TRUE(u->SchemeIs("corvid")) << r.host;
      EXPECT_EQ(u->host(), r.target) << scheme << "://" << r.host;
    }
  }
}

TEST_F(StockPagePolicyTest, ControlSurfacesAreNeverRedirectedToAWeakerPage) {
  // Hosts that expose profile-wide or code-level controls must resolve to blocked or to a Corvid replacement.
  // They may be absent from the table (deny-by-default blocks them), but never "redirected" to a generic page.
  for (const char* host : {"flags", "inspect", "net-export", "serviceworker-internals", "sync-internals", "tracing", "webrtc-internals"}) {
    if (auto d = LookupStockPage(host)) {
      EXPECT_NE(d->action, StockPageAction::kRedirected) << host;
    }
    auto u = RewriteStockUrl(GURL(std::string("chrome://") + host + "/"));
    ASSERT_TRUE(u) << host;
    EXPECT_TRUE(u->SchemeIs("corvid")) << host;
  }
}

}  // namespace corvid
