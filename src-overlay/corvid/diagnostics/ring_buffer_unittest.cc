// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// Standalone test (no gtest needed): g++ -std=c++17 ring_buffer.cc ring_buffer_unittest.cc && ./a.out
// In the Chromium tree it is built with CORVID_GTEST defined (BUILD.gn): same checks, run from one gtest TEST.
#include <cstdio>
#include <cstdlib>

#include "ring_buffer.h"
#if defined(CORVID_GTEST)
#include "testing/gtest/include/gtest/gtest.h"
#endif

using namespace corvid::diagnostics;
static int failures = 0;
#define CHECK(c) do { if (!(c)) { std::printf("FAIL %s:%d %s\n", __FILE__, __LINE__, #c); failures++; } } while (0)

static Event Ev(int64_t ts, std::string data = "{}") {
  Event e; e.ts_ms = ts; e.source = "renderer"; e.severity = "error"; e.kind = "console"; e.data_json = std::move(data);
  return e;
}

static void RunAll() {
  int64_t now = 1000;
  {  // count cap
    Retention r; r.max_events = 3;
    RingBuffer rb(r, [&] { return now; });
    for (int i = 0; i < 5; i++) rb.Add(Ev(1000, std::to_string(i)));
    auto s = rb.Snapshot();
    CHECK(s.size() == 3); CHECK(s.front().data_json == "2"); CHECK(s.back().id == 5);
  }
  {  // byte cap is never exceeded
    Retention r; r.max_bytes = 4096;
    RingBuffer rb(r, [&] { return now; });
    for (int i = 0; i < 1000; i++) rb.Add(Ev(1000, std::string(50, 'x')));
    CHECK(rb.byte_size() <= 4096); CHECK(rb.size() > 0);
  }
  {  // age cap
    Retention r; r.max_age_ms = 500;
    int64_t t = 10000;
    RingBuffer rb(r, [&] { return t; });
    rb.Add(Ev(10000, "old")); t = 11000; rb.Add(Ev(11000, "new"));
    CHECK(rb.size() == 1); CHECK(rb.Snapshot()[0].data_json == "new");
  }
  {  // shrinking retention evicts immediately
    RingBuffer rb({}, [&] { return now; });
    for (int i = 0; i < 10; i++) rb.Add(Ev(1000));
    Retention r; r.max_events = 2; rb.SetRetention(r);
    CHECK(rb.size() == 2);
  }
  {  // redaction
    std::string s = RedactString("GET https://a.example/x?y=1 at /home/alice/.cfg from 192.168.0.5 ok", true, true, true);
    CHECK(s.find("a.example") == std::string::npos); CHECK(s.find("alice") == std::string::npos);
    CHECK(s.find("192.168") == std::string::npos); CHECK(s.find("[url]") != std::string::npos);
    CHECK(s.find("[path]") != std::string::npos); CHECK(s.find("[ip]") != std::string::npos);
    std::string only_urls = RedactString("https://x.example/ and /home/a/b", true, false, false);
    CHECK(only_urls.find("/home/a/b") != std::string::npos);
    CHECK(only_urls.find("x.example") == std::string::npos);
  }
}

#if defined(CORVID_GTEST)
TEST(DiagnosticsRingBufferTest, CapsAndRedaction) {
  RunAll();
  EXPECT_EQ(failures, 0);
}
#else
int main() {
  RunAll();
  std::printf(failures ? "FAILED (%d)\n" : "OK\n", failures);
  return failures ? 1 : 0;
}
#endif
