# MV2 gates on Chromium 155.0.8059.39 (G3)

Source: read-only greps by the VM builder, relayed 2026-10-13; the draft author did not run them. Hunks do not exist yet.

| Item | Finding | Consequence |
|---|---|---|
| ManifestV2ExperimentManager | gone | the old 0300 plan is obsolete |
| `extensions/common/extension.cc:60` | `kMinimumSupportedManifestVersion = 2` | MV2 extensions load |
| `extensions/browser/manifest_v2_handler.{h,cc}` (348 lines) | disables with `DISABLE_UNSUPPORTED_MANIFEST_VERSION` if `manifest_v2_util::IsExtensionAffected()` | patch the predicate or the disable loop (0300) |
| `manifest_v2_util.{h,cc}`, deprecation UI | present | hide the UI too |
| `webRequestBlocking` (`_permission_features.json:783`) | extensions and legacy apps on stable allowed with `max_manifest_version` 2; MV3 only with location policy and `min_manifest_version` 3 | MV2 keeps blocking webRequest: **0310 dropped, no patch needed** |
| `ExternalProviderImpl`, `ExternalPrefLoader` | chrome/browser/extensions/external_provider_impl.{h,cc}; also preinstalled_extensions.cc, extension_management.cc, extension_migrator.cc | 0320 hook point |

## Follow-up greps (route to the VM builder; results go in this file)
1. `rg -n "IsExtensionAffected" chrome extensions components` : all callers.
2. `rg -n "ExtensionManifestV2Availability|kExtensionManifestV2" components chrome extensions` : the policy and feature flags.
3. `rg -n "webRequestBlocking" extensions/common/api/_permission_features.json -B3 -A12` : per-manifest-version / location constraints.
4. `rg -n "CreateExternalProviders" chrome/browser/extensions/external_provider_impl.cc -A40` and `rg -n "IsExternalExtensionUninstalled" chrome/browser/extensions`.
5. 0330: `rg -n "HandleChromeURLOverride|GetNewTabPageURL" chrome/browser`, and whether the NTP resolves through `NewTabPageUI`/`search::GetNewTabPageURL`.

## Second grep round (VM builder, 2026-10-13)
- Single switch for MV2 disabling: `manifest_v2_util::IsExtensionAffected` (manifest_v2_util.cc:15, :20). Callers: manifest_v2_handler.cc 154, 167, 176, 214 (disable loop), 255, 295; the member version only in developer_private/extension_info_generator.cc:903 (UI flag). 0300 = make it return false.
- `ExtensionManifestV2Availability`: policy templates and device-policy protos only, no C++; no `kExtensionManifestV2*` feature in non-test code; only pref `kMV2UnsupportedAcknowledgedGloballyPref` (manifest_v2_handler.cc:136).
- `ExternalProviderImpl::CreateExternalProviders(VisitorInterface*, Profile*, ProviderCollection*)` at external_provider_impl.h:58 / .cc:703; pref `extensions.external_uninstalls` (extension_prefs.cc:217).
- NTP: `ExtensionUrlOverrides::HandleChromeURLOverride` extension_url_overrides.cc:455, called from chrome_web_ui_controller_factory.cc:284, reverse at :473; `search::GetNewTabPageURL` search.cc:337 untraced; extension_web_ui.cc removed upstream.
- Remaining greps: constructor args of ExternalProviderImpl at .cc:703 and extension_management install-source rules (0320); `NewTabURLDetails::ForProfile` (0330).
