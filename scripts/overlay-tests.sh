#!/usr/bin/env bash
# Build ONLY the Corvid overlay GN targets (src-overlay/corvid) in a Chromium checkout and run their gtest unit tests.
#
# Usage: scripts/overlay-tests.sh [--overlay-only] [--no-apply] [--out DIR] [--report-dir DIR]
#   default        apply-patches.sh (reset to the pinned tag, apply the series, copy the overlay), gn gen, build, test
#   --overlay-only keep the tree as it is and only copy src-overlay/ over it (fast re-run after editing overlay files)
#   --no-apply     do not touch the tree at all (it must already contain the overlay)
# Env: CORVID_SRC (default ~/chromium/src), DEPOT_TOOLS (default ~/depot_tools), CORVID_JOBS, CORVID_OVERLAY_OUT.
#
# Exit codes: 0 all built and all tests passed; 77 SKIPPED (no Chromium checkout / no gn: says nothing about the code);
#             1 something failed to build or a test failed. Never prints "PASS" for a skip.
# Output: <report-dir>/summary.tsv (target<TAB>step<TAB>PASS|FAIL), per-step logs, gtest.json, and a markdown summary.
set -uo pipefail
# shellcheck source=scripts/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

MODE=full OUT_NAME="${CORVID_OVERLAY_OUT:-GnDebug}" REPORT_DIR="$CORVID_ROOT/reports/overlay"
while [ $# -gt 0 ]; do
  case "$1" in
    --overlay-only) MODE=overlay ;;
    --no-apply) MODE=none ;;
    --out) OUT_NAME="$2"; shift ;;
    --report-dir) REPORT_DIR="$2"; shift ;;
    *) die "unknown argument: $1" ;;
  esac
  shift
done

mkdir -p "$REPORT_DIR"
: > "$REPORT_DIR/summary.tsv"
note() { printf '%s\t%s\t%s\n' "$1" "$2" "$3" | tee -a "$REPORT_DIR/summary.tsv" >&2; }

DEPOT_TOOLS="${DEPOT_TOOLS:-$HOME/depot_tools}"
export PATH="$DEPOT_TOOLS:$PATH"
if [ ! -d "$CORVID_SRC/.git" ]; then
  log "SKIP: no Chromium checkout at CORVID_SRC=$CORVID_SRC"
  note all prerequisites SKIP-no-checkout; exit 77
fi
if ! command -v gn >/dev/null 2>&1 || ! command -v autoninja >/dev/null 2>&1; then
  log "SKIP: gn/autoninja not on PATH (DEPOT_TOOLS=$DEPOT_TOOLS)"
  note all prerequisites SKIP-no-gn; exit 77
fi

case "$MODE" in
  full) "$CORVID_ROOT/scripts/apply-patches.sh" >"$REPORT_DIR/apply.log" 2>&1 && note all apply PASS || { note all apply FAIL; tail -n 30 "$REPORT_DIR/apply.log" >&2; exit 1; } ;;
  overlay)
    # Overlay-only refresh: no collision check against patched files, so use it only on a tree that already passed `full` once.
    (cd "$CORVID_ROOT/src-overlay" && tar --exclude='.gitkeep' -cf - .) | tar -xf - -C "$CORVID_SRC" && "$CORVID_ROOT/scripts/build-ui.sh" && note all overlay-copy PASS || { note all overlay-copy FAIL; exit 1; } ;;
  none) ;;
esac

cd "$CORVID_SRC" || exit 1
OUT="out/$OUT_NAME"
# Same args as the product build (build/args/linux-debug.gn) so objects are shared with out/GnDebug via sccache, plus the
# hook that makes //corvid reachable: gn only loads BUILD.gn files that something references, and //BUILD.gn exposes
# `root_extra_deps` for exactly this (no upstream file is patched).
mkdir -p "$OUT"
{
  sed 's/#.*//' "$CORVID_ROOT/build/args/linux-debug.gn" | grep -v '^[[:space:]]*$'
  command -v sccache >/dev/null 2>&1 && echo 'cc_wrapper = "sccache"'
  echo 'root_extra_deps = [ "//corvid:corvid_phase1_unittests" ]'
} > "$OUT/args.gn"
if gn gen "$OUT" >"$REPORT_DIR/gn-gen.log" 2>&1; then note all gn-gen PASS; else
  note all gn-gen FAIL; tail -n 40 "$REPORT_DIR/gn-gen.log" >&2; exit 1
fi

JOBS=(); [ -z "${CORVID_JOBS:-}" ] || JOBS=(-j "$CORVID_JOBS")
# Each library target is built alone first so one compile error does not hide the others, then the test binary.
TARGETS=(
  //corvid:base_compat
  //corvid/chrome_shell:layout_json //corvid/chrome_shell:layout_storage //corvid/chrome_shell:mojom
  //corvid/modules:module_permissions //corvid/modules:module_manifest //corvid/modules:module_host_service
  //corvid/extensions:extensions //corvid/diagnostics:mojom //corvid/diagnostics:ring_buffer
  //corvid/theme:appearance_snapshot //corvid/theme:config_file_reader //corvid/theme:linux_appearance_source
  //corvid/theme:native_theme_appearance_observer //corvid/theme:mojom
  //corvid/webui:stock_page_policy //corvid/webui:stock_page_rewriter
)
failed=0
for t in "${TARGETS[@]}"; do
  log="$REPORT_DIR/build-$(printf '%s' "$t" | tr '/:' '__').log"
  if autoninja "${JOBS[@]}" -k 0 -C "$OUT" "${t#//}" >"$log" 2>&1; then note "$t" build PASS; else note "$t" build FAIL; failed=1; fi
done

# GN include/dep hygiene for the overlay (non-fatal: reported, but a failure is still a FAIL line).
if gn check "$OUT" "//corvid/*" >"$REPORT_DIR/gn-check.log" 2>&1; then note all gn-check PASS; else note all gn-check FAIL; failed=1; fi

TEST_BIN="$OUT/corvid_phase1_unittests"
if autoninja "${JOBS[@]}" -k 0 -C "$OUT" corvid:corvid_phase1_unittests >"$REPORT_DIR/build-tests.log" 2>&1; then
  note corvid_phase1_unittests build PASS
  if "$TEST_BIN" --gtest_output="json:$REPORT_DIR/gtest.json" >"$REPORT_DIR/gtest.log" 2>&1; then note corvid_phase1_unittests run PASS
  else note corvid_phase1_unittests run FAIL; failed=1; fi
else
  note corvid_phase1_unittests build FAIL; failed=1
fi

{
  echo "# Overlay build/test summary"
  echo
  echo "Chromium: $(pinned_version) ($(src_git rev-parse --short HEAD 2>/dev/null || echo unknown)); Corvid: $(git -C "$CORVID_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo
  echo '| target | step | result |'; echo '|---|---|---|'
  awk -F'\t' '{printf "| %s | %s | %s |\n", $1, $2, $3}' "$REPORT_DIR/summary.tsv"
  echo
  for f in "$REPORT_DIR"/build-*.log; do
    if grep -qE 'FAILED:|error:' "$f" 2>/dev/null; then echo "### first errors in $(basename "$f")"; echo '```'; grep -E 'FAILED:|error:' "$f" | head -n 8; echo '```'; fi
  done
  [ ! -f "$REPORT_DIR/gtest.log" ] || { echo '### gtest tail'; echo '```'; tail -n 15 "$REPORT_DIR/gtest.log"; echo '```'; }
} > "$REPORT_DIR/summary.md"
cat "$REPORT_DIR/summary.md"
exit "$failed"
