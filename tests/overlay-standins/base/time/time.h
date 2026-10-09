// STAND-IN for base/time/time.h (only what ntp_override needs).
#pragma once
#include <cstdint>
namespace base {
class Time {
 public:
  static Time FromMillisecondsSinceUnixEpoch(int64_t ms) { Time t; t.ms_ = ms; return t; }
  bool operator>(const Time& o) const { return ms_ > o.ms_; }
 private:
  int64_t ms_ = 0;
};
}  // namespace base
