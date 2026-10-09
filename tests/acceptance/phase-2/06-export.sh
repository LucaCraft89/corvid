#!/usr/bin/env bash
# Spec test 6: export bundle == preview; redaction removes URLs.
# Core logic is verified by ui/diagnostics unit tests (exporter.test: bundle==preview, redaction).
# This script runs those REAL tests, then (if a build exists) repeats end to end through the browser.
source "$(dirname "$0")/lib.sh"
( cd "$ROOT/ui/diagnostics" && npm test --silent -- --test-name-pattern='export|redact' ) || { echo "FAIL: exporter unit tests"; exit 1; }
echo "PASS (unit level): bundle==preview, redaction removes URLs"
[[ -n "${CORVID_BIN:-}" && -x "${CORVID_BIN:-}" ]] || unverified "end-to-end export through corvid://diagnostics needs a built Corvid (unit-level part passed)"
launch
curl -fs -X POST "http://127.0.0.1:$PORT/corvid-dev/export?redact=1" -o "$PROFILE/e.zip" || { echo "FAIL: export call"; exit 1; }
python3 -I - "$PROFILE/e.zip" <<'PY' || exit 1
import sys, zipfile, json, hashlib, re
z = zipfile.ZipFile(sys.argv[1]); m = json.loads(z.read("manifest.json"))
listed = {f["name"] for f in m["files"]} | {"manifest.json"}
assert set(z.namelist()) == listed, "bundle != manifest"
for f in m["files"]:
    assert hashlib.sha256(z.read(f["name"])).hexdigest() == f["sha256"], f["name"]
assert not re.search(rb"[a-z][a-z0-9+.-]+://", z.read("events.jsonl")), "URL leaked with redaction on"
print("PASS e2e export")
PY
