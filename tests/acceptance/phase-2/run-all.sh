#!/usr/bin/env bash
# Runs every Phase 2 check that can run, prints PASS / FAIL / UNVERIFIED per check. Exit 1 only on FAIL.
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"; D="$ROOT/tests/acceptance/phase-2"; RC=0
row() { printf '%-44s %s\n' "$1" "$2"; }
run() { local name="$1"; shift; if "$@" >/tmp/p2.$$.log 2>&1; then row "$name" PASS; else local c=$?; if [[ $c == 77 ]]; then row "$name" "UNVERIFIED ($(tail -1 /tmp/p2.$$.log))"; else row "$name" FAIL; tail -20 /tmp/p2.$$.log; RC=1; fi; fi; }
for pkg in ui/diagnostics ui/pages/diagnostics ui/pages/passkeys ui/devtools src-overlay/corvid/passkeys/reference; do
  run "unit: $pkg" bash -c "cd '$ROOT/$pkg' && npm test --silent"
done
run "typecheck: all TS" bash -c "cd '$D' && npx tsc -p tsconfig.json"
run "unit: C++ ring buffer (asan+ubsan)" bash -c "cd '$ROOT/src-overlay/corvid/diagnostics' && g++ -std=c++17 -Wall -Wextra -fsanitize=address,undefined ring_buffer.cc ring_buffer_unittest.cc -o /tmp/p2rb.$$ && /tmp/p2rb.$$"
for t in 01-hang 02-net-errors 03-crash-local 04-overhead 05-devtools 06-export 07-passkeys; do run "acceptance $t" bash "$D/$t.sh"; done
rm -f /tmp/p2.$$.log /tmp/p2rb.$$; exit $RC
