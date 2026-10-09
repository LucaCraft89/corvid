#!/usr/bin/env bash
# Spec test 2: each net error class renders summary + detail. Local fixtures only (no internet).
# UNVERIFIED until a Corvid build exists. Fixture server: net-fixtures.py (below) provides refused/timeout/redirect-loop/TLS cases.
source "$(dirname "$0")/lib.sh"; need_browser
FIX="$ROOT/tests/acceptance/phase-2/net-fixtures.py"
python3 -I "$FIX" & FPID=$!; trap 'kill $FPID 2>/dev/null; cleanup' EXIT; sleep 1
launch --host-resolver-rules="MAP nxdomain.test ~NOTFOUND, MAP * 127.0.0.1"
declare -A CASES=(
  [dns]="http://nxdomain.test:8080/|ERR_NAME_NOT_RESOLVED"
  [refused]="http://127.0.0.1:1/|ERR_CONNECTION_REFUSED"
  [timeout]="http://127.0.0.1:8081/hang|ERR_TIMED_OUT"
  [redirect]="http://127.0.0.1:8080/loop|ERR_TOO_MANY_REDIRECTS"
  [tls-expired]="https://127.0.0.1:8443/expired|ERR_CERT_DATE_INVALID"
  [tls-selfsigned]="https://127.0.0.1:8443/self|ERR_CERT_AUTHORITY_INVALID"
  [tls-hostname]="https://127.0.0.1:8443/hostname|ERR_CERT_COMMON_NAME_INVALID")
FAIL=0
for k in "${!CASES[@]}"; do
  URL="${CASES[$k]%%|*}"; ERR="${CASES[$k]##*|}"
  HTML="$(curl -fs -X PUT "http://127.0.0.1:$PORT/json/new?$URL" >/dev/null; sleep 4; curl -fs "http://127.0.0.1:$PORT/corvid-dev/error-page-text" || true)"
  for needle in "$ERR" "Error code" "Timings"; do
    grep -q "$needle" <<<"$HTML" || { echo "FAIL[$k]: missing '$needle'"; FAIL=1; }
  done
  [[ "$k" == tls-* ]] && { grep -q "Certificate chain" <<<"$HTML" || { echo "FAIL[$k]: no cert chain"; FAIL=1; }; }
  [[ "$k" == dns ]] && { grep -q "Resolver" <<<"$HTML" || { echo "FAIL[dns]: no resolver"; FAIL=1; }; }
done
[[ $FAIL == 0 ]] && echo "PASS net errors" || exit 1
