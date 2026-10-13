// Copyright 2026 The Corvid Authors. BSD-3-Clause.
// Byte/count/age capped event ring for the browser process. Portable C++17 (std only) so it
// can be unit-tested standalone; Chromium glue wraps it with base::Lock + a file-backed sink.
// Local only: no networking APIs are used anywhere in this directory.
#ifndef CORVID_DIAGNOSTICS_RING_BUFFER_H_
#define CORVID_DIAGNOSTICS_RING_BUFFER_H_

#include <cstdint>
#include <deque>
#include <functional>
#include <string>
#include <vector>

namespace corvid::diagnostics {

struct Retention {
  // Placeholder defaults pending user decision (docs/notes/phase-2-questions.md Q3).
  uint64_t max_bytes = 32ull * 1024 * 1024;
  size_t max_events = 50000;
  int64_t max_age_ms = 7ll * 24 * 3600 * 1000;
};

struct Event {
  Event();
  Event(const Event&);
  Event(Event&&) noexcept;
  Event& operator=(const Event&);
  Event& operator=(Event&&) noexcept;
  ~Event();

  uint64_t id = 0;
  int64_t ts_ms = 0;
  int tab_id = -1;  // -1 = none
  std::string source;
  std::string severity;
  std::string kind;
  std::string data_json;  // already-serialized JSON object; schema in diagnostics.mojom / types.ts
};

class RingBuffer {
 public:
  explicit RingBuffer(Retention r = {}, std::function<int64_t()> now_ms = nullptr);
  ~RingBuffer();
  uint64_t Add(Event e);  // returns assigned id
  // Applies fn to the event with this id if still retained; byte accounting is re-done. False if evicted.
  bool Update(uint64_t id, const std::function<void(Event&)>& fn);
  std::vector<Event> Snapshot() const;
  size_t size() const { return events_.size(); }
  uint64_t byte_size() const { return bytes_; }
  void Clear();
  void SetRetention(Retention r);

 private:
  static uint64_t Cost(const Event& e);
  void Evict();
  Retention retention_;
  std::function<int64_t()> now_ms_;
  std::deque<Event> events_;
  uint64_t bytes_ = 0;
  uint64_t next_id_ = 1;
};

// Redacts URLs (scheme://...), POSIX home-ish paths and IPv4 literals in free text.
// Mirrors ui/diagnostics/redact.ts (TS is the reference for structured-field handling).
std::string RedactString(const std::string& in, bool urls, bool paths, bool ips);

}  // namespace corvid::diagnostics

#endif  // CORVID_DIAGNOSTICS_RING_BUFFER_H_
