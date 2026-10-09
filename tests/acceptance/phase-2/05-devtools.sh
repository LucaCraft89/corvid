#!/usr/bin/env bash
# Spec test 5: DevTools verbose console, perf overlay on blocking page, freeze capture -> trace file.
# The panel LOGIC is covered by ui/devtools unit tests (run in run-all.sh). This script is the in-browser part.
# UNVERIFIED until a Corvid build exists.
source "$(dirname "$0")/lib.sh"; need_browser
launch
PAGE="file://$ROOT/tests/acceptance/phase-2/fixtures/devtools-page.html"
curl -fs -X PUT "http://127.0.0.1:$PORT/json/new?$PAGE" >/dev/null; sleep 3
CON="$(curl -fs "http://127.0.0.1:$PORT/corvid-dev/devtools-console-text")"
for lvl in VERBOSE INFO WARNING ERROR; do grep -q "$lvl" <<<"$CON" || { echo "FAIL: level $lvl missing"; exit 1; }; done
grep -q "at throwing (" <<<"$CON" || { echo "FAIL: no stack on thrown error"; exit 1; }
OV="$(curl -fs "http://127.0.0.1:$PORT/corvid-dev/perf-overlay-snapshot")"
python3 -I -c 'import sys,json;s=json.loads(sys.stdin.read());assert s["longTasks"]>=1 and s["totalBlockingMs"]>=100' <<<"$OV" || { echo "FAIL: overlay did not report long task"; exit 1; }
TRACE="$(curl -fs -X POST "http://127.0.0.1:$PORT/corvid-dev/freeze-capture" | python3 -I -c 'import sys,json;print(json.load(sys.stdin)["tracePath"])')"
[[ -s "$TRACE" ]] && python3 -I -c 'import json,sys;json.load(open(sys.argv[1]))' "$TRACE" && echo "PASS devtools" || { echo "FAIL: trace file missing/invalid"; exit 1; }
