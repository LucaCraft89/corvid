#!/usr/bin/env bash
# Static lint of all Phase 0 shell/python: bash -n, shellcheck, python compile.
set -euo pipefail
# shellcheck source=tests/acceptance/phase-0/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
command -v shellcheck >/dev/null 2>&1 || skip "shellcheck not installed"

mapfile -t files < <(find "$T_ROOT/scripts" "$T_ROOT/tests/acceptance" -name '*.sh' | sort)
for f in "${files[@]}"; do bash -n "$f" || fail "syntax error in $f"; done
shellcheck -x -S style "${files[@]}" || fail "shellcheck reported issues"
python3 -I -m py_compile "$T_ROOT/scripts/render-branding.py" || fail "python compile failed"
rm -rf "$T_ROOT/scripts/__pycache__"
say "PASS: ${#files[@]} shell files clean under bash -n and shellcheck; python compiles"
