#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
#
# Privacy gate: start the browser with a fresh profile, leave it idle, record
# every packet it sends, and compare what it contacted with
# docs/network-allowlist.md. Exit 0 when everything seen is allowed, 1 when
# not, 2 on setup errors. Needs root (network namespace, tcpdump).
#
# The browser runs in its own network namespace behind NAT, so the capture
# holds only its traffic. It runs as an unprivileged user with the sandbox
# on, in a private Xvfb display. IPv4 only inside the namespace.
#
#   build/privacy-gate.sh [--minutes N] [--binary PATH] [--user NAME] [-- browser args]
# Browser args are for checking the gate itself (e.g. -- https://example.com
# must show up as NEW); a real gate run passes none.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/config.sh"

MINUTES=15
BINARY="$BINARY"   # from config.sh, named after build/branding.conf
RUN_USER=tester
while [ $# -gt 0 ]; do
    case "$1" in
        --minutes) MINUTES="$2"; shift 2 ;;
        --binary)  BINARY="$2"; shift 2 ;;
        --user)    RUN_USER="$2"; shift 2 ;;
        --) shift; break ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 2; }
[ -x "$BINARY" ] || { echo "no browser at $BINARY" >&2; exit 2; }
id "$RUN_USER" >/dev/null 2>&1 || { echo "user $RUN_USER missing (useradd -m $RUN_USER)" >&2; exit 2; }
for t in tcpdump tshark Xvfb setpriv ip iptables; do
    command -v "$t" >/dev/null || { echo "missing $t (build/deps.sh)" >&2; exit 2; }
done

NS=corvidgate
HOST_IF=cg-host
NS_IF=cg-ns
NET=10.213.0
RUN="$CORVID_WORK/gate/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$RUN/profile"
chown -R "$RUN_USER:" "$RUN"
chmod 755 "$CORVID_WORK/gate"

# Use the host's real upstream resolver; systemd-resolved's 127.0.0.53 stub
# is not reachable from inside the namespace.
DNS="$(awk '/^nameserver/ && $2 ~ /^[0-9.]+$/ && $2 !~ /^127\./ {print $2; exit}' \
    /run/systemd/resolve/resolv.conf /etc/resolv.conf 2>/dev/null || true)"
[ -n "$DNS" ] || { echo "no IPv4 upstream DNS server found" >&2; exit 2; }

OLD_FORWARD="$(sysctl -n net.ipv4.ip_forward)"
PIDS=()
cleanup() {
    set +e
    for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done
    sleep 1
    ip netns pids "$NS" 2>/dev/null | xargs -r kill -9 2>/dev/null
    iptables -t nat -D POSTROUTING -s "$NET.0/30" -j MASQUERADE 2>/dev/null
    ip link del "$HOST_IF" 2>/dev/null
    ip netns del "$NS" 2>/dev/null
    rm -rf "/etc/netns/$NS"
    sysctl -qw net.ipv4.ip_forward="$OLD_FORWARD"
}
cleanup
trap cleanup EXIT

ip netns add "$NS"
ip link add "$HOST_IF" type veth peer name "$NS_IF"
ip link set "$NS_IF" netns "$NS"
ip addr add "$NET.1/30" dev "$HOST_IF"
ip link set "$HOST_IF" up
ip -n "$NS" addr add "$NET.2/30" dev "$NS_IF"
ip -n "$NS" link set lo up
ip -n "$NS" link set "$NS_IF" up
ip -n "$NS" route add default via "$NET.1"
sysctl -qw net.ipv4.ip_forward=1
iptables -t nat -A POSTROUTING -s "$NET.0/30" -j MASQUERADE
mkdir -p "/etc/netns/$NS"
echo "nameserver $DNS" > "/etc/netns/$NS/resolv.conf"
# glibc's "resolve" and "myhostname" modules ask the host's systemd-resolved
# over a Unix socket, which would bypass the capture. Plain DNS only.
sed -E 's/^(hosts:).*/\1 files dns/' /etc/nsswitch.conf > "/etc/netns/$NS/nsswitch.conf"

tcpdump -i "$HOST_IF" -n -U -w "$RUN/capture.pcap" 2>"$RUN/tcpdump.log" &
PIDS+=($!)
sleep 1

as_user() { ip netns exec "$NS" setpriv --reuid="$RUN_USER" --regid="$RUN_USER" --init-groups \
    env -i HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)" PATH=/usr/bin:/bin DISPLAY=:93 "$@"; }

as_user Xvfb :93 -screen 0 1280x800x24 -nolisten tcp >"$RUN/xvfb.log" 2>&1 &
PIDS+=($!)
sleep 2

echo "== gate: $BINARY, fresh profile, idle ${MINUTES} min, output in $RUN"
"$BINARY" --version || true
as_user "$BINARY" --user-data-dir="$RUN/profile" \
    --log-net-log="$RUN/netlog.json" --net-log-capture-mode=Default "$@" \
    >"$RUN/browser.log" 2>&1 &
BROWSER=$!
PIDS+=($BROWSER)

sleep $((MINUTES * 60))
kill -0 "$BROWSER" 2>/dev/null || echo "!! browser exited early, see $RUN/browser.log"
# Ask the browser to quit cleanly so the net log is finished.
ip netns exec "$NS" pkill -TERM -u "$RUN_USER" -f "$BINARY" 2>/dev/null || true
for _ in $(seq 20); do kill -0 "$BROWSER" 2>/dev/null || break; sleep 1; done
sleep 2
kill "${PIDS[0]}" 2>/dev/null || true   # tcpdump
wait "${PIDS[0]}" 2>/dev/null || true

set +e
python3 "$CORVID_REPO/build/privacy-gate-report.py" \
    --pcap "$RUN/capture.pcap" --netlog "$RUN/netlog.json" \
    --allowlist "$CORVID_REPO/docs/network-allowlist.md" \
    --dns "$DNS" --minutes "$MINUTES" --binary "$BINARY" | tee "$RUN/summary.txt"
STATUS=${PIPESTATUS[0]}
cp "$RUN/summary.txt" "$LOGS/privacy-gate-$(basename "$RUN").txt"
exit "$STATUS"
