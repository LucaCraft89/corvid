#!/usr/bin/env bash
# Compile and run the PURE-LOGIC subset of the overlay C++ unit tests against tiny stand-in headers
# (tests/overlay-standins/), with g++ or clang++ and no Chromium checkout.
#
# What this proves: the logic in appearance_snapshot, config_file_reader, linux_appearance_source, module_permissions and
# ntp_override is internally consistent and its tests pass, and the files are valid C++20 under -Wall -Wextra -Werror.
# What it does NOT prove: that anything compiles against real Chromium headers (base::, GURL, NativeTheme, Mojo), nor
# GN wiring. Everything else in src-overlay stays UNVERIFIED until scripts/overlay-tests.sh runs on the builder.
# Exit: 0 pass, 77 no C++ compiler, 1 failure.
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cxx="${CXX:-$(command -v g++ || command -v clang++ || true)}"
[ -n "$cxx" ] || { echo "SKIP: no C++ compiler" >&2; exit 77; }
o="$root/src-overlay/corvid"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
srcs=(
  "$o/theme/appearance_snapshot.cc" "$o/theme/config_file_reader.cc" "$o/theme/linux_appearance_source.cc"
  "$o/modules/module_permissions.cc" "$o/extensions/ntp_override.cc"
  "$o/theme/theme_unittest.cc" "$o/theme/linux_appearance_source_unittest.cc"
  "$o/modules/module_permissions_unittest.cc" "$o/extensions/ntp_override_unittest.cc"
  "$root/tests/overlay-standins/main.cc"
)
"$cxx" -std=c++20 -Wall -Wextra -Werror -I"$root/tests/overlay-standins" -I"$root/src-overlay" "${srcs[@]}" -o "$work/selfcheck" || { echo "FAIL: stand-in compile" >&2; exit 1; }
"$work/selfcheck"
