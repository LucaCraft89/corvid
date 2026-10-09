# Android extension compatibility protocol (UNVERIFIED; nothing run)

Output table: `docs/ext-compat-android.md` (columns: extension, id, MV, category, install, load, core feature works, popup/options usable by touch, background survives app switch, notes, device/Android/Corvid commit).
Overall target: >= 80% of the top-100 list. Mandatory categories below must ALL pass (see `docs/specs/phase-5-budgets.md`).

## Per-extension test (all 100)
install from local CRX/ZIP and configured source -> enable -> core feature on a fixture page -> open popup and options with touch -> background app 5 min, return, feature still works -> restart app, state persists -> remove cleanly.

## Mandatory category cases
### New-tab overrides (NTP-1..4)
- NTP-1 test extension (MV3) and NTP-2 test extension (MV2) with `chrome_url_overrides.newtab`: new tab from tab switcher loads extension page, no flash of Corvid NTP.
- NTP-3 two overriding extensions: picker selects winner; "Corvid default" works; `corvid://newtab?default` escape works.
- NTP-4 at least 2 popular real new-tab extensions (e.g. Momentum-class dashboards, a tab-dashboard extension); disabling restores default immediately; incognito honors setting.
### Password managers (PM-1..5)
- PM-1..3 at least three popular managers (e.g. Bitwarden, KeePassXC-Browser-class, one more). Each: sign in, autofill a username/password on a fixture login form, save-new-login prompt, popup usable by touch.
- PM-4 content-script autofill inside iframes and shadow DOM fixtures.
- PM-5 extension does not leak secrets to other extensions/pages (permission model unchanged; check host permissions prompt).
- Note: features needing nativeMessaging (desktop app integration) are expected n/a on Android; document, and the manager's standalone mode must work.
### Ad blockers (AB-1..5)
- AB-1 uBO (MV2): blocking webRequest, cosmetic filters, element picker via long-press menu; blocks on test page; survives process death.
- AB-2 an MV3 DNR blocker; AB-3 a second MV2 blocker (e.g. AdGuard/Ghostery class).
- AB-4 two blockers enabled together: no crash, no double-break.
- AB-5 blocking effectiveness and page-break count per `blocker-measurement.md`.

Selection of named extensions is a user-confirmable list in `tests/acceptance/phase-5/ext-top100.txt` (to be produced; store source subject to CR-2).
