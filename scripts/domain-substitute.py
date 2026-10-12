#!/usr/bin/env python3
"""Make Google service hostnames in the Chromium source tree unresolvable (`google.com` -> `google.invalid`).

Why: acceptance 01b greps the shipped binary for Google hostnames. Disabling a feature at runtime leaves its URL constants in
the binary; replacing the TLD with `.invalid` (RFC 6761, never resolves) makes any missed code path fail closed and keeps
the binary free of live Google endpoints. Hosts in KEEP (docs/network-allowlist.md binary-allowlist block) are left alone.

Run after patches + overlay + branding, before building (scripts/apply-patches.sh does). Idempotent. The substituted files
are listed in <tree>/.domain-substituted; `--revert` restores them from git (do this before authoring patches, and never
commit substituted content: scripts/refresh-patches.sh refuses hunks that add `.invalid` hosts).

Usage: domain-substitute.py --tree DIR [--allowlist docs/network-allowlist.md] [--revert]
"""
import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

ROOTS = ["chrome", "components", "content", "net", "services", "google_apis", "extensions", "ui", "url", "device", "media",
         "base", "mojo", "gpu", "headless", "remoting", "tools/gritsettings"]
SUFFIXES = {".cc", ".h", ".mm", ".m", ".java", ".kt", ".js", ".ts", ".html", ".json", ".grd", ".grdp", ".xtb", ".inc",
            ".mojom", ".proto", ".txt", ".xml", ".css", ".gni"}
SKIP_PARTS = ("/test/", "/tests/", "/testing/", "/testdata/", "/test_data/", "/third_party/", "/docs/", "/doc/",
              "transport_security_state", "/fuzz", "/demo", "/benchmark", "/perf/", "/e2e/", "/browsertest", "/unittest",
              "/mock", "/fake", "/stub", "/android/javatests/", "/ios/", "baked_in_configs")
SKIP_NAME = re.compile(r"(_unittest|_browsertest|_test|_perftest|_mock|_fake|_stub|_testutil|test_util|test_support)\.|^(OWNERS|README|DEPS|BUILD|CHANGELOG|LICENSE)")
DOMAINS = r"(?:google|googleapis|gstatic|googleusercontent|gvt1|gvt2|googlesyndication|google-analytics|withgoogle)\.com|doubleclick\.net|youtube\.com|ytimg\.com|withyoutube\.com"
HOST = re.compile(r"(?<![A-Za-z0-9])((?:[A-Za-z0-9_-]+\.)*(?:" + DOMAINS + r"))(?![A-Za-z0-9-])", re.I)
TLD = re.compile(r"\.(com|net)$", re.I)
MANIFEST = ".domain-substituted"


def keep_set(path):
    text = Path(path).read_text()
    m = re.search(r"```binary-allowlist\n(.*?)```", text, re.S)
    out = set()
    for line in (m.group(1) if m else "").splitlines():
        line = line.split("#")[0].strip().lower()
        if line:
            out.add(line)
    return out


def substitute(text, keep):
    def sub(m):
        host = m.group(1)
        if host.lower() in keep or host.lower().lstrip(".") in keep:
            return host
        return TLD.sub(".invalid", host)
    return HOST.sub(sub, text)


def candidates(tree):
    out = subprocess.run(["git", "-C", tree, "ls-files", "-z", "--"] + ROOTS, capture_output=True, check=True).stdout
    for rel in out.decode("utf-8", "replace").split("\0"):
        if not rel:
            continue
        p = "/" + rel
        if Path(rel).suffix not in SUFFIXES or any(s in p for s in SKIP_PARTS) or SKIP_NAME.search(Path(rel).name):
            continue
        yield rel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tree", required=True)
    ap.add_argument("--allowlist", default=str(Path(__file__).resolve().parent.parent / "docs/network-allowlist.md"))
    ap.add_argument("--revert", action="store_true")
    a = ap.parse_args()
    tree = a.tree
    man = Path(tree) / MANIFEST
    if a.revert:
        if man.exists():
            files = [l for l in man.read_text().splitlines() if l]
            for i in range(0, len(files), 500):
                subprocess.run(["git", "-C", tree, "checkout", "--"] + files[i:i + 500], check=True)
            man.unlink()
            print(f"domain-substitute: reverted {len(files)} file(s)")
        return 0
    keep = keep_set(a.allowlist)
    changed = []
    for rel in candidates(tree):
        p = Path(tree) / rel
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if not HOST.search(text):
            continue
        new = substitute(text, keep)
        if new != text:
            p.write_text(new, encoding="utf-8")
            changed.append(rel)
    man.write_text("\n".join(changed) + "\n")
    print(f"domain-substitute: rewrote {len(changed)} file(s); manifest {man}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
