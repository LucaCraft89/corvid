# src-overlay/corvid/theme (UNVERIFIED, not compiled)

Targets (all in `BUILD.gn`, each small and independent):

- `appearance_snapshot`: NativeTheme values -> portal numbering (note the dark/light swap). Pure.
- `config_file_reader`: exact-match allow-list + size cap for gtk/kdeglobals files. Single definition of the allow-list.
- `linux_appearance_source`: the logic behind `linux_appearance.mojom` (portal values from a snapshot, allow-listed
  files, bad-message on anything else). No Mojo types, no D-Bus, no subprocess.
- `native_theme_appearance_observer`: watches `ui::NativeTheme` and emits a snapshot only when it changed.
- `unit_tests`: gtest sources for all of the above.

D-Bus is intentionally not re-implemented: upstream `ui/linux/portal_settings_linux.cc` already reads
`org.freedesktop.appearance` and feeds NativeTheme; we observe NativeTheme. The accent comes through only if upstream
enables the portal accent path (`features::kUsePortalAccentColor` in the version we read); verify on the pinned tree.
Still to write (needs the WebUI controller): the `mojom::LinuxAppearanceSource` adapter that owns the Receiver, binds
`bad_message` to `mojo::ReportBadMessage`, and a `base::FilePathWatcher` on the allow-listed files that calls
`OnConfigFilesChanged`. All parsing/precedence stays in TypeScript (`theme/providers/linux/`).
