// UNVERIFIED: not compiled.
#include "corvid/chrome_shell/layout_storage.h"

#include <string>

#include "base/files/file_enumerator.h"
#include "base/files/file_util.h"
#include "base/files/scoped_temp_dir.h"
#include "corvid/chrome_shell/layout_json.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace corvid {
namespace {

constexpr char kGoodLayout[] = R"({
  "version": 1, "name": "compact",
  "regions": {"top": {"slots": []}, "bottom": {"slots": []}, "left": {"slots": []}, "right": {"slots": []}, "floating": {"slots": []}}
})";

std::string Library(const std::string& layout = kGoodLayout) {
  return R"({"format":1,"active":"compact","layouts":{"compact":)" + layout + "}}";
}

TEST(LayoutJsonTest, AcceptsWellFormedLibrary) {
  EXPECT_TRUE(IsPlausibleLayoutLibrary(Library()));
}

TEST(LayoutJsonTest, RejectsMalformedAndWrongShapes) {
  EXPECT_FALSE(IsPlausibleLayoutLibrary(""));
  EXPECT_FALSE(IsPlausibleLayoutLibrary("{"));
  EXPECT_FALSE(IsPlausibleLayoutLibrary("[]"));
  EXPECT_FALSE(IsPlausibleLayoutLibrary(R"({"format":2,"active":"a","layouts":{}})"));
  EXPECT_FALSE(IsPlausibleLayoutLibrary(R"({"format":1,"layouts":{}})"));
  EXPECT_FALSE(IsPlausibleLayoutLibrary(R"({"format":1,"active":"","layouts":{}})"));
  EXPECT_FALSE(IsPlausibleLayoutLibrary(Library(R"({"version":1,"regions":{"top":{"slots":[]}}})")));
  EXPECT_FALSE(IsPlausibleLayoutLibrary(Library(R"("not a dict")")));
}

TEST(LayoutJsonTest, RejectsTooManyLayouts) {
  std::string layouts;
  for (int i = 0; i <= kMaxLayouts; ++i) {
    if (i) layouts += ",";
    layouts += "\"l" + std::to_string(i) + "\":" + kGoodLayout;
  }
  EXPECT_FALSE(IsPlausibleLayoutLibrary(R"({"format":1,"active":"l0","layouts":{)" + layouts + "}}"));
}

class LayoutStorageTest : public testing::Test {
 protected:
  void SetUp() override { ASSERT_TRUE(dir_.CreateUniqueTempDir()); }
  base::ScopedTempDir dir_;
};

TEST_F(LayoutStorageTest, MissingFileReadsAsNullopt) {
  LayoutStorage s(dir_.GetPath());
  EXPECT_FALSE(s.Read());
}

TEST_F(LayoutStorageTest, WriteThenReadRoundTrip) {
  LayoutStorage s(dir_.GetPath());
  ASSERT_TRUE(s.Write(Library()));
  EXPECT_EQ(s.Read(), Library());
  // overwrite is atomic and leaves no temp files behind
  ASSERT_TRUE(s.Write(Library()));
  base::FileEnumerator e(dir_.GetPath().AppendASCII("Corvid"), false, base::FileEnumerator::FILES);
  int files = 0;
  for (base::FilePath p = e.Next(); !p.empty(); p = e.Next()) ++files;
  EXPECT_EQ(files, 1);
}

TEST_F(LayoutStorageTest, RefusesOversizeAndImplausibleWrites) {
  LayoutStorage s(dir_.GetPath());
  EXPECT_FALSE(s.Write(std::string(LayoutStorage::kMaxBytes + 1, 'x')));
  EXPECT_FALSE(s.Write("{}"));
  EXPECT_FALSE(s.Write("not json"));
  EXPECT_FALSE(s.Read());
}

TEST_F(LayoutStorageTest, CorruptBackupRotatesThree) {
  LayoutStorage s(dir_.GetPath());
  for (int i = 0; i < 5; ++i) s.BackupCorrupt("corrupt-" + std::to_string(i));
  std::string out;
  const base::FilePath d = dir_.GetPath().AppendASCII("Corvid");
  ASSERT_TRUE(base::ReadFileToString(d.AppendASCII("layout.corrupt.1.json"), &out));
  EXPECT_EQ(out, "corrupt-4");
  ASSERT_TRUE(base::ReadFileToString(d.AppendASCII("layout.corrupt.3.json"), &out));
  EXPECT_EQ(out, "corrupt-2");
  EXPECT_FALSE(base::PathExists(d.AppendASCII("layout.corrupt.4.json")));
}

}  // namespace
}  // namespace corvid
