# Chromium 155.0.8059.39: API findings from M2 (overlay compile)

Verified with rg / real builds against `~/chromium/src`. Replace recalled names with these.

| Recalled | Real (155) | Where used |
|---|---|---|
| `GURL::host_piece()/path_piece()/ref_piece()` | `host()`, `path()`, `ref()` return `std::string_view` (`GetHost()` is the `std::string` copy) | webui/stock_page_policy.cc |
| `ui::TestNativeTheme` (`ui/native_theme/test/test_native_theme.h`) | gone. Tests use `ui::MockOsSettingsProvider` (`//ui/native_theme:test_support`, `ui/native_theme/mock_os_settings_provider.h`) with `NativeTheme::GetInstanceForNativeUi()`. NativeTheme re-reads every setting from the provider on each notification, so `set_user_color()` alone is overwritten: drive `SetAccentColor()/SetPreferredContrast()/SetPreferredColorScheme()` on the mock (they notify). | theme/native_theme_appearance_observer_unittest.cc |
| `NativeTheme::{preferred_color_scheme,preferred_contrast,user_color}()`, `NativeThemeObserver::OnNativeThemeUpdated` | present as recalled | theme/native_theme_appearance_observer.cc |
| `WebContentsObserver::OnDidAddMessageToConsole(..., int32_t level, ...)` | `blink::mojom::ConsoleMessageLevel level` (`kVerbose/kInfo/kWarning/kError`, `third_party/blink/public/mojom/devtools/console_message.mojom`) | diagnostics/hang_collector.* |
| `OnRendererUnresponsive/OnRendererResponsive(RenderProcessHost*)`, `PrimaryMainFrameRenderProcessGone(base::TerminationStatus)`, `WEB_CONTENTS_USER_DATA_KEY_DECL()` | as recalled | diagnostics/hang_collector.* |
| `net::NetLog::ThreadSafeObserver::OnAddEntry` | as recalled | diagnostics/net_collector.cc |
| `device::FidoDiscoveryFactory::Create(FidoTransportProtocol)` returns `std::vector<std::unique_ptr<FidoDiscoveryBase>>`; `FidoDiscoveryBase` in `device/fido/fido_discovery_base.h`; `FidoAuthenticator` in `device/fido/fido_authenticator.h` | as recalled | passkeys/software_authenticator.h (header only, not compiled) |
| `EVP_aead_xchacha20_poly1305` | present in BoringSSL | passkeys vault |
| Argon2id via `third_party/argon2` | NOT available: no argon2 outside `third_party/jetstream` (a benchmark). BoringSSL offers `EVP_PBE_scrypt`. Open question: vault KDF in C++ (scrypt vs vendoring argon2, which needs a license check). The TS reference uses Argon2id; the file format must match. | passkeys |

## Style plugin (clang chromium-style, errors in this tree)
Any class/struct with a non-trivial member (std::string, std::set, std::vector, std::function ...) needs an explicit out-of-line constructor and destructor (and copy/move for structs that are copied): ModulePermissionTable, ModuleHostService, diagnostics::Event, diagnostics::RingBuffer were fixed this way.

## GN hook
`//BUILD.gn` declares `root_extra_deps = []` (line ~69, appended to `gn_all` deps). `scripts/overlay-tests.sh` sets `root_extra_deps = ["//corvid:corvid_phase1_unittests"]` in the out dir's `args.gn`, so `//corvid` is loaded without patching any upstream file. Other out dirs (e.g. the shipping `chrome` build) are unaffected.

## Not compiled (honest status)
- diagnostics `collectors` (hang_collector.cc, net_collector.cc): need `event_bus.h` / `stack_sampler.h` that do not exist yet (Phase 2). Signatures checked against the tree; target exists in BUILD.gn but nothing depends on it.
- passkeys/software_authenticator.h: header only, no BUILD target.
- chrome_shell ShellHandler, ModuleHost Mojo binder: not written.
- sync: Go module, tested with `go test` (not GN).
