---
name: package-release
description: Produce, verify, and publish a Corvid release across platforms (artifacts, checksums, signatures, update metadata, changelog).
---

# package-release

## Steps
1. Confirm the target version in `branding/config.toml`; freeze patches; run `verify-phase` for the current phase on every shipped platform and attach the reports.
2. Build release artifacts per platform with the platform build skills (`build-linux`, `build-windows`, `build-android`, and later macOS).
3. Reproducibility: record the Chromium version, patch series hash, toolchain versions, and GN args in `release/<version>/BUILDINFO.json`.
4. Checksums (SHA-256) and signatures: ask the user which signing keys to use; never generate or store signing keys without the user's instruction. Unsigned builds must be labelled.
5. Update metadata: generate the update manifest for the configured update server (no Google endpoints).
6. Third-party notices: regenerate the license/credits bundle (Chromium credits plus Corvid additions plus bundled extensions, including uBlock Origin's GPLv3 notice and source link).
7. Changelog from commit history grouped by area; list security-relevant Chromium bumps.
8. Pre-publish checklist (ask the user to confirm before publishing): name/trademark cleared, license decisions recorded, idle network capture clean, privacy statement current.
9. Publish artifacts only to the places the user approved; tag the repo.

## Done when
- Release folder has artifacts, checksums, signatures (or labelled unsigned), BUILDINFO, notices, changelog, and the user confirmed publication.
