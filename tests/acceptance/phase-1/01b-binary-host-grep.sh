#!/usr/bin/env bash
# Acceptance 1b: grep the built binary and resources for Google service hostnames; only entries in the
# ```binary-allowlist block of docs/network-allowlist.md may appear. Exit 77 = skipped (not a pass).
# REQUIRES CORVID_DIR (directory of the built browser, e.g. out/linux-release). UNVERIFIED.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
if [[ -z "${CORVID_DIR:-}" || ! -d "${CORVID_DIR}" ]]; then echo "SKIP: CORVID_DIR not set (needs a built Corvid output directory)"; exit 77; fi

patterns='(google\.com|googleapis\.com|gstatic\.com|googleusercontent\.com|google-analytics\.com|googlesyndication\.com|doubleclick\.net|gvt1\.com|gvt2\.com|youtube\.com|ytimg\.com|withgoogle\.com|stun\.l\.google\.com)'
hits="$(mktemp)"
grep -rIaoE --binary-files=text "[A-Za-z0-9.-]*${patterns}" "$CORVID_DIR" 2>/dev/null | sed 's/^[^:]*://' | tr 'A-Z' 'a-z' | sort -u > "$hits" || true

allowed="$(awk '/^```binary-allowlist/{f=1;next}/^```/{f=0}f' "$repo/docs/network-allowlist.md" | sed 's/#.*//' | tr 'A-Z' 'a-z' | awk 'NF')"
bad=0
while read -r h; do
  [[ -z "$h" ]] && continue
  if ! grep -qxF "$h" <<<"$allowed"; then echo "UNLISTED: $h"; bad=1; fi
done < "$hits"
if [[ $bad -ne 0 ]]; then echo "FAIL binary-host-grep (add intentional entries to docs/network-allowlist.md with a reason, or remove the code)"; exit 1; fi
echo "PASS binary-host-grep"
