// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT / UNRUN. gtest, built into //corvid:corvid_phase1_unittests via BUILD.gn `unit_tests`.
#include "corvid/diagnostics/event_bus.h"

#include "base/json/json_reader.h"
#include "base/run_loop.h"
<<<<<<< HEAD
=======
#include "base/test/bind.h"
>>>>>>> origin/claude/busy-rubin-t8bloc
#include "base/test/task_environment.h"
#include "corvid/diagnostics/stack_sampler.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace corvid::diagnostics {

namespace {

class Recorder : public EventBus::Observer {
 public:
  void OnEvent(const Event& e) override { seen.push_back(e); }
  std::vector<Event> seen;
};

}  // namespace

TEST(CorvidEventBusTest, EmitStoresAndAmendUpdatesPayload) {
  base::test::TaskEnvironment env;
  EventBus bus;
<<<<<<< HEAD
  base::Value::Dict d;
=======
  base::DictValue d;
>>>>>>> origin/claude/busy-rubin-t8bloc
  d.Set("stackCaptured", false);
  uint64_t id = bus.Emit({.kind = "hang", .severity = "error", .source = "renderer", .tab_id = 3, .data = std::move(d)});
  ASSERT_NE(id, 0u);

<<<<<<< HEAD
  EXPECT_TRUE(bus.Amend(id, [](base::Value::Dict& dict) { dict.Set("stackCaptured", true); }));
=======
  EXPECT_TRUE(bus.Amend(id, [](base::DictValue& dict) { dict.Set("stackCaptured", true); }));
>>>>>>> origin/claude/busy-rubin-t8bloc
  std::vector<Event> events = bus.Snapshot();
  ASSERT_EQ(events.size(), 1u);
  EXPECT_EQ(events[0].id, id);
  EXPECT_EQ(events[0].kind, "hang");
  EXPECT_EQ(events[0].tab_id, 3);
<<<<<<< HEAD
  std::optional<base::Value> parsed = base::JSONReader::Read(events[0].data_json);
  ASSERT_TRUE(parsed && parsed->is_dict());
  EXPECT_EQ(parsed->GetDict().FindBool("stackCaptured"), true);
  EXPECT_FALSE(bus.Amend(id + 100, [](base::Value::Dict&) {}));
=======
  std::optional<base::Value> parsed = base::JSONReader::Read(events[0].data_json, base::JSON_PARSE_RFC);
  ASSERT_TRUE(parsed && parsed->is_dict());
  EXPECT_EQ(parsed->GetDict().FindBool("stackCaptured"), true);
  EXPECT_FALSE(bus.Amend(id + 100, [](base::DictValue&) {}));
>>>>>>> origin/claude/busy-rubin-t8bloc
}

TEST(CorvidEventBusTest, ObserverSeesEmitAndAmend) {
  base::test::TaskEnvironment env;
  EventBus bus;
  Recorder r;
  bus.AddObserver(&r);
  uint64_t id = bus.Emit({.kind = "console", .severity = "info", .source = "renderer", .tab_id = -1, .data = {}});
<<<<<<< HEAD
  bus.Amend(id, [](base::Value::Dict& d) { d.Set("x", 1); });
=======
  bus.Amend(id, [](base::DictValue& d) { d.Set("x", 1); });
>>>>>>> origin/claude/busy-rubin-t8bloc
  base::RunLoop().RunUntilIdle();
  EXPECT_EQ(r.seen.size(), 2u);
  bus.RemoveObserver(&r);
}

TEST(CorvidStackSamplerTest, NoBackendReportsEmptyAsync) {
  base::test::TaskEnvironment env;
  StackSampler::SetBackend(StackSampler::Backend());
  bool called = false;
  size_t n = 99;
  StackSampler::CaptureMainThread(nullptr, base::BindLambdaForTesting([&](std::vector<StackFrame> f) {
                                    called = true;
                                    n = f.size();
                                  }));
  EXPECT_FALSE(called);  // never synchronous
  base::RunLoop().RunUntilIdle();
  EXPECT_TRUE(called);
  EXPECT_EQ(n, 0u);
}

TEST(CorvidStackSamplerTest, FramesToValueOmitsEmptyFields) {
  std::vector<StackFrame> frames(1);
  frames[0].fn = "Foo";
  frames[0].line = 12;
<<<<<<< HEAD
  base::Value::List l = FramesToValue(frames);
  ASSERT_EQ(l.size(), 1u);
  const base::Value::Dict& d = l[0].GetDict();
=======
  base::ListValue l = FramesToValue(frames);
  ASSERT_EQ(l.size(), 1u);
  const base::DictValue& d = l[0].GetDict();
>>>>>>> origin/claude/busy-rubin-t8bloc
  EXPECT_EQ(*d.FindString("fn"), "Foo");
  EXPECT_EQ(d.FindInt("line"), 12);
  EXPECT_EQ(d.Find("module"), nullptr);
}

}  // namespace corvid::diagnostics
