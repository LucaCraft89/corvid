#!/usr/bin/env bash
# Runs the locally runnable Phase 4 acceptance tests (spec items 1-7, single-machine simulation).
# Real Linux+Windows client convergence is NOT covered here (UNVERIFIED).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
echo "== server vet/build =="; (cd "$root/server/sync" && go vet ./... && go build ./...)
echo "== client vet =="; (cd "$root/src-overlay/corvid/sync" && go vet ./...)
echo "== acceptance (race detector on) =="; (cd "$here" && go test -count=1 -race -v ./... )
echo "== native fuzz 30s =="; (cd "$here" && go test -run '^$' -fuzz FuzzAPI -fuzztime "${FUZZTIME:-30s}" ./...)
echo "== UI page =="; (cd "$root/ui/pages/sync" && npm ci --silent 2>/dev/null || npm install --silent; npm test)
