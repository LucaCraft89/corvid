#!/usr/bin/env bash
# Spec test 4: diagnostics adds < 1% CPU at idle with 50 tabs. UNVERIFIED (needs build; cannot be measured here).
# Method: A/B on the same binary, --corvid-diagnostics=on|off, 50 about:blank tabs, 120 s idle, CPU from
# /proc/<pid>/stat utime+stime summed over browser + renderer + network service; 3 runs each, median.
source "$(dirname "$0")/lib.sh"; need_browser
measure() {  # $1 = on|off ; prints CPU ticks consumed during the window
  launch --corvid-diagnostics="$1"
  for i in $(seq 1 50); do curl -fs -X PUT "http://127.0.0.1:$PORT/json/new?about:blank" >/dev/null; done
  sleep 20
  sum() { for p in $(pgrep -P "$BPID" -a >/dev/null; pgrep -f -- "--user-data-dir=$PROFILE"); do awk '{print $14+$15}' /proc/$p/stat 2>/dev/null; done | paste -sd+ | bc; }
  A=$(sum); sleep 120; B=$(sum); cleanup; echo $((B-A))
}
declare -a ON OFF
for _ in 1 2 3; do ON+=("$(measure on)"); OFF+=("$(measure off)"); done
med() { printf '%s\n' "$@" | sort -n | sed -n 2p; }
ON_M=$(med "${ON[@]}"); OFF_M=$(med "${OFF[@]}"); HZ=$(getconf CLK_TCK)
DELTA_PCT=$(echo "scale=3; ($ON_M - $OFF_M) / ($HZ * 120) * 100" | bc)
echo "on=$ON_M off=$OFF_M ticks; delta=${DELTA_PCT}% of one core"
(( $(echo "$DELTA_PCT < 1" | bc) )) && echo "PASS overhead ${DELTA_PCT}%" || { echo "FAIL overhead ${DELTA_PCT}%"; exit 1; }
