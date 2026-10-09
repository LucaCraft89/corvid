# Android extensions: upstream baseline (Track B, step 0)

Date: 2026-10-09. Owner: Phase 5 agent. Status: research from web search only. The sandbox could not reach
`chromium.googlesource.com` with the fetch tool (DNS failure), so primary-source claims below come from search-result
excerpts of Chromium docs/commits and are marked **[search-excerpt]**. Everything marked **[TO VERIFY]** must be
re-checked against the pinned Chromium checkout with the commands in "Verification commands" before M1 starts.
Pinned Chromium version: not yet set in this base (Phase 0 owns the pin).

## 1. What upstream says

| # | Finding | Source | Confidence |
|---|---|---|---|
| 1 | Chromium's extensions team is adding an experimental "desktop Android" build configuration and migrating code gradually via build flags and GN args. | `extensions/docs/buildflags.md` https://chromium.googlesource.com/chromium/src/+/main/extensions/docs/buildflags.md **[search-excerpt]** | medium-high |
| 2 | `ENABLE_EXTENSIONS_CORE` is the flag for new code and means "extensions code for all platforms: Win/Mac/Linux/ChromeOS/desktop Android". Include `extensions/buildflags/buildflags.h`. | same doc **[search-excerpt]** | medium-high |
| 3 | `ENABLE_EXTENSIONS` is legacy and now means Win/Mac/Linux/ChromeOS but NOT desktop Android. Long-term plan: convert to CORE, then rename CORE back to `ENABLE_EXTENSIONS`. | same doc **[search-excerpt]** | medium-high |
| 4 | GN: `enable_extensions_core = enable_extensions \|\| enable_desktop_android_extensions` (arg names to verify in `extensions/buildflags/buildflags.gni`). | gitcode mirror of buildflags.gni (low-quality mirror) **[TO VERIFY]** | medium |
| 5 | Desktop Android supports Manifest V3 only; MV2-only code is excluded from that configuration. | buildflags.md **[search-excerpt]** | medium |
| 6 | Porting is incremental, per-feature commits, e.g. "extensions: Port chrome.permissions API to desktop Android" (dialogs not supported yet, ifdef'd out), "extensions: Port WebstoreInstaller to desktop Android", "extensions: Refactor c/b/e/browsertest_util.cc for desktop Android". | https://chromium.googlesource.com/chromium/src/+/f36c77644c493e083c6875eac1a47c01d2bc493c ; https://chromium.googlesource.com/chromium/src/+/0202b1112466f2dcfd0862ce5bf22a82a800dd4c ; https://chromium.googlesource.com/chromium/src/+/ddc3065f5a279bf1191f91a458b7539d5863cdab **[search-excerpt]** | medium |
| 7 | An April 2025 press report described a dev build of Chrome for Android running Dark Reader, Keepa and uBlock Origin, but without options pages and without a toolbar extensions button. | https://chromeunboxed.com/a-development-version-of-chrome-for-android-now-supports-extensions (secondary) | low-medium |
| 8 | As of mid-2026 secondary sources say shipping Chrome for Android still has no extensions and no public launch date. | https://extensionbooster.net/blog/chrome-extensions-android-2026-what-works-guide/ (low quality) | low |
| 9 | "Desktop Android" appears to target Android form factors with a desktop-class windowing mode (large screens/Android desktop), not phones; phone UI for extensions is likely out of upstream's scope. | inference from 1-8 | **[TO VERIFY]** |

### Implications for Corvid (conclusions, not facts)
- **Reuse upstream's `enable_desktop_android_extensions` path as the foundation (M1 start).** Do not fork the port from the
  old Kiwi approach; upstream's per-feature ports (permissions, webstore installer, browsertest utils) are directly reusable
  and each rebase brings more.
- **MV2 is the gap.** Corvid's locked decision keeps MV2 (uBO full needs blocking `webRequest`). Upstream desktop Android is
  MV3-only, and upstream is also removing MV2. So on Android Corvid must (a) carry the desktop `mv2-maintenance` patches into
  the Android configuration and (b) make the MV2-only code compile under `ENABLE_EXTENSIONS_CORE`. This is the largest
  Corvid-specific delta and the main rebase-risk driver. Isolate it in `patches/android/` with its own series group.
- **Phone UI is ours.** Upstream UI work targets desktop-class Android; Corvid's touch extension manager, action popups as
  bottom sheets, and permission prompts as sheets are Corvid overlay work.
- **Process model is probably ours.** Android low-memory-killer and Doze behaviour for persistent MV2 background pages is not
  covered by anything found. Treat as Corvid design work (M2/M5).
- **Android-specific `#if BUILDFLAG(IS_ANDROID)` branches in upstream extension code are expected** and will be wrong for us
  (they exclude extensions). Each one found while building is a patch candidate; prefer flipping them to
  `ENABLE_EXTENSIONS_CORE` guards in the same shape upstream uses so they may match later upstream commits.

## 2. Other Chromium-based Android browsers (pitfalls only; no code reuse)

| Browser | What is known | Source | License note |
|---|---|---|---|
| Kiwi Browser | First Chromium-based Android browser with full Chrome extensions; open-sourced the work in 2020 and discussed upstreaming. Load-from-CRX/unpacked and desktop-mode webstore install were the UX. Noted: extensions with native x86 code do not load on ARM; stability complaints. | https://liliputing.com/2019/04/kiwi-web-browser-for-android-supports-google-chrome-extensions.html ; https://9to5google.com/2020/05/30/kiwi-browser-samsung-extensions-chromium-android/ | Repo/licence not checked. **Do not copy**; if ever reused, run a licence check and record in `docs/PATCH-PROVENANCE.md`. Project is believed unmaintained: **[TO VERIFY]**. |
| Lemur Browser | Chromium-based, runs Chrome/Edge extensions. | https://en.xiaoz.org/post/19057 | Source not found; treat as closed. |
| Yandex Browser | Followed Kiwi with extension support. | 9to5google article above | Closed. |

Pitfalls drawn from them (secondary evidence plus general Chromium knowledge):
1. **Rebase drift** from `IS_ANDROID` checks that mean "no extensions" (the 9to5google article states this problem explicitly).
   Mitigation: keep Android patches few, flag-keyed, and ordered at the end of the series.
2. **Stale forks** died when Chromium moved on (MV3, mojo refactors). Mitigation: stay on upstream's desktop-Android path.
3. **Install UX** via "desktop mode + webstore" is poor; Corvid needs a first-class install-from-source flow (CR-2 pending).
4. **Native-code extensions / NaCl** never apply; ignore.
5. **Stability under memory pressure**: reported flaky; design explicit keep-alive and restart (see plan M2/M5).

## 3. Port plan (adapts `skills/android-extensions-port`)

Isolation: all Track B work lives in `patches/android/ext-*` (own series section), `src-overlay/corvid/android/ext/`, and
can be disabled by GN arg `corvid_android_extensions=false` (a Corvid arg defined in overlay `BUILD.gn`) so Tracks A and C never block on it.

### Milestones (criteria are proposals; budgets/targets are the user's call, see `docs/specs/phase-5-budgets.md`)

| M | Goal | Exit criteria (all UNVERIFIED until run on device) | Main work |
|---|---|---|---|
| M0 | Build flags | Android target links with `enable_desktop_android_extensions=true`; extension system initialises on launch with no extensions installed; no crash. | Flip flags; fix compile errors; add Android `ExtensionsBrowserClient`/`ExtensionHostDelegate`/system provider where upstream lacks them for our target. |
| M1 | Content-script extensions | A sample MV3 and a sample MV2 content-script-only extension install from a local CRX/ZIP, persist across restart, inject on matching pages; `storage`, `runtime`, `tabs`, `scripting` basics work; permissions prompt is a sheet. | Install pipeline; extension service wiring; permission prompt sheet; MV2 enablement on Android. |
| M2 | uBO full | Preinstalled uBO MV2 enabled on fresh profile, blocking `webRequest` works, filter lists apply, survives app background/foreground and process death; test page ads blocked. | MV2 `webRequest` blocking on Android; background page lifecycle/keep-alive policy; preinstall provider (`preinstall-extension`). |
| M3 | Touch UI | Extensions manager (`corvid://extensions`, shared WebUI with mobile styles), toolbar/menu entries, popups as bottom sheets, options pages open and are usable, per-site access control. | Overlay Java/Kotlin + WebUI; `contextMenus` mapped to long-press; `commands` exposed as UI. |
| M4 | Compatibility | Top-100 list run on device; table committed to `docs/ext-compat-android.md`; pass-rate target (proposed 80%, user decides) assessed; `docs/ext-api-android.md` complete. | Long-tail APIs; triage failures. NTP override (5.10) lands here. |
| M5 | Budgets | Idle wakeups, memory, battery with uBO alone and uBO + 10 typical extensions within budgets the user approves; native-blocker decision made from data. | Perf work; blocker decision framework (`tests/acceptance/phase-5/blocker-measurement.md`). |

### Risks
| Risk | Level | Mitigation |
|---|---|---|
| Upstream desktop Android remains MV3 only; MV2 Android carry cost | High | Isolate; M2 gated on it; report cost after M0. |
| Background page lifetime under LMK/Doze | High | Explicit policy, measurement in M5; foreground service not used by default (needs user decision, battery). |
| Upstream Android path changes quickly | Medium | Rebase weekly via Phase 0 pipeline; keep patches flag-keyed. |
| Store/CRX source legal (CR-2), uBO licence (CR-1) | Policy | Blocked on user, no code impact. |
| Upstream may not ship phone-form-factor behaviour | Medium | Own the UI in overlay. |

## 4. Verification commands (run on the pinned checkout; record output here)
```
cat extensions/docs/buildflags.md
cat extensions/buildflags/buildflags.gni
git log --oneline --grep="desktop Android" -- extensions chrome/browser/extensions | head -100
grep -rn "enable_desktop_android_extensions" --include=*.gn --include=*.gni . | head
gn args out/Android --list | grep -i -E "extensions|desktop_android"
grep -rn "ENABLE_EXTENSIONS_CORE" --include=*.cc --include=*.h -l | wc -l
ls chrome/browser/extensions/ | head -50      # which dirs have android_ variants
gn desc out/Android //chrome/android:chrome_public_apk deps --tree | grep extensions
```
Open items to resolve with them: exact GN arg names/defaults; whether the Android APK target (vs the desktop-Android
target) honours `enable_desktop_android_extensions`; which target name is current (`chrome_public_apk` vs other); whether
`extensions/browser` `webRequest` blocking compiles under CORE; list of unported APIs (feeds `docs/ext-api-android.md`).
