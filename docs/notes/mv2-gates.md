# MV2 gates on Chromium 155.0.8059.39 (G3)

Source: read-only greps by the VM builder, relayed 2026-10-13; the draft author did not run them. Hunks do not exist yet.

| Item | Finding | Consequence |
|---|---|---|
| ManifestV2ExperimentManager | gone | the old 0300 plan is obsolete |
| `extensions/common/extension.cc:60` | `kMinimumSupportedManifestVersion = 2` | MV2 extensions load |
| `extensions/browser/manifest_v2_handler.{h,cc}` (348 lines) | disables with `DISABLE_UNSUPPORTED_MANIFEST_VERSION` if `manifest_v2_util::IsExtensionAffected()` | patch the predicate or the disable loop (0300) |
| `manifest_v2_util.{h,cc}`, deprecation UI | present | hide the UI too |
| `APIPermissionID::kWebRequestBlocking` | present in web_request_api.cc (175, 577, 1399), extensions_api_permissions.cc, _permission_features.json, event_router.cc | gate for MV2 not yet checked, 0310 may need no patch |
| `ExternalProviderImpl`, `ExternalPrefLoader` | chrome/browser/extensions/external_provider_impl.{h,cc}; also preinstalled_extensions.cc, extension_management.cc, extension_migrator.cc | 0320 hook point |

## Follow-up greps (route to the VM builder; results go in this file)
1. `rg -n "IsExtensionAffected" chrome extensions components` : all callers.
2. `rg -n "ExtensionManifestV2Availability|kExtensionManifestV2" components chrome extensions` : the policy and feature flags.
3. `rg -n "webRequestBlocking" extensions/common/api/_permission_features.json -B3 -A12` : per-manifest-version / location constraints.
4. `rg -n "CreateExternalProviders" chrome/browser/extensions/external_provider_impl.cc -A40` and `rg -n "IsExternalExtensionUninstalled" chrome/browser/extensions`.
5. 0330: `rg -n "HandleChromeURLOverride|GetNewTabPageURL" chrome/browser`, and whether the NTP resolves through `NewTabPageUI`/`search::GetNewTabPageURL`.
