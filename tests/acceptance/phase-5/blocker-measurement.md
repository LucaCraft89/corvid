# Native-blocker decision framework (task 5.4 / 5.9). MEASURE FIRST; do not build the blocker.

Status: protocol only. No measurement has been run (UNVERIFIED). Thresholds are proposals tied to
`docs/specs/phase-5-budgets.md` (CR-A4); the user approves them before the decision is taken.

## Decision rule
Build a native blocker only if ALL hold after uBO has been tuned (M2-M5 fixes applied):
1. uBO-on misses a budget in at least 2 of the 4 metric families below on the reference device, in >= 3 repeated runs
   (median, with spread reported), AND
2. the miss is attributable to the extension runtime path (background page wakeups, message-passing latency, webRequest blocking round trips, memory of the background page) rather than to unrelated Android issues (checked via traces), AND
3. a cheaper mitigation was tried and failed: keep-alive tuning, filter-list size reduction, switching uBO to its lighter mode, DNR-based static rules for the default lists, process priority tuning.
Otherwise: ship uBO only. If the rule triggers, write a design (scope, list compatibility, licence of any list/engine reused, e.g. Brave's adblock-rust is MPL-2.0: licence check required) and ask the user before any build.

## Conditions (run each, same device, same build, airplane mode off, screen brightness fixed)
A. Baseline: Corvid, no extensions.
B. uBO preinstalled (default lists).
C. uBO + 10 typical extensions (list in `tests/acceptance/phase-5/ext-set-10.txt`, to be chosen).
D. Reference: same Chromium version stock-flag build without extensions (for browser overhead).

## Metrics and collection
| Family | Metric | How |
|---|---|---|
| Page load | median/p90 load + LCP over 30 ad-heavy pages x 5 runs, cache cleared, deterministic via a local replay proxy | Chrome DevTools protocol over adb forward; Perfetto trace |
| Memory | PSS of browser + renderer + extension process after 5 min idle and after the page set | `adb shell dumpsys meminfo <pkg>`; `showmap` |
| Idle wakeups / CPU | wakeups, alarms, CPU time with screen off for 1 h, app backgrounded and foregrounded | `dumpsys batterystats --reset`, then `--checkin`; `dumpsys alarm`; `dumpsys jobscheduler`; Perfetto sched trace |
| Battery | 30 min scripted browsing, mAh/percent drain, thermal state | `dumpsys batterystats`, Battery Historian; charge-limited device, same starting level |
| Blocking effectiveness | % ad/tracker requests blocked on the test page and EasyList sample | request log from replay proxy |
| Correctness | pages break count over the 30-page set | manual flag + screenshot diff |

## Reporting
Raw data to `docs/reports/blocker/<date>/`; summary table in the phase report: condition x metric, median, p90, n, device model,
Android build, Corvid commit. State the decision explicitly: "ship uBO only" or "propose native blocker design".
Everything on this page is UNVERIFIED until run on hardware.
