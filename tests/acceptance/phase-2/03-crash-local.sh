#!/usr/bin/env bash
# Spec test 3: crash a renderer; local report with symbolized summary; nothing uploaded.
# UNVERIFIED until a Corvid build exists. Upload check = packet capture on a clean profile during the crash.
source "$(dirname "$0")/lib.sh"; need_browser
command -v tcpdump >/dev/null || unverified "tcpdump needed for the no-upload capture (and CAP_NET_RAW)"
launch
PCAP="$PROFILE/idle.pcap"; tcpdump -i any -w "$PCAP" 'not (host 127.0.0.1 or ::1)' & TPID=$!; sleep 1
TAB="$(curl -fs -X PUT "http://127.0.0.1:$PORT/json/new?about:blank" | python3 -I -c 'import sys,json;print(json.load(sys.stdin)["id"])')"
curl -fs -X PUT "http://127.0.0.1:$PORT/json/new?chrome://crash" >/dev/null   # renderer crash trigger (dev)
sleep 5; kill $TPID
OUT="$(curl -fs "http://127.0.0.1:$PORT/corvid-dev/diagnostics?kind=crash")"
python3 -I -c 'import sys,json;ev=json.loads(sys.stdin.read());c=[e for e in ev if e["kind"]=="crash"];assert c,"no crash event";assert c[0]["data"]["symbolizedSummary"],"unsymbolized";assert c[0]["data"]["uploaded"] is False' <<<"$OUT" || { echo "FAIL: crash record"; exit 1; }
PKTS=$(tcpdump -r "$PCAP" 2>/dev/null | wc -l)
[[ "$PKTS" == 0 ]] || { echo "FAIL: $PKTS non-loopback packets during crash"; exit 1; }
echo "PASS crash local, 0 external packets"
