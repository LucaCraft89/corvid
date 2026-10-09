#!/usr/bin/env python3
"""Check every patch in patches/android/ has the add-patch header and is listed in patches/series.phase5."""
import glob, os, sys

root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
fields = ("Purpose:", "Area:", "Files:", "Rebase risk:", "Origin:")
series = [l.strip() for l in open(os.path.join(root, "patches/series.phase5")) if l.strip() and not l.startswith("#")]
bad = 0
for p in sorted(glob.glob(os.path.join(root, "patches/android/*.patch"))):
    head = open(p, errors="replace").read(4000)
    for f in fields:
        if f not in head:
            print(f"{os.path.basename(p)}: missing header field {f}"); bad += 1
    if "android/" + os.path.basename(p) not in series:
        print(f"{os.path.basename(p)}: not in patches/series.phase5"); bad += 1
for s in series:
    if not os.path.exists(os.path.join(root, "patches", s)):
        print(f"series entry missing on disk: {s}"); bad += 1
print("patch header check:", "FAIL" if bad else "ok (%d patches)" % len(series))
sys.exit(1 if bad else 0)
