#!/usr/bin/env bash
# Acceptance 10: .deb / .rpm / AppImage install and launch on Debian/Ubuntu and Fedora VMs, X11 and Wayland.
# This needs VMs; it cannot run in the build sandbox. Provide CORVID_VMS="user@host:deb user@host:rpm" and CORVID_PKG_DIR.
# For each VM: copy the package, install, launch headless under X11 (xvfb) and Wayland (weston/headless), print version, uninstall.
# Exit 77 = skipped (not a pass). UNVERIFIED.
set -euo pipefail
if [[ -z "${CORVID_VMS:-}" || -z "${CORVID_PKG_DIR:-}" ]]; then echo "SKIP: CORVID_VMS / CORVID_PKG_DIR not set (needs Debian/Ubuntu and Fedora VMs and built packages)"; exit 77; fi
fail=0
for entry in $CORVID_VMS; do
  target="${entry%%:*}"; kind="${entry##*:}"
  case "$kind" in
    deb) pkg="$(ls "$CORVID_PKG_DIR"/*.deb | head -1)"; inst='sudo apt-get install -y ./corvid.pkg'; rm_cmd='sudo apt-get remove -y corvid' ;;
    rpm) pkg="$(ls "$CORVID_PKG_DIR"/*.rpm | head -1)"; inst='sudo dnf install -y ./corvid.pkg'; rm_cmd='sudo dnf remove -y corvid' ;;
    appimage) pkg="$(ls "$CORVID_PKG_DIR"/*.AppImage | head -1)"; inst='chmod +x ./corvid.pkg'; rm_cmd='rm -f ./corvid.pkg' ;;
    *) echo "unknown kind $kind"; exit 2 ;;
  esac
  scp -q "$pkg" "$target:corvid.pkg"
  for session in x11 wayland; do
    if ssh "$target" "$inst >/dev/null 2>&1 && ${CORVID_LAUNCH_CMD:-corvid} --version && CORVID_SESSION=$session timeout 20 ${CORVID_LAUNCH_CMD:-corvid} --headless=new --dump-dom about:blank >/dev/null"; then
      echo "PASS install $kind on $target ($session)"
    else echo "FAIL install $kind on $target ($session)"; fail=1; fi
  done
  ssh "$target" "$rm_cmd >/dev/null 2>&1" || { echo "FAIL uninstall $kind on $target"; fail=1; }
done
exit $fail
