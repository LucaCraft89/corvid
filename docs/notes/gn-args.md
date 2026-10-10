# GN args vs Chromium 155.0.8059.39 (M1)

Checked with `gn args out/<dir> --list[=name]` on the pinned tree; `scripts/gn-gen.sh <debug|release>` generates `out/GnDebug` / `out/GnRelease` from `build/args/linux-*.gn`. Both `gn gen` clean.

| Old arg | Result | Replacement / how the intent is kept |
|---|---|---|
| `enable_nacl` | removed upstream | dropped; NaCl is gone from the tree |
| `enable_remoting_host` | renamed | `enable_remoting = false` |
| `enable_media_router` | removed (no GN arg, no BUILDFLAG) | Cast/media router is runtime/pref gated; must be disabled in the G2 de-Google patches (`debrand/*`), not by GN |
| `enable_platform_encrypted_hevc` | removed (only `enable_platform_encrypted_dolby_vision`, Windows-only default) | `enable_hevc_parser_and_hw_decoder = true` (HEVC parser + VA-API hw decode on Linux); encrypted HEVC is runtime-feature gated |
| `use_vulkan` | removed | `enable_vulkan = true` (default on Linux, set explicitly); `angle_enable_vulkan` still exists |
| `enable_widevine_cdm_host_verification` | not an arg any more (computed from `enable_library_widevine_cdm && enable_cdm_host_verification`) | dropped; `ignore_missing_widevine_signing_cert = true` kept so no signing is required. `bundle_widevine_cdm = false`, `enable_widevine = true` kept (CR-11) |
| `safe_browsing_mode = 0` | declared, but unsupported for desktop: `gn gen` fails with unresolved `//components/safe_browsing/content/*` deps from `//chrome/browser/*` | left at default (1). Safe Browsing network use must be removed by the G2 patches (prefs/endpoints), and empty `google_api_key` already makes lookups unusable. Not a silent drop: tracked here |
| `enable_service_discovery = false` | declared, but breaks `is_official_build=true` gn gen (`assert(enable_service_discovery)` in `//chrome/browser/local_discovery`, pulled by `service_discovery_sniffer`) | left at default (true); mDNS is LAN-only, no Google endpoint. Revisit via a patch if desired |

Kept unchanged and verified present: `proprietary_codecs`, `ffmpeg_branding="Chrome"`, `rtc_use_h264`, `enable_platform_hevc`, `enable_platform_{ac3_eac3_audio,dolby_vision,mpeg_h_audio,ac4_audio}`, `use_vaapi`, `use_ozone`, `ozone_platform{,_x11,_wayland}`, `use_gtk`, `use_v4l2_codec`, `angle_enable_vulkan`, `use_official_google_api_keys`, `google_*`, `enable_hangout_services_extension`, `enable_widevine`, `bundle_widevine_cdm`, `ignore_missing_widevine_signing_cert`, `disable_fieldtrial_testing_config`, `chrome_pgo_phase`, `use_sysroot`.

Notes
- `linux-debug.gn` is a non-debug (`is_debug=false`) component build by design.
- `enable_hevc_parser_and_hw_decoder` defaults to false when `proprietary_codecs=false`, so Debug (M0) had no HEVC; the new config changes ffmpeg/media defines, so `out/GnDebug` is a near-full rebuild.
- gn only reports unknown args late (after loading BUILD files), so check each arg with `gn args <out> --list=<name>`.
