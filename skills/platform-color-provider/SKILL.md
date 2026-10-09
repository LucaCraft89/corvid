---
name: platform-color-provider
description: Add or change the per-platform source of theme colors (Linux GTK/libadwaita/KDE, Windows accent, Android dynamic color, macOS accent) feeding the theme engine.
---

# platform-color-provider

## Provider interface
`theme/providers/<platform>/` exposes: `getScheme(): {mode: light|dark, contrast, accent?: color, palette?: colors}` and `onChange(cb)`.

## Linux
- Primary: xdg-desktop-portal `org.freedesktop.appearance` (`color-scheme`, `contrast`, and `accent-color` where the portal version provides it) via D-Bus; subscribe to the `SettingChanged` signal for live updates.
- GTK: read the active GTK 3/4 theme name, libadwaita accent where available, and fall back to the GTK theme's `@accent_bg_color` / named colors when the portal lacks an accent.
- KDE: read `kdeglobals` (accent/`AccentColor`, scheme) and watch for changes; KDE also exposes appearance through the portal.
- Chromium already has GTK integration code under `ui/gtk` and `ui/linux`; extend it rather than duplicating, and check what it exposes before writing new D-Bus code.
- Test on GNOME, KDE Plasma, and a tiling WM with only a GTK theme set.

## Windows
- Accent from the system UISettings accent color or DWM colorization; dark/light from the apps-use-light-theme setting. Live update through the settings-changed notification.

## Android
- Use the platform dynamic-color resources (system accent/neutral tonal palettes on Android 12+) via Material's DynamicColors support; below Android 12, fall back to the seed color.

## macOS
- NSColor accent color and effective appearance; observe changes via KVO/notifications.

## Rules
- Provider output feeds `theme-m3e` only; no provider touches UI directly.
- Always honor the user's override (seed/wallpaper/fixed scheme) over the provider.

## Done when
- Changing the OS accent or dark mode updates Corvid within a second without restart on that platform; fallback verified when the provider is unavailable.
