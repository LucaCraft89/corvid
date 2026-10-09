#!/usr/bin/env bash
# Acceptance 3: change `name` (and the derived ids) in the branding config, re-run the branding
# step, and grep the tree for the old name outside allowed credits files: zero hits.
set -euo pipefail
# shellcheck source=tests/acceptance/phase-0/lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
setup

OLD="corvid"
NEWNAME="Zebrafish"
CFG="$WORK/zebra.toml"
cat >"$CFG" <<EOF
name = "$NEWNAME"
short_name = "$NEWNAME"
vendor = "Zebrafish Project"
version = "0.0.1"

[ids]
linux_desktop_id = "org.zebrafish.Zebrafish"
windows_app_id = "Zebrafish.Browser"
android_package = "org.zebrafish.browser"
mac_bundle_id = "org.zebrafish.Zebrafish"
url_scheme = "zebrafish"

[user_agent]
product_token = "Zebrafish"

[icons]
source_svg = "branding/icons/corvid.svg"

[urls]
homepage = ""
update_server = ""
EOF

# Allowed: credits/authors files only.
allowed_re='(^|/)(AUTHORS|CREDITS)[^/]*$'
hits() { # <tree> -> prints offending paths (content or file name)
  local t="$1"
  { (cd "$t" && grep -rIil --exclude-dir=.git --exclude-dir=out "$OLD" . || true)
    (cd "$t" && find . -path ./.git -prune -o -iname "*$OLD*" -print || true)
  } | sed 's|^\./||' | sort -u | { grep -Ev "$allowed_re" || true; }
}

if [ "$FIXTURE" = 1 ]; then
  # Baseline: default config must put the name into the tree (proves the grep is not vacuous).
  python3 -I "$RROOT/scripts/render-branding.py" --tree "$CORVID_SRC" >/dev/null
  grep -rIqi "$OLD" "$CORVID_SRC/chrome/app/brand" || fail "baseline render did not contain the name"
  base_hits_after_default="$(hits "$CORVID_SRC" | wc -l)"
  [ "$base_hits_after_default" -gt 0 ] || fail "baseline grep found nothing; test is vacuous"
  say "baseline (default config): $base_hits_after_default offending path(s), as expected"
  # Fresh stub tree rendered only with the new name.
  rm -rf "${CORVID_SRC:?}/chrome/app/brand"
fi

CORVID_BRANDING_CONFIG="$CFG" "$RROOT/scripts/apply-patches.sh" >"$WORK/apply.log" 2>&1 || { cat "$WORK/apply.log"; fail "apply with renamed config failed"; }

if [ "$FIXTURE" = 1 ]; then
  # Fixture patches/overlay deliberately carry no product name, so any hit is a branding leak.
  # The fixture CREDITS mentions the old name and must be exempt.
  grep -qi "$OLD" "$CORVID_SRC/CREDITS" || fail "fixture CREDITS lost its old-name line"
fi
out="$(hits "$CORVID_SRC")"
if [ -n "$out" ]; then printf '%s\n' "$out"; fail "old name '$OLD' still present outside credits files"; fi
grep -q "^PRODUCT_FULLNAME=$NEWNAME\$" "$CORVID_SRC/chrome/app/theme/chromium/BRANDING" || fail "new name not rendered"
say "PASS: zero hits for '$OLD' outside credits after rename to $NEWNAME"
