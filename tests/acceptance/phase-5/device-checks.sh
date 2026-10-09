#!/usr/bin/env bash
# UNVERIFIED stubs. Exit 77 = skipped (no device/build). Package id comes from branding/config.toml in the real run.
set -u
PKG="${CORVID_PKG:-org.corvid.browser}"   # placeholder
check="${1:-}"
if ! command -v adb >/dev/null 2>&1 || [ -z "$(adb devices 2>/dev/null | sed 1d | grep -w device)" ]; then
  echo "SKIP($check): no adb device. UNVERIFIED"; exit 77
fi
case "$check" in
  install)
    adb install -r "${APK:?set APK}" || exit 1
    adb shell am force-stop "$PKG"
    adb shell am start -W -n "$PKG/.Main" | tee /tmp/launch.txt   # TotalTime = cold start; Activity name is a placeholder
    sleep 10; adb shell dumpsys meminfo "$PKG" | grep -E "TOTAL PSS|TOTAL" | head -3 ;;
  dyncolor|layout|ext|foldable|idle-net)
    echo "TODO($check): not implemented; see README.md and docs/specs/phase-5.md"; exit 77 ;;
  *) echo "usage: $0 install|dyncolor|layout|ext|idle-net|foldable"; exit 2 ;;
esac
