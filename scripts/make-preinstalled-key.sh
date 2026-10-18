#!/usr/bin/env bash
# Create the signing key for Corvid's preinstalled extensions (the extension id derives from it, so keep it stable).
# The key is written to $CORVID_KEYS/preinstalled.pem (default ~/.corvid-keys), mode 0600, NEVER into the repo, and is
# never printed. Only the resulting extension id and the file path are shown. Refuses to overwrite an existing key.
# Later: move it to GitHub secrets yourself, e.g.  gh secret set CORVID_PREINSTALLED_KEY < "$CORVID_KEYS/preinstalled.pem"
# and delete the local copy once CI can build without it.
set -euo pipefail
dir="${CORVID_KEYS:-$HOME/.corvid-keys}"
key="$dir/preinstalled.pem"
if [[ -e "$key" ]]; then
  echo "key already exists at $key (not overwritten)"
else
  umask 077
  mkdir -p "$dir"
  chmod 700 "$dir"
  openssl genrsa -out "$key" 2048 2>/dev/null
  chmod 600 "$key"
  echo "created $key (0600, not printed)"
fi
echo -n "extension id: "
python3 -I "$(dirname "$0")/gen-preinstalled.py" --id-from-key "$key"
