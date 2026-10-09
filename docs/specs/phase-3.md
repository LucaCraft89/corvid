# Phase 3 spec: Windows

Goal: feature parity with the Linux build on Windows 10/11 x64.

## Tasks
| ID | Task | Skill |
|---|---|---|
| 3.1 | Windows build host/CI runner, `.ps1` script wrappers | `bootstrap-build-host`, `build-windows` |
| 3.2 | Fix Windows-specific patch/overlay build errors | `add-patch` |
| 3.3 | Installer (per-user/per-machine), uninstaller, default-browser registration | `build-windows` |
| 3.4 | Updater design + implementation (no Google Update) | `build-windows` (`docs/specs/updater.md`) |
| 3.5 | Windows accent/dark-mode provider | `platform-color-provider` |
| 3.6 | Windows Hello / OS WebAuthn integration + software fallback | `passkey-authenticator` |
| 3.7 | Window chrome: custom title bar in WebUI chrome, snap layouts, high-DPI, high-contrast mode | `add-webui-page` |
| 3.8 | Code signing plan | `package-release` (ask user) |

## Acceptance tests (`tests/acceptance/phase-3/`)
1. Phase 1 and Phase 2 acceptance suites pass on Windows 10 and 11 VMs (adapted where OS-specific).
2. Installer: install, launch, set default browser, update to a newer build, uninstall: no leftover files/registry keys outside user data.
3. Changing Windows accent color and light/dark updates Corvid live.
4. Passkey sign-in works with Windows Hello and with the software authenticator.
5. Idle network capture clean (no Windows-specific phone-home, including updater until the configured server).
6. High-contrast mode and 200% scaling render correctly.

## Ask the user
- Code signing certificate and distribution channel (installer download, winget, etc.).
- Whether to support Windows arm64 in this phase.
