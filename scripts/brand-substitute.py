#!/usr/bin/env python3
"""Rename the product in user-visible Chromium strings: "Chromium" -> branding name (default from branding/config.toml).

Why: chromium_strings.grd and friends hard-code "Chromium" in message text ("Your Chromium", "About Chromium", ...), so the
BRANDING file alone does not rename the UI. Only text between XML tags is changed; tag attributes (message names, desc,
ids) and URLs are left alone. Phrases in KEEP are not touched. Idempotent. Translations (.xtb) are keyed by a hash of the
English text, so translated strings that contained the old name fall back to English until retranslated (0.1 ships en-US).

Run after patches + overlay + branding, before building (scripts/apply-patches.sh does). The changed files are listed in
<tree>/.brand-substituted; `--revert` restores them from git.

Usage: brand-substitute.py --tree DIR [--name NAME] [--revert]
"""
import argparse
import re
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Branded string sources shipped on desktop (android/ios resources are not built here).
FILES = [
    "chrome/app/chromium_strings.grd",
    "chrome/app/settings_chromium_strings.grdp",
    "chrome/app/generated_resources.grd",
    "chrome/app/shared_settings_strings.grdp",
    "chrome/app/settings_strings.grdp",
    "chrome/app/password_manager_ui_strings.grdp",
    "chrome/app/glic_strings.grdp",
    "components/components_chromium_strings.grd",
    "components/ssl_errors_strings.grdp",
    "components/security_interstitials_strings.grdp",
    "components/page_info_strings.grdp",
    "components/version_ui_strings.grdp",
    "components/new_or_sad_tab_strings.grdp",
    "components/search_engine_choice_strings.grdp",
    "components/management_strings.grdp",
    "components/send_tab_to_self_strings.grdp",
    "components/password_manager_strings.grdp",
    "components/omnibox_strings.grdp",
    "components/omnibox_pedal_ui_strings.grdp",
    "components/autofill_strings.grdp",
    "components/privacy_sandbox_strings.grd",
    "extensions/strings/extensions_chromium_strings.grdp",
]
KEEP = ("Chromium Authors", "Chromium Embedded", "Chromium Projects", "Chromium Project")
WORD = re.compile(r"(?<![A-Za-z0-9_/.-])Chromium(?![A-Za-z0-9_-])")
TAG = re.compile(r"(<[^>]*>)", re.S)
MANIFEST = ".brand-substituted"


def substitute(text, name):
    out = []
    for part in TAG.split(text):
        if part.startswith("<") and part.endswith(">"):
            out.append(part)
            continue
        protected = {}
        for i, k in enumerate(KEEP):
            token = f"\x00{i}\x00"
            protected[token] = k
            part = part.replace(k, token)
        part = WORD.sub(name, part)
        for token, k in protected.items():
            part = part.replace(token, k)
        out.append(part)
    return "".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tree", required=True)
    ap.add_argument("--name")
    ap.add_argument("--revert", action="store_true")
    a = ap.parse_args()
    tree = Path(a.tree)
    manifest = tree / MANIFEST
    if a.revert:
        if manifest.exists():
            files = [f for f in manifest.read_text().split() if f]
            subprocess.run(["git", "-C", str(tree), "checkout", "--", *files], check=True)
            manifest.unlink()
        return
    name = a.name
    if not name:
        with open(ROOT / "branding" / "config.toml", "rb") as f:
            name = tomllib.load(f)["name"]
    changed = []
    total = 0
    for rel in FILES:
        p = tree / rel
        if not p.is_file():
            continue
        old = p.read_text(encoding="utf-8")
        new = substitute(old, name)
        if new != old:
            total += len(WORD.findall("".join(x for x in TAG.split(old) if not x.startswith("<"))))
            p.write_text(new, encoding="utf-8")
            changed.append(rel)
    known = set(manifest.read_text().split()) if manifest.exists() else set()
    manifest.write_text("\n".join(sorted(known | set(changed))) + "\n")
    print(f"brand-substitute: {len(changed)} file(s) changed in this run; manifest {manifest}")


if __name__ == "__main__":
    sys.exit(main())
