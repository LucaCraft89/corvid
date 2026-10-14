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
- Third round (Azure VM, 2026-10-13): ExternalProviderImpl ctor has 6 args (.h:45-50, .cc:146-152), example call .cc:927-934; GetEffectiveUpdateURL (extension_management.cc:259-276) only acts on policy override_update_url; NewTabURLDetails::ForProfile search.cc:166 (OTR check :170, local_url :188-194, provider URL :206-225). Specs for 0320/0330 are final as text. Untraced: CRX update path for a non-store uBO; whether an early return in ForProfile breaks the incognito NTP.

## G3 build result (20-vCPU VM, 2026-10-13)
- 0300 as applied: replace the bodies of both `IsExtensionAffected` overloads with `return false;`. Do not add an early `return false;` and leave the old code below it: that fails the build with `-Werror=unreachable-code` and `-Werror=unreachable-code-return`.
- 0300, 0320 and 0330 built on Chromium 155.0.8059.39 and `corvid_phase1_unittests` passed 64 of 64. No browser or acceptance test (06, 07, 08) has been run yet.
- 0320 reads `<exe dir>/corvid/preinstalled_extensions.json` (id -> external_crx + external_version, or external_update_url); nothing emits that file yet.
- 0330: the new tab priority is upstream's override order (most recent first), no picked extension is stored, and `NewTabURLDetails::ForProfile` returns chrome://newtab early. The incognito NTP and extension override bypass are untested. The uBO update path is untraced.
- Tree drift: the VM's 13-commit tree has no 0196 and 0197, and 0130 differs by one line from the repo; the series on this branch is unchanged.
