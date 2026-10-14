#!/usr/bin/env python3
"""Render branding templates from branding/config.toml into a Chromium tree.

Single rename point: edit branding/config.toml, re-run. Templates live in
branding/templates/<tree-relative-path>.in and use @@KEY@@ placeholders.
The icon source SVG is copied to chrome/app/theme/brand/product_logo.svg.

Usage:
  render-branding.py --tree DIR [--config FILE]
  render-branding.py --get KEY [--config FILE]       (print one value)
"""
import argparse
import re
import shutil
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLACEHOLDER = re.compile(r"@@([A-Z0-9_]+)@@")
ICON_DEST = "chrome/app/theme/brand/product_logo.svg"
# Stock Chromium product-logo PNGs replaced by branding/icons/<size>.png: (tree-relative path, icon size in px).
# Only files that already exist in the tree are overwritten (never added). Not replaced: product_logo.ai, chromium.ai,
# product_logo_animation.svg, product_logo_32.xpm, product_logo_22_mono.png and product_logo_name_22*.png (a wordmark).
ICON_PNGS = (
    [(f"chrome/app/theme/chromium/product_logo_{n}.png", n) for n in (16, 24, 48, 64, 128, 256)]
    + [(f"chrome/app/theme/chromium/linux/product_logo_{n}.png", n) for n in (24, 48, 64, 128, 256)]
    + [("chrome/app/theme/default_100_percent/chromium/product_logo_16.png", 16),
       ("chrome/app/theme/default_100_percent/chromium/product_logo_32.png", 32),
       ("chrome/app/theme/default_100_percent/chromium/linux/product_logo_16.png", 16),
       ("chrome/app/theme/default_100_percent/chromium/linux/product_logo_32.png", 32),
       ("chrome/app/theme/default_200_percent/chromium/product_logo_16.png", 32),
       ("chrome/app/theme/default_200_percent/chromium/product_logo_32.png", 64)]
)


def variables(cfg):
    ids = cfg.get("ids", {})
    urls = cfg.get("urls", {})
    return {
        "NAME": cfg["name"],
        "SHORT_NAME": cfg["short_name"],
        "VENDOR": cfg["vendor"],
        "VERSION": cfg["version"],
        "LINUX_DESKTOP_ID": ids["linux_desktop_id"],
        "WINDOWS_APP_ID": ids["windows_app_id"],
        "ANDROID_PACKAGE": ids["android_package"],
        "MAC_BUNDLE_ID": ids["mac_bundle_id"],
        "URL_SCHEME": ids["url_scheme"],
        "PRODUCT_TOKEN": cfg["user_agent"]["product_token"],
        "HOMEPAGE": urls.get("homepage", ""),
        "UPDATE_SERVER": urls.get("update_server", ""),
    }


def render_text(text, vs, origin):
    def sub(m):
        if m.group(1) not in vs:
            sys.exit(f"render-branding: unknown placeholder @@{m.group(1)}@@ in {origin}")
        return vs[m.group(1)]

    return PLACEHOLDER.sub(sub, text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(ROOT / "branding" / "config.toml"))
    ap.add_argument("--tree")
    ap.add_argument("--get")
    a = ap.parse_args()

    with open(a.config, "rb") as f:
        cfg = tomllib.load(f)
    vs = variables(cfg)

    if a.get:
        key = a.get.upper()
        if key not in vs:
            sys.exit(f"render-branding: unknown key {a.get}")
        print(vs[key])
        return
    if not a.tree:
        sys.exit("render-branding: --tree or --get required")

    tree = Path(a.tree)
    if not tree.is_dir():
        sys.exit(f"render-branding: tree {tree} is not a directory")
    tpl_root = ROOT / "branding" / "templates"
    count = 0
    for tpl in sorted(p for p in tpl_root.rglob("*.in") if p.is_file()):
        rel = tpl.relative_to(tpl_root).with_suffix("")  # strip .in
        out = tree / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(render_text(tpl.read_text(), vs, str(tpl)))
        count += 1
    icon_src = Path(cfg["icons"]["source_svg"])
    if not icon_src.is_absolute():
        icon_src = ROOT / icon_src
    if not icon_src.is_file():
        sys.exit(f"render-branding: icon {icon_src} missing")
    icon_out = tree / ICON_DEST
    icon_out.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(icon_src, icon_out)
    icon_dir = icon_src.parent
    pngs = 0
    for rel, size in ICON_PNGS:
        dest = tree / rel
        src = icon_dir / f"{size}.png"
        if dest.is_file():
            if not src.is_file():
                sys.exit(f"render-branding: {src} missing")
            shutil.copyfile(src, dest)
            pngs += 1
    print(f"render-branding: rendered {count} template(s) + icon + {pngs} PNG logo(s) into {tree}")


if __name__ == "__main__":
    main()
