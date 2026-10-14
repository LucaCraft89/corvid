// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// UNBUILT / UNRUN.
#include "corvid/diagnostics/diagnostics_service.h"

#include "base/functional/callback_helpers.h"
#include "base/run_loop.h"
#include "base/test/bind.h"
#include "base/test/task_environment.h"
#include "testing/gtest/include/gtest/gtest.h"

namespace corvid::diagnostics {

TEST(CorvidDiagnosticsServiceTest, KindAndSeverityRoundtrip) {
  mojom::Kind k;
  EXPECT_TRUE(KindFromString("net_error", &k));
  EXPECT_EQ(k, mojom::Kind::kNetError);
  EXPECT_EQ(KindToString(mojom::Kind::kServiceWorker), "service_worker");
  mojom::Severity s;
  EXPECT_FALSE(SeverityFromString("loud", &s));
  EXPECT_TRUE(SeverityFromString("fatal", &s));
}

TEST(CorvidDiagnosticsServiceTest, QueryFiltersNewestFirstWithLimit) {
  base::test::TaskEnvironment env;
  EventBus bus;
  DiagnosticsService svc(&bus);
  for (int i = 0; i < 5; i++)
    bus.Emit({.kind = i % 2 ? "hang" : "console", .severity = i % 2 ? "error" : "info", .source = "renderer",
              .tab_id = i, .data = {}});
  auto f = mojom::Filter::New();
  f->kinds = {mojom::Kind::kHang};
  f->min_severity = mojom::Severity::kDebug;
  f->tab_id = -1;
  f->limit = 1;
  size_t n = 99;
  uint64_t first_id = 0;
  svc.Query(std::move(f), base::BindLambdaForTesting([&](std::vector<mojom::EventPtr> events) {
              n = events.size();
              if (!events.empty()) first_id = events[0]->id;
            }));
  base::RunLoop().RunUntilIdle();
  EXPECT_EQ(n, 1u);
  EXPECT_EQ(first_id, 4u);  // ids 2 and 4 are hangs; newest first
}

TEST(CorvidDiagnosticsServiceTest, RetentionValidationAndClear) {
  base::test::TaskEnvironment env;
  EventBus bus;
  DiagnosticsService svc(&bus);
  bool ok = true;
  svc.SetRetention(mojom::RetentionConfig::New(0, 10, 1000), base::BindLambdaForTesting([&](bool r) { ok = r; }));
  EXPECT_FALSE(ok);
  svc.SetRetention(mojom::RetentionConfig::New(1 << 20, 10, 1000), base::BindLambdaForTesting([&](bool r) { ok = r; }));
  EXPECT_TRUE(ok);
  bus.Emit({.kind = "console", .severity = "info", .source = "x", .tab_id = -1, .data = {}});
  svc.Clear(base::DoNothing());
  EXPECT_TRUE(bus.Snapshot().empty());
}

}  // namespace corvid::diagnostics
