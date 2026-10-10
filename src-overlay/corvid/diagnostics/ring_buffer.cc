// Copyright 2026 The Corvid Authors. BSD-3-Clause.
#include "ring_buffer.h"

#include <cctype>
#include <chrono>
#include <regex>

namespace corvid::diagnostics {

Event::Event() = default;
Event::Event(const Event&) = default;
Event::Event(Event&&) noexcept = default;
Event& Event::operator=(const Event&) = default;
Event& Event::operator=(Event&&) noexcept = default;
Event::~Event() = default;
RingBuffer::~RingBuffer() = default;

static int64_t SystemNowMs() {
  using namespace std::chrono;
  return duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
}

RingBuffer::RingBuffer(Retention r, std::function<int64_t()> now_ms)
    : retention_(r), now_ms_(now_ms ? std::move(now_ms) : SystemNowMs) {}

uint64_t RingBuffer::Cost(const Event& e) {
  return sizeof(Event) + e.source.size() + e.severity.size() + e.kind.size() + e.data_json.size();
}

uint64_t RingBuffer::Add(Event e) {
  e.id = next_id_++;
  bytes_ += Cost(e);
  uint64_t id = e.id;
  events_.push_back(std::move(e));
  Evict();
  return id;
}

void RingBuffer::Evict() {
  const int64_t cutoff = now_ms_() - retention_.max_age_ms;
  while (!events_.empty() && (bytes_ > retention_.max_bytes || events_.size() > retention_.max_events ||
                              events_.front().ts_ms < cutoff)) {
    bytes_ -= Cost(events_.front());
    events_.pop_front();
  }
}

std::vector<Event> RingBuffer::Snapshot() const { return {events_.begin(), events_.end()}; }
void RingBuffer::Clear() { events_.clear(); bytes_ = 0; }
void RingBuffer::SetRetention(Retention r) { retention_ = r; Evict(); }

std::string RedactString(const std::string& in, bool urls, bool paths, bool ips) {
  std::string r = in;
  if (urls) r = std::regex_replace(r, std::regex(R"([A-Za-z][A-Za-z0-9+.\-]{1,15}://[^\s"'<>)\]}]+)"), "[url]");
  if (paths) {
    r = std::regex_replace(r, std::regex(R"((^|[^\w:/])/(?:home|Users|root|tmp|var|opt|usr|mnt|media|run)/[^\s"'<>:)\]}]*)"),
                           "$1[path]");
    r = std::regex_replace(r, std::regex(R"([A-Za-z]:\\(?:[^\s"'<>:|?*\\]+\\?)+)"), "[path]");
  }
  if (ips) {
    r = std::regex_replace(
        r, std::regex(R"(\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b)"), "[ip]");
  }
  return r;
}

}  // namespace corvid::diagnostics
