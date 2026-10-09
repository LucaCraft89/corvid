#!/usr/bin/env bash
# Runs the Phase 1 acceptance checks. Needs a built browser: export CORVID_BIN (and CORVID_DIR for 01b).
# Exit codes per check: 0 pass, 77 skipped, anything else fail. A SKIP is reported as SKIP and is NOT a pass:
# the script exits 1 if any check failed, and exits 2 if nothing failed but some were skipped (unless --allow-skip).
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
allow_skip=0; [[ "${1:-}" == "--allow-skip" ]] && allow_skip=1
checks=(01-no-phone-home.mjs 01b-binary-host-grep.sh 02-no-stock-screens.mjs 03-layout.mjs 04-modules.mjs 05-theme.sh 06-extensions.mjs 07-ubo.mjs 08-newtab.mjs 09-compat.mjs 10-install.sh 11-hw-accel.mjs 12-webrtc.mjs)
pass=0; fail=0; skip=0
for c in "${checks[@]}"; do
  case "$c" in *.mjs) cmd=(node "$here/$c") ;; *) cmd=(bash "$here/$c") ;; esac
  out="$("${cmd[@]}" 2>&1)"; rc=$?
  if   [[ $rc -eq 0  ]]; then status=PASS; pass=$((pass+1))
  elif [[ $rc -eq 77 ]]; then status=SKIP; skip=$((skip+1))
  else status=FAIL; fail=$((fail+1)); fi
  printf '%-4s %s\n' "$status" "$c"
  [[ $status != PASS ]] && printf '%s\n' "$out" | sed 's/^/       /' | tail -n 8
done
echo "pass=$pass fail=$fail skip=$skip"
[[ $fail -gt 0 ]] && exit 1
[[ $skip -gt 0 && $allow_skip -eq 0 ]] && exit 2
exit 0
