// Compiled and tested against Chromium 155 in M2 (docs/notes/chromium-api-m2.md). Single place for base::Value API naming differences between Chromium versions.
// Written against Chromium `main` as of 2026-10 (base::DictValue / base::ListValue, checked by reading
// base/values.h and base/json/json_reader.h from the chromium/chromium mirror). For a pinned release that still
// uses base::Value::Dict / base::Value::List, change only the two aliases below.
#ifndef CORVID_BASE_COMPAT_H_
#define CORVID_BASE_COMPAT_H_

#include "base/values.h"

namespace corvid {
using Dict = base::DictValue;
using List = base::ListValue;
}  // namespace corvid

#endif  // CORVID_BASE_COMPAT_H_
