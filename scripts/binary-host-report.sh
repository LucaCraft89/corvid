#!/usr/bin/env bash
# Usage: scripts/binary-host-report.sh <out-dir> [report.tsv]
# Lists every Google-service host string in the shipped files of a build (same pattern as
# tests/acceptance/phase-1/01b-binary-host-grep.sh) as: host<TAB>file<TAB>count<TAB>allowlisted(yes|no).
# Only top-level shipped files (chrome, *.so, *.pak, *.dat, *.bin) are scanned, not obj/ or gen/.
set -euo pipefail
out="${1:?out dir}"; rep="${2:-binary-host-report.tsv}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
pat='[A-Za-z0-9.-]*(google\.com|googleapis\.com|gstatic\.com|googleusercontent\.com|google-analytics\.com|googlesyndication\.com|doubleclick\.net|gvt1\.com|gvt2\.com|youtube\.com|ytimg\.com|withgoogle\.com|stun\.l\.google\.com)'
allowed="$(awk '/^```binary-allowlist/{f=1;next}/^```/{f=0}f' "$repo/docs/network-allowlist.md" | sed 's/#.*//' | tr '[:upper:]' '[:lower:]' | awk 'NF')"
: > "$rep"
cd "$out"
for f in chrome *.so *.pak *.dat *.bin; do
  [ -f "$f" ] || continue
  # Test-only libraries (e.g. libtest_trace_processor.so) are built when a test target shares the out dir; they do not ship.
  case "$f" in *test*) continue ;; esac
  { grep -aoE "$pat" "$f" 2>/dev/null || true; } | tr '[:upper:]' '[:lower:]' | sort | uniq -c | while read -r n h; do
    ok=no; grep -qxF "$h" <<<"$allowed" && ok=yes
    printf '%s\t%s\t%s\t%s\n' "$h" "$f" "$n" "$ok"
  done >> "$rep"
done
echo "hosts: $(cut -f1 "$rep" | sort -u | wc -l), not allowlisted: $(awk -F'\t' '$4=="no"{print $1}' "$rep" | sort -u | wc -l); report: $rep"
