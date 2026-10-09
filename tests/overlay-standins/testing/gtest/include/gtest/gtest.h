// STAND-IN, not googletest. Just enough of the gtest macro surface to run the pure-logic overlay unit tests with g++
// on a machine that has no Chromium checkout (scripts/overlay-selfcheck.sh). Proves logic only; says nothing about
// whether the code compiles against real Chromium headers.
#pragma once
#include <cmath>
#include <cstdio>
#include <cstring>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace testing {
class Test {
 public:
  virtual ~Test() = default;
  virtual void SetUp() {}
  virtual void TearDown() {}
  virtual void TestBody() = 0;
};
struct Msg {
  template <class T> Msg& operator<<(const T&) { return *this; }
};
inline int& Failures() { static int n = 0; return n; }
struct Reporter {
  Reporter(const char* file, int line, const char* expr) { std::fprintf(stderr, "  FAIL %s:%d: %s\n", file, line, expr); ++Failures(); }
  void operator=(const Msg&) const {}
};
struct Case { std::string name; std::function<std::unique_ptr<Test>()> make; };
inline std::vector<Case>& Registry() { static std::vector<Case> r; return r; }
struct Registrar {
  Registrar(std::string n, std::function<std::unique_ptr<Test>()> m) { Registry().push_back({std::move(n), std::move(m)}); }
};
inline int RunAll() {
  int failed_cases = 0;
  for (auto& c : Registry()) {
    int before = Failures();
    auto t = c.make();
    t->SetUp();
    t->TestBody();
    t->TearDown();
    bool ok = Failures() == before;
    std::printf("[%s] %s\n", ok ? " OK " : "FAIL", c.name.c_str());
    if (!ok) ++failed_cases;
  }
  std::printf("%zu test(s), %d failed\n", Registry().size(), failed_cases);
  return failed_cases ? 1 : 0;
}
}  // namespace testing

#define STANDIN_CAT_(a, b) a##b
#define STANDIN_CAT(a, b) STANDIN_CAT_(a, b)
#define STANDIN_TEST_IMPL(suite, name, parent)                                                              \
  class STANDIN_CAT(suite, STANDIN_CAT(_, STANDIN_CAT(name, _Test))) : public parent { void TestBody() override; }; \
  static ::testing::Registrar STANDIN_CAT(reg_, STANDIN_CAT(suite, STANDIN_CAT(_, name)))(                  \
      #suite "." #name, [] { return std::unique_ptr<::testing::Test>(new STANDIN_CAT(suite, STANDIN_CAT(_, STANDIN_CAT(name, _Test)))); }); \
  void STANDIN_CAT(suite, STANDIN_CAT(_, STANDIN_CAT(name, _Test)))::TestBody()
#define TEST(suite, name) STANDIN_TEST_IMPL(suite, name, ::testing::Test)
#define TEST_F(fixture, name) STANDIN_TEST_IMPL(fixture, name, fixture)

#define STANDIN_EXPECT(cond) switch (0) case 0: default: if (cond) ; else ::testing::Reporter(__FILE__, __LINE__, #cond) = ::testing::Msg()
#define STANDIN_ASSERT(cond) switch (0) case 0: default: if (cond) ; else return ::testing::Reporter(__FILE__, __LINE__, #cond) = ::testing::Msg()
#define EXPECT_TRUE(c) STANDIN_EXPECT(static_cast<bool>(c))
#define EXPECT_FALSE(c) STANDIN_EXPECT(!static_cast<bool>(c))
#define ASSERT_TRUE(c) STANDIN_ASSERT(static_cast<bool>(c))
#define ASSERT_FALSE(c) STANDIN_ASSERT(!static_cast<bool>(c))
#define EXPECT_EQ(a, b) STANDIN_EXPECT((a) == (b))
#define EXPECT_NE(a, b) STANDIN_EXPECT((a) != (b))
#define EXPECT_LT(a, b) STANDIN_EXPECT((a) < (b))
#define EXPECT_LE(a, b) STANDIN_EXPECT((a) <= (b))
#define EXPECT_GT(a, b) STANDIN_EXPECT((a) > (b))
#define ASSERT_EQ(a, b) STANDIN_ASSERT((a) == (b))
#define ASSERT_GT(a, b) STANDIN_ASSERT((a) > (b))
#define ASSERT_LE(a, b) STANDIN_ASSERT((a) <= (b))
#define EXPECT_NEAR(a, b, tol) STANDIN_EXPECT(std::fabs((a) - (b)) <= (tol))
#define EXPECT_STREQ(a, b) STANDIN_EXPECT(std::strcmp((a), (b)) == 0)
#define EXPECT_STRNE(a, b) STANDIN_EXPECT(std::strcmp((a), (b)) != 0)
