#!/usr/bin/env bash
# Spec test 1: corvid://hang-test blocks a renderer 10 s; hang event with stack in hub within 5 s;
# freeze page shows detail + recovery options. UNVERIFIED until a Corvid build exists.
source "$(dirname "$0")/lib.sh"; need_browser; launch
# Open hang-test, record t0, poll the diagnostics query endpoint (dev-only JSON bridge) for a hang event.
WS_TAB="$(curl -fs -X PUT "http://127.0.0.1:$PORT/json/new?corvid://hang-test" | python3 -I -c 'import sys,json;print(json.load(sys.stdin)["id"])')"
T0=$(date +%s.%N); FOUND=""
for _ in $(seq 1 100); do
  OUT="$(curl -fs "http://127.0.0.1:$PORT/corvid-dev/diagnostics?kind=hang&tab=$WS_TAB" || true)"
  if python3 -I -c 'import sys,json;ev=json.loads(sys.stdin.read() or "[]");sys.exit(0 if any(e["data"].get("stackCaptured") and e["data"]["stack"] for e in ev) else 1)' <<<"$OUT"; then FOUND=1; break; fi
  sleep 0.1
done
ELAPSED=$(echo "$(date +%s.%N) - $T0" | bc)
[[ -n "$FOUND" ]] || { echo "FAIL: no hang event with stack"; exit 1; }
echo "$ELAPSED < 5 ?" ; (( $(echo "$ELAPSED < 5" | bc) )) || { echo "FAIL: hang event took ${ELAPSED}s"; exit 1; }
curl -fs "http://127.0.0.1:$PORT/corvid-dev/tab-dom?tab=$WS_TAB&selector=%5Bdata-corvid-freeze%5D" | grep -q 'recovery' || { echo "FAIL: freeze page lacks recovery options"; exit 1; }
echo "PASS hang within ${ELAPSED}s"
