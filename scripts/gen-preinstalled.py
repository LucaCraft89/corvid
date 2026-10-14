#!/usr/bin/env python3
"""Emit the external-extension JSON for Corvid's preinstalled extensions (patch extensions/0320 reads it).

Input : extensions/preinstalled.toml (the pinned entries) and, per extension, a packed CRX plus the PEM key it was
        packed with (the extension id is derived from that key, so it is stable across builds).
Output: <out>/<extension_id>.json in Chromium's external-extensions format:
          {"external_crx": "<absolute path to the CRX>", "external_version": "<version>"}
        and <out>/preinstalled.manifest.json (slug -> id/version/sha256 of the CRX) for the build report.

Packing the CRX is NOT done here. With a built browser: chrome --pack-extension=<unpacked dir> --pack-extension-key=<pem>
(the unpacked dir is the pinned zip extracted; the zip hash is verified against preinstalled.toml first).

Usage: gen-preinstalled.py --slug ublock-origin --crx PATH --key PEM --out DIR [--toml FILE]
       gen-preinstalled.py --id-from-key PEM        (print the extension id only)
"""
import argparse, hashlib, json, subprocess, sys, tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def extension_id_from_key(pem: str) -> str:
    """Chromium id: first 16 bytes of SHA-256(SubjectPublicKeyInfo DER), each nibble mapped to 'a'..'p'."""
    der = subprocess.run(["openssl", "pkey", "-in", pem, "-pubout", "-outform", "DER"],
                         check=True, capture_output=True).stdout
    digest = hashlib.sha256(der).digest()[:16]
    return "".join(chr(ord("a") + (b >> 4)) + chr(ord("a") + (b & 15)) for b in digest)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--toml", default=str(ROOT / "extensions" / "preinstalled.toml"))
    ap.add_argument("--slug")
    ap.add_argument("--crx")
    ap.add_argument("--key")
    ap.add_argument("--out")
    ap.add_argument("--id-from-key")
    a = ap.parse_args()
    if a.id_from_key:
        print(extension_id_from_key(a.id_from_key))
        return 0
    if not (a.slug and a.crx and a.key and a.out):
        ap.error("--slug, --crx, --key and --out are required")
    entries = {e["slug"]: e for e in tomllib.load(open(a.toml, "rb")).get("extension", [])}
    if a.slug not in entries:
        print(f"error: slug {a.slug!r} not in {a.toml}", file=sys.stderr)
        return 1
    e = entries[a.slug]
    crx = Path(a.crx).resolve()
    if not crx.is_file():
        print(f"error: {crx} not found", file=sys.stderr)
        return 1
    ext_id = extension_id_from_key(a.key)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{ext_id}.json").write_text(json.dumps(
        {"external_crx": str(crx), "external_version": e["version"]}, indent=2) + "\n")
    manifest_path = out / "preinstalled.manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    manifest[a.slug] = {"id": ext_id, "version": e["version"], "crx_sha256": hashlib.sha256(crx.read_bytes()).hexdigest(),
                        "upstream_zip_sha256": e.get("sha256", "")}
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(f"{a.slug}: id {ext_id} -> {out / (ext_id + '.json')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
