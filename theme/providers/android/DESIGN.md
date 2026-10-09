# Android dynamic-color provider (design, UNVERIFIED)

Implements the `platform-color-provider` interface: `getScheme(): {mode, contrast, accent?, palette?}` and `onChange(cb)`.
Provider output feeds `theme-m3e` only; user override (seed/wallpaper/fixed scheme) always wins.

## Data flow
```
Android resources (API 31+)         Java/Kotlin glue                       WebUI theme engine
@android:color/system_accent1_*  -> CorvidDynamicColorProvider.kt  ->  Mojo/JS bridge -> theme/providers/android/index.ts
@android:color/system_neutral*_* -> snapshot() + ComponentCallbacks     getScheme()/onChange()
uiMode night / contrast          -> onConfigurationChanged               -> tonal engine regenerates tokens
```

## Decisions
- API >= 31: read the system tonal palettes directly (`system_accent1_0..1000`, `accent2`, `accent3`, `neutral1`, `neutral2`).
  We pass the palette tones to the shared engine as `palette`, and `accent = system_accent1_600` (the engine may re-derive from
  the seed to keep one code path; the engine decides). We do NOT use the Material Components `DynamicColors` library
  (extra dependency; the engine already computes roles). Context for dynamic colors: Material's own library applies
  `DynamicColors.applyToActivitiesIfAvailable`; we replace this with our own read. [UNVERIFIED which is simpler in the Chromium tree.]
- API < 31: `getScheme()` returns no `palette`/`accent`; the engine uses the stored seed (default seed is a theme-engine
  decision, not ours).
- Live update: on Android 12+ the wallpaper-driven palette change surfaces as a configuration change/activity recreate or via
  `Context.registerComponentCallbacks`; the Activity must handle `uiMode|...` config changes to avoid recreate if we want
  sub-second updates. [UNVERIFIED: whether system palette changes deliver a ComponentCallbacks event without recreate; verify on device. Fallback: re-snapshot in `onResume` and on `ACTION_CONFIGURATION_CHANGED`.]
- Mode: `Configuration.uiMode & UI_MODE_NIGHT_MASK`. Contrast: `UiModeManager.getContrast()` (API 34+), else 0.
- Debounce 100 ms; emit only on real change (hash of palette + mode + contrast).
- Wallpaper override: user choice "Wallpaper" maps to the same system palette; "Seed" ignores it.

## Files
- `CorvidDynamicColorProvider.kt` (copy to `src-overlay/corvid/android/theme/` for build; kept here beside the design). UNVERIFIED: not compiled.
- `index.ts`: WebUI-side provider; talks to the Java side through a Mojo interface `corvid.mojom.PlatformColors` (to be defined in `src-overlay/corvid/android/theme/`), not built.

## Test (device)
Pixel-class API 34: change wallpaper -> palette changes -> Corvid recolors <= 1 s without restart. API 30 emulator: seed
fallback, no crash. Toggle dark mode live. All UNVERIFIED.
