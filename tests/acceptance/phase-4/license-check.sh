#!/usr/bin/env bash
# License gate for Phase 4 dependencies. Allowlist: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC.
# Anything else (or an undetectable license) FAILS the check and must be raised with the user (AGENTS.md rule 6).
# Go: google/go-licenses v2 alpha. npm: license-checker-rseidelsohn.
# Modules go-licenses cannot classify are listed in license-exceptions.txt after a human read their LICENSE.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
ALLOWED="${ALLOWED:-MIT,Apache-2.0,BSD-2-Clause,BSD-3-Clause,ISC}"
GOBIN="${GOBIN:-$(go env GOPATH)/bin}"
export GOBIN
if [ ! -x "$GOBIN/go-licenses" ]; then
  go install github.com/google/go-licenses/v2@v2.0.0-alpha.1 || exit 1
fi
ign="$(grep -v '^[[:space:]]*#' "$here/license-exceptions.txt" | grep . | paste -sd, -)"
# go-licenses must see the same GOROOT as the toolchain that builds the modules (go.mod pins go 1.26).
want="$(sed -n "s/^go //p" "$root/server/sync/go.mod")"
tc="$(go env GOMODCACHE)/golang.org/toolchain@v0.0.1-go${want}.$(go env GOOS)-$(go env GOARCH)"
[ -d "$tc" ] || tc="$(go env GOROOT)"
fail=0
check_go() {
  echo "== go-licenses: $1 =="
  out="$(cd "$root/$1" && PATH="$tc/bin:$PATH" GOROOT="$tc" GOTOOLCHAIN=local "$GOBIN/go-licenses" check "$2" --allowed_licenses="$ALLOWED" ${ign:+--ignore "$ign"} 2>&1)"
  rc=$?
  echo "$out" | grep -v -E "does not have module info|non-Go code|^/.*\.s$" | tail -15
  [ $rc -eq 0 ] || fail=1
  echo "exit=$rc"
}
check_go server/sync ./cmd/corvid-sync
check_go src-overlay/corvid/sync ./
echo "== npm license-checker: ui/pages/sync (prod + dev deps) =="
(cd "$root/ui/pages/sync" && npm ci --silent >/dev/null 2>&1; npx --yes license-checker-rseidelsohn@4.4.2 --excludePrivatePackages \
  --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;MIT-0;0BSD;BlueOak-1.0.0;CC0-1.0;Python-2.0" --summary) || fail=1
echo "license check: $([ $fail -eq 0 ] && echo PASS || echo FAIL)"
exit $fail
