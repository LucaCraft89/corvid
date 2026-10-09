# Widevine CDM for Corvid: options and risks

Status: **research note, 2026-10-09. The licensing question is OPEN (CR-11). Nothing here assumes Corvid is allowed to use or redistribute the Widevine CDM.** The user requires DRM video to work; this note says how that could legitimately happen and what is unknown.

## Source quality

Direct fetches of Google/Widevine pages were blocked in the research sandbox (proxy denied `developers.google.com`, `widevine.com`, and the blog below). What follows is split into:

- **Primary, read from the Chromium source mirror** (raw files from `github.com/chromium/chromium`, `main`, fetched 2026-10-09):
  - `third_party/widevine/LICENSE`: "Google LLC and its affiliates ("Google") own all legal right, title and interest in and to the content decryption module software ... You may not use, modify, sell, or otherwise distribute the Software without a separate license agreement with Google. The Software is not open source software. If you are interested in licensing the Software, please contact www.widevine.com".
  - `third_party/widevine/cdm/widevine.gni`: `enable_widevine` is on by default only for Chrome-branded and Android builds; "Can be optionally enabled in Chromium on non-Android platforms. Please see //src/third_party/widevine/LICENSE file for details." `bundle_widevine_cdm` defaults to true only for Chrome-branded builds. On Linux x64/arm64 the CDM is a "library CDM" and may be deployed as a **component** (`enable_widevine_cdm_component`) or bundled. `enable_widevine_cdm_host_verification` signs additional binaries with Widevine certs; official builds fail without a signing cert unless `ignore_missing_widevine_signing_cert=true`.
  - `chrome/browser/component_updater/widevine_cdm_component_installer.cc`: the CDM is delivered as a component-updater CRX verified against a fixed public-key hash; on Linux a "hint file" records the CDM path so the zygote can load it at startup; it is registered with `Robustness::kSoftwareSecure`.
- **Secondary (web search summaries, not verified against Google's terms):** Widevine charges no fees but requires a license agreement; applications go through Google's Widevine contact page; one independent Chromium-browser developer (Samuel Maddock, blog post "the end of indie web browsers") reported no answer for over four months and then a rejection. Treat that as an anecdote, not policy.
- **Not verified here:** the agreement's actual terms (distribution, sublicensing, robustness rules, branding, update obligations) are normally under NDA; Widevine security-level definitions as published by Google; per-service resolution limits at L3.

## Security level

The Chromium source registers the CDM as software-secure (`kSoftwareSecure`), i.e. Widevine **L3**, the software-only level used by desktop Linux browsers. L1 (hardware-backed) is not available to a Linux desktop browser through this path. Streaming services commonly cap quality at L3 (often SD or 720p); this is widely reported but was not verified here per service.

## Options

| Option | How | Legal | Network | Risk |
|---|---|---|---|---|
| A. Obtain a Widevine license agreement as a browser vendor | Apply via Widevine; if granted, enable the glue (`enable_widevine=true`) and either bundle or deliver the CDM component under the agreement | Clean if granted | Component fetch from the host the agreement specifies | Approval uncertain and slow; may impose requirements (signing certs for host verification, update duty, branding) |
| B. Component download on demand (Chromium's built-in mechanism) | `enable_widevine=true`, `bundle_widevine_cdm=false`; the stock component updater fetches the CDM CRX from Google's update service | **Unclear**: the LICENSE says use/distribution needs a separate agreement; a Chromium-based non-Google browser that triggers a download may still need one | Contacts Google update/CDN hosts (must be user-initiated for Corvid) | Likely violates the LICENSE terms without A; also depends on Google's server accepting a non-Chrome client |
| C. Reuse a CDM already installed on the user's machine (from Chrome, Chromium or Firefox) | Point Corvid at the existing library via the hint-file mechanism / CDM path, never copying or shipping it | **Unclear**: no redistribution by Corvid, but terms of the original install may restrict other uses | None from Corvid | Version skew with Corvid's CDM interface; the other browser may update/remove it; host-verification signature files may not match |
| D. No DRM | `enable_widevine=false` | n/a | none | DRM video does not play; conflicts with the user's requirement |

Recommendation (for the user to decide, not decided here): pursue **A** in parallel with building the user-initiated plumbing so that **B or C** can be switched on only if A (or legal advice) allows it. Do not distribute release builds that can fetch the CDM until CR-11 is answered.

## Corvid design (user-initiated, never at idle)

- Build: `enable_widevine = true` and `bundle_widevine_cdm = false` in `build/args/linux-*.gn`. This compiles the open-source glue only; **no CDM binary is bundled**. The CDM component is not registered at startup.
- Setting `drm.widevine` (module `corvid.drm`): `off` | `ask` (default) | `on`. `ask` means: on the first page that requests the `com.widevine.alpha` key system and finds no CDM, Corvid shows a Corvid dialog explaining what will be downloaded, from which host, and the licensing status; nothing is fetched without the user accepting. `off` never prompts. `on` means the user already accepted and the component may update.
- Never downloaded at idle: the component updater has no Widevine registration until the user accepts; the idle capture test (`01-no-phone-home`) must still pass on a fresh profile.
- Documented exception: `docs/network-allowlist.md` section "User-initiated exceptions" lists the Widevine component hosts. They are allowed only inside an explicit user action, never in the idle capture.
- Recording: acceptance check 14 (to be written when a build exists) plays a Widevine test stream after acceptance and checks that no Widevine host was contacted before it.

## Open questions (CR-11)

1. Will Corvid apply for a Widevine license as a browser vendor, and who applies (the project has no legal entity yet; CR-4 name/trademark is also open)?
2. Until then, is option C (reuse an installed CDM) acceptable to the user, given the unclear terms?
3. Is a build that cannot fetch the CDM acceptable for the first public release?
