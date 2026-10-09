#!/usr/bin/env bash
# Acceptance 5: change the GNOME accent (portal) and dark mode; Corvid recolors within 1 s without restart.
# KDE variant: set CORVID_DESKTOP=kde (uses kwriteconfig6 on kdeglobals). Manual seed override must win.
# WCAG AA for all text roles is covered by `npm test` (theme/engine/theme.test.ts), not here.
# REQUIRES a GNOME (or KDE) session, CORVID_BIN, gsettings, node. Exit 77 = skipped (not a pass). UNVERIFIED.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
if [[ -z "${CORVID_BIN:-}" ]]; then echo "SKIP: CORVID_BIN not set"; exit 77; fi
desktop="${CORVID_DESKTOP:-gnome}"
if [[ "$desktop" == gnome ]]; then
  command -v gsettings >/dev/null || { echo "SKIP: gsettings not installed"; exit 77; }
  gsettings get org.gnome.desktop.interface accent-color >/dev/null 2>&1 || { echo "SKIP: GNOME accent-color key unavailable (needs GNOME 47+)"; exit 77; }
else
  command -v kwriteconfig6 >/dev/null || { echo "SKIP: kwriteconfig6 not installed"; exit 77; }
fi
export CORVID_THEME_DESKTOP="$desktop"
exec node "$here/05-theme.mjs"
