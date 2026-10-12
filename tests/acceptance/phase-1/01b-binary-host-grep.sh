#!/usr/bin/env bash
# Acceptance 1b: Google service hostnames in the built binary and resources. A host passes only if it is in the
# ```binary-allowlist block of docs/network-allowlist.md, or matches a `file-glob host-glob` rule in its
# ```binary-scoped block. Exit 77 = skipped (not a pass).
# REQUIRES CORVID_DIR (directory of the built browser, e.g. out/GnDebug). Build it with build/args/linux-*.gn:
# a build without the product args embeds the field-trial test config and its Gemini/docs hosts.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"
if [[ -z "${CORVID_DIR:-}" || ! -d "${CORVID_DIR}" ]]; then echo "SKIP: CORVID_DIR not set (needs a built Corvid output directory)"; exit 77; fi

rep="$(mktemp)"
"$repo/scripts/binary-host-report.sh" "$CORVID_DIR" "$rep" >/dev/null
# binary-host-report.sh already marks exact-allowlist hosts; here apply the scoped rules to the rest.
scoped="$(awk '/^```binary-scoped/{f=1;next}/^```/{f=0}f' "$repo/docs/network-allowlist.md" | sed 's/#.*//' | awk 'NF')"
bad=0
while IFS=$'\t' read -r host file _ ok; do
  [[ "$ok" == yes ]] && continue
  allowed=0
  while read -r fglob hglob; do
    # shellcheck disable=SC2053  # globs are intentional
    if [[ "$file" == $fglob && "$host" == $hglob ]]; then allowed=1; break; fi
  done <<<"$scoped"
  if [[ $allowed -eq 0 ]]; then echo "UNLISTED: $host (in $file)"; bad=1; fi
done < "$rep"
if [[ $bad -ne 0 ]]; then echo "FAIL binary-host-grep (add an intentional entry with a reason to docs/network-allowlist.md, or remove the code)"; exit 1; fi
echo "PASS binary-host-grep"
