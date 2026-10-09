# src-overlay/corvid/theme (UNVERIFIED, partial)

Written: `linux_appearance.mojom` (transport contract) and `config_file_allowlist.h`.

NOT written: the browser-side `LinuxAppearanceSource` implementation. Per `skills/platform-color-provider`, Chromium
already has GTK/portal integration under `ui/gtk`, `ui/linux` and `ui/base/` (dark mode manager, accent handling). Before
adding D-Bus code, read what those expose in the pinned tree and prefer extending them: the implementation should
forward `org.freedesktop.appearance` values (`color-scheme`, `contrast`, `accent-color`) and `SettingChanged` signals
over this Mojo interface, serve only the allow-listed config files (with a size cap), and watch them with
`base::FilePathWatcher`. All parsing and precedence logic is in TypeScript (`theme/providers/linux/`), unit tested
against fixtures.
