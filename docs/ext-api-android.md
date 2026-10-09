# Extension API status on Android (skeleton)

All statuses are `unknown` until measured on the pinned checkout (builds) and a physical device (works). Order follows
`skills/android-extensions-port` step 4. Columns: Build = compiles into Android target; Works = verified on device;
MV = manifest versions required; Milestone = when it must work.

Status values: `unknown`, `not-built`, `built`, `stub`, `works`, `n/a`. Nothing below is verified.

| Order | API | MV | Milestone | Build | Works | Android notes / mapping | Upstream desktop-Android port? |
|---|---|---|---|---|---|---|---|
| 1 | storage | 2,3 | M1 | unknown | unknown | | verify |
| 2 | runtime | 2,3 | M1 | unknown | unknown | messaging, onInstalled, lifecycle events on process restart | verify |
| 3 | tabs | 2,3 | M1 | unknown | unknown | map to Android tab model; `tabs.create` with new-tab override (5.10) | verify |
| 4 | scripting / content scripts | 2,3 | M1 | unknown | unknown | | verify |
| 5 | permissions | 2,3 | M1 | unknown | unknown | upstream ifdef'd dialogs out on desktop Android; we supply a bottom-sheet prompt | partial (commit f36c776) |
| 6 | webRequest (blocking) | 2 | M2 | unknown | unknown | required by uBO MV2; Corvid carry patch | no (MV3-only) |
| 7 | webRequest (observe) | 2,3 | M2 | unknown | unknown | | verify |
| 8 | declarativeNetRequest | 3 (2 partial) | M2 | unknown | unknown | | verify |
| 9 | alarms | 2,3 | M2 | unknown | unknown | Doze: timers may be deferred; document minimum period | verify |
| 10 | contextMenus | 2,3 | M3 | unknown | unknown | long-press menu | verify |
| 11 | action / browserAction / pageAction | 2,3 | M3 | unknown | unknown | toolbar/menu entry; popup as bottom sheet | verify |
| 12 | commands | 2,3 | M3 | unknown | unknown | no keyboard; expose in extension UI | verify |
| 13 | devtools.* | 2,3 | M4 | unknown | unknown | n/a on mobile; stub gracefully (no throw) | n/a |
| 14 | webNavigation | 2,3 | M4 | unknown | unknown | | verify |
| 15 | cookies | 2,3 | M4 | unknown | unknown | | verify |
| 16 | downloads | 2,3 | M4 | unknown | unknown | Android DownloadManager/Corvid downloads | verify |
| 17 | notifications | 2,3 | M4 | unknown | unknown | Android notification channels, POST_NOTIFICATIONS permission (API 33+) | verify |
| 18 | history / bookmarks | 2,3 | M4 | unknown | unknown | | verify |
| 19 | windows | 2,3 | M4 | unknown | unknown | single-window semantics on phones | verify |
| 20 | omnibox | 2,3 | M4 | unknown | unknown | | verify |
| 21 | offscreen / sidePanel | 3 | M4 | unknown | unknown | sidePanel -> bottom sheet | verify |
| 22 | identity | 2,3 | M4 | unknown | unknown | Google OAuth flows may be unavailable (de-Google); document | verify |
| 23 | nativeMessaging | 2,3 | M4 | unknown | unknown | likely n/a on Android; document | n/a? |
| 24 | management, i18n, idle, power, system.*, topSites, sessions, tabGroups, search, proxy, privacy, contentSettings, fontSettings, ... | | M4 | unknown | unknown | long tail; one row each once measured | verify |

## Filling this table
1. Build column: from `gn desc` / compile of each `extensions/browser/api/<name>` and `chrome/browser/extensions/api/<name>` target under the Android config.
2. Works column: run `tests/acceptance/phase-5/ext-api-smoke/` (to be written once a device is available) and record date, device, Chromium version.
3. Every `stub` must have a documented non-throwing behaviour.
