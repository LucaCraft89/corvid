# Phase 5 acceptance (Android)

Maps to `docs/specs/phase-5.md` tests 1-7. Only the static checks run in the sandbox/CI hosted runner; device checks are
UNVERIFIED stubs that exit 77 (skipped) until a device or emulator and a build exist.

| # | Check | Script | Runs without device? |
|---|---|---|---|
| 1 | install + launch time + memory | `device-checks.sh install` | no |
| 2 | dynamic color | `device-checks.sh dyncolor` | no |
| 3 | layout reachability/persist/reset | `device-checks.sh layout` (+ static `validate-layout.py`) | partly |
| 4 | extensions M1-M5, uBO, battery | `device-checks.sh ext`; `blocker-measurement.md` | no |
| 5 | passkeys | manual checklist in `src-overlay/corvid/android/credential/DESIGN.md` | no |
| 6 | idle network capture | `device-checks.sh idle-net` | no |
| 7 | tablet/foldable | `device-checks.sh foldable` | no |

Static: `validate-layout.py`, `check-patch-headers.py`.
