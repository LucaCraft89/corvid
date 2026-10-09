# Windows installer / uninstaller design (task 3.3)

Status: DESIGN, UNVERIFIED. Nothing here was built or run; Chromium's installer layout must be re-checked against the pinned tree (`chrome/installer/`, `chrome/install_static/`).

## Approach
Reuse Chromium's `mini_installer` + `setup.exe` machinery (rebranded), not WiX. Reasons: it already handles per-user and per-machine (`--system-level`), registry registration, shortcuts, default-browser registration (`Capabilities` / `RegisteredApplications`), uninstall entries, and in-place updates; replacing it is a large, high-risk fork. WiX/MSI is a possible later add-on for enterprise (GPO) deployment, not Phase 3.

## Rebranding inputs (single source: `branding/config.toml`)
| Item | Source |
|---|---|
| Product/vendor strings | `name`, `vendor` |
| AppUserModelID / ProgID prefix | `ids.windows_app_id` = `Corvid.Browser` |
| Install dir | per-user `%LOCALAPPDATA%\Corvid\Application`; per-machine `%ProgramFiles%\Corvid\Application` |
| User data | `%LOCALAPPDATA%\Corvid\User Data` (kept on uninstall unless user opts in) |
| URL scheme | `url_scheme` (`corvid`) plus http/https/ftp(mailto optional) via default-app registration |
| install_static brand | `chrome/install_static/` brand-specific file (patch 0001) |

## Behaviours to implement and test
1. Per-user (no UAC) and per-machine (UAC) installs; per-user is default.
2. Start-menu shortcut; optional desktop shortcut; taskbar pin NOT forced.
3. Default browser: register capabilities (http, https, .html, .htm, .xhtml, .pdf optional); on Win10/11 the OS forbids silently setting default, so open `ms-settings:defaultapps` and show clear UI. Never write `UserChoice` (hash-protected, anti-abuse).
4. Uninstall entry under `Uninstall\Corvid` with correct DisplayVersion; `setup.exe --uninstall` removes install dir, shortcuts, registry keys (HKCU/HKLM `Software\Corvid`, `Software\Classes\Corvid*`, `RegisteredApplications` value, Capabilities, scheduled task); asks before deleting user data.
5. No Google Update: patch 0002 removes the `GoogleUpdate` registration, `Software\Google\Update\*` keys and `UpdateSetup`; no Omaha scheduled tasks/services (see updater below).
6. Updater integration: installer registers the Corvid updater scheduled task (per-user: current-user task; per-machine: SYSTEM task) pointing at `corvid_updater.exe`, only when the update server is configured (empty `urls.update_server` => no task, no network).
7. In-place update: `setup.exe` handles versioned directory swap (`Application\<ver>\` + `chrome.exe` launcher), which also gives rollback (previous version dir kept until new one is confirmed healthy; see `docs/specs/updater.md`).
8. Jump list / taskbar progress: runtime features, not installer; tracked separately in `docs/reports`.
9. Silent flags for automation: `--do-not-launch-chrome --system-level --verbose-logging` (upstream names; verify).

## Leftover-file audit (acceptance test 2)
`tests/acceptance/phase-3/02-installer-lifecycle.ps1` snapshots HKCU/HKLM `Software`, `%LOCALAPPDATA%`, `%ProgramFiles%`, `%ProgramData%`, scheduled tasks, services before install and diffs after uninstall; only `User Data` may remain.

## Not decided here
Authenticode signing (cert, timestamp, SmartScreen reputation): see `docs/security/code-signing.md`; arm64 installer variant: open question.
