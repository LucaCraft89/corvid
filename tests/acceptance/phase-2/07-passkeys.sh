#!/usr/bin/env bash
# Spec test 7. Part A (REAL, runs here): vault tamper rejection and no-plaintext-at-rest, via the reference impl.
# Part B (UNVERIFIED): webauthn.io + two major sites, conditional UI, hardware key, hybrid phone flow.
# Part B needs a built Corvid, network, and physical devices; it is a manual checklist (passkeys-manual.md).
source "$(dirname "$0")/lib.sh"
( cd "$ROOT/src-overlay/corvid/passkeys/reference" && npm test --silent -- --test-name-pattern='tamper|plaintext|rollback|downgrade|rejected|ciphertext' ) \
  || { echo "FAIL: vault negative tests"; exit 1; }
echo "PASS (part A): tampered vault rejected; vault file has no plaintext key material"
unverified "part B (real sites, hardware key, hybrid) - see tests/acceptance/phase-2/passkeys-manual.md"
