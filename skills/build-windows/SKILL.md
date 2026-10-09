---
name: build-windows
description: Configure, build, test, sign, and package Corvid for Windows x64 (arm64 later). Use for Phase 3 and the Windows CI job.
---

# build-windows

## Host
Windows 10/11 x64 with Visual Studio and Windows SDK per Chromium's current Windows build requirements (check the official doc before provisioning; versions change). Set `DEPOT_TOOLS_WIN_TOOLCHAIN=0` when using a local VS install. NTFS, long paths enabled, Defender exclusions for the checkout/output.

## Steps
1. Same fetch/apply flow via PowerShell wrappers `scripts/*.ps1`.
2. GN args in `build/args/win-release.gn` (mirror Linux; Windows-specific: `target_cpu="x64"`, official build for release).
3. `autoninja -C out\Release chrome mini_installer`.
4. Installer: build the Chromium mini_installer, rebranded; per-user and per-machine installs; uninstaller; default-browser registration; protocol/file handlers; start menu entries.
5. Updates: Corvid's own updater against a configurable update server (no Google Update). Specify the design in `docs/specs/updater.md` before building.
6. Code signing: ask the user for a certificate plan; until then produce unsigned builds clearly labelled.
7. Platform integrations: system accent provider (`platform-color-provider`), Windows Hello passkeys (`passkey-authenticator`), jump lists, taskbar progress.

## Done when
- Installer installs, launches, updates, and uninstalls on clean Windows 10 and 11 VMs; Phase 1 and 2 acceptance checks pass.
