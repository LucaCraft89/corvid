#!/usr/bin/env bash
# Install corvid-sync on bare metal or in a Proxmox LXC (Debian/Ubuntu/Alpine-with-systemd).
#   sudo ./install.sh [path/to/corvid-sync-binary]
# Without an argument it uses ./corvid-sync next to this script, or builds with Go if present.
# Env: DESTDIR (staging root, for dry runs), NO_START=1 (do not enable/start), LISTEN (default 127.0.0.1:8443)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
D="${DESTDIR:-}"
listen="${LISTEN:-127.0.0.1:8443}"

bin="${1:-}"
if [ -z "$bin" ]; then
  if [ -x "$here/corvid-sync" ]; then bin="$here/corvid-sync"
  elif command -v go >/dev/null 2>&1; then
    (cd "$here/.." && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o "$here/corvid-sync" ./cmd/corvid-sync)
    bin="$here/corvid-sync"
  else echo "no binary given and Go not installed" >&2; exit 1; fi
fi
[ -x "$bin" ] || { echo "$bin is not executable" >&2; exit 1; }

if [ -z "$D" ] && [ "$(id -u)" -ne 0 ]; then echo "run as root" >&2; exit 1; fi

if [ -z "$D" ] && ! id corvid-sync >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/corvid-sync --shell /usr/sbin/nologin corvid-sync
fi

install -d -m 0755 "$D/usr/local/bin" "$D/etc/corvid-sync" "$D/etc/systemd/system"
install -d -m 0700 "$D/var/lib/corvid-sync"
install -m 0755 "$bin" "$D/usr/local/bin/corvid-sync"
install -m 0644 "$here/corvid-sync.service" "$D/etc/systemd/system/corvid-sync.service"
[ -z "$D" ] && chown -R corvid-sync:corvid-sync /var/lib/corvid-sync

envf="$D/etc/corvid-sync/env"
if [ ! -e "$envf" ]; then
  tok="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  umask 077
  cat > "$envf" <<EOF
CORVID_SYNC_ADDR=$listen
CORVID_SYNC_REGISTRATION=token
CORVID_SYNC_REG_TOKEN=$tok
# Set to enable the optional admin UI at /admin (metadata only). Leave unset to keep it OFF.
#CORVID_SYNC_ADMIN_TOKEN=
# Only if a reverse proxy on this host/LAN is the sole way in:
#CORVID_SYNC_TRUST_PROXY=1
EOF
  echo "Created $envf. Invite token (also stored there): $tok"
else
  echo "Keeping existing $envf"
fi
[ -z "$D" ] && chown root:corvid-sync "$envf" && chmod 0640 "$envf"

if [ -z "$D" ] && [ "${NO_START:-}" != 1 ]; then
  systemctl daemon-reload
  systemctl enable --now corvid-sync
  sleep 1
  /usr/local/bin/corvid-sync -addr "$listen" -healthcheck && echo "corvid-sync is healthy on $listen"
fi
echo "Put a TLS reverse proxy in front (see docs/selfhost-sync.md). Back up /var/lib/corvid-sync (sync.db AND server-keys.json)."
