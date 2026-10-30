#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Corvid contributors
"""Summarise a privacy gate run and check it against the allowlist.

Reads the packet capture (through tshark) and the browser's net log, prints
every destination and DNS lookup it saw, and exits 1 if any of them is not
in docs/network-allowlist.md.
"""

import argparse
import collections
import fnmatch
import json
import re
import subprocess
import sys

NS_IP = '10.213.0.2'  # the browser's address inside the gate's namespace


def tshark(pcap, display_filter, *fields):
    """Rows of the given fields for packets matching the filter."""
    cmd = ['tshark', '-n', '-r', pcap, '-Y', display_filter, '-T', 'fields',
           '-E', 'separator=\t', '-E', 'occurrence=a', '-E', 'aggregator=,']
    for field in fields:
        cmd += ['-e', field]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
    return [line.split('\t') for line in out.splitlines() if line.strip()]


def read_allowlist(path):
    """Entries are list items whose first token is in backticks."""
    entries = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^\s*[-*]\s+`([^`]+)`', line)
            if m:
                entries.append(m.group(1).strip().lower())
    return entries


def allowed(key, entries):
    return any(fnmatch.fnmatchcase(key.lower(), e) for e in entries)


def read_netlog(path):
    """URLs requested and hosts resolved, from Chromium's net log."""
    try:
        with open(path, encoding='utf-8') as f:
            text = f.read()
    except OSError:
        return None, None
    try:
        log = json.loads(text)
    except json.JSONDecodeError:
        # Browser did not finish the file: close the events array ourselves.
        text = text.rstrip().rstrip(',')
        try:
            log = json.loads(text + ']}')
        except json.JSONDecodeError:
            return None, None
    types = {v: k for k, v in log['constants']['logEventTypes'].items()}
    urls, hosts = collections.Counter(), collections.Counter()
    for event in log.get('events', []):
        name = types.get(event.get('type'))
        params = event.get('params') or {}
        if name == 'URL_REQUEST_START_JOB' and 'url' in params:
            urls[params.get('method', 'GET') + ' ' + params['url']] += 1
        elif name == 'HOST_RESOLVER_MANAGER_REQUEST' and 'host' in params:
            hosts[params['host']] += 1
    return urls, hosts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pcap', required=True)
    ap.add_argument('--netlog', required=True)
    ap.add_argument('--allowlist', required=True)
    ap.add_argument('--dns', required=True, help='resolver the namespace uses')
    ap.add_argument('--minutes', default='?')
    ap.add_argument('--binary', default='?')
    args = ap.parse_args()

    entries = read_allowlist(args.allowlist)

    # IP -> names, from DNS answers in the capture.
    names = collections.defaultdict(set)
    for row in tshark(args.pcap, f'ip.dst == {NS_IP} && dns.flags.response == 1', 'dns.qry.name', 'dns.a'):
        if len(row) > 1 and row[1]:
            for ip in row[1].split(','):
                names[ip].add(row[0])

    lookups = collections.Counter()
    for row in tshark(args.pcap, f'ip.src == {NS_IP} && dns.flags.response == 0', 'dns.qry.name', 'dns.qry.type'):
        lookups[row[0]] += 1

    sni = collections.defaultdict(set)  # (proto, ip, port) -> server names
    for row in tshark(args.pcap, f'ip.src == {NS_IP} && tls.handshake.type == 1', 'ip.dst', 'tcp.dstport',
                      'udp.dstport', 'tls.handshake.extensions_server_name'):
        ip, tport, uport, name = (row + [''] * 4)[:4]
        proto, port = ('tcp', tport) if tport else ('udp', uport)
        if name:
            sni[(proto, ip, port)].add(name)

    http = collections.Counter()
    for row in tshark(args.pcap, f'ip.src == {NS_IP} && http.request', 'http.host', 'http.request.uri'):
        http['http://' + row[0] + (row[1] if len(row) > 1 else '')] += 1

    flows = collections.Counter()  # (proto, ip, port) -> packets sent
    for row in tshark(args.pcap, f'ip.src == {NS_IP} && (tcp.flags.syn == 1 && tcp.flags.ack == 0)',
                      'ip.dst', 'tcp.dstport'):
        flows[('tcp', row[0], row[1])] += 1
    for row in tshark(args.pcap, f'ip.src == {NS_IP} && udp', 'ip.dst', 'udp.dstport'):
        if row[0] == args.dns and row[1] == '53':
            continue  # DNS lookups are listed on their own
        flows[('udp', row[0], row[1])] += 1
    for row in tshark(args.pcap, f'ip.src == {NS_IP} && !tcp && !udp && !arp', 'ip.dst', 'ip.proto'):
        flows[('ip-proto-' + row[1], row[0], '-')] += 1

    urls, resolved = read_netlog(args.netlog)

    problems = []
    print(f'Privacy gate: {args.binary}, fresh profile, idle {args.minutes} min')
    print(f'Allowlist: {args.allowlist} ({len(entries)} entries)')
    print()
    print(f'DNS lookups ({len(lookups)}):')
    for name, count in sorted(lookups.items()):
        ok = allowed(name, entries)
        problems += [] if ok else [f'dns {name}']
        print(f'  {"ok " if ok else "NEW"} {name}  x{count}')
    print()
    print(f'Connections ({len(flows)}):')
    for (proto, ip, port), count in sorted(flows.items(), key=lambda kv: (kv[0][1], kv[0][2])):
        hosts = sorted(sni.get((proto, ip, port), set()) or names.get(ip, set()))
        keys = hosts or [ip]
        ok = all(allowed(k, entries) or allowed(f'{ip}:{port}/{proto}', entries) for k in keys)
        label = ', '.join(hosts) if hosts else '(no name seen)'
        problems += [] if ok else [f'{proto} {ip}:{port} {label}']
        print(f'  {"ok " if ok else "NEW"} {proto} {ip}:{port}  {label}  ({count} pkts)')
    if http:
        print()
        print('Plain HTTP requests:')
        for url, count in sorted(http.items()):
            print(f'  {url}  x{count}')
    print()
    if urls is None:
        print('Net log: missing or unreadable')
    else:
        print(f'URLs requested by the network stack ({len(urls)}, from the net log):')
        for url, count in sorted(urls.items()):
            print(f'  {url}  x{count}')
        print(f'Hosts resolved by the browser ({len(resolved)}):')
        for host, count in sorted(resolved.items()):
            print(f'  {host}  x{count}')
    print()
    if problems:
        print(f'FAIL: {len(problems)} item(s) not in the allowlist:')
        for p in problems:
            print(f'  {p}')
        return 1
    print('PASS: nothing outside the allowlist')
    return 0


if __name__ == '__main__':
    sys.exit(main())
