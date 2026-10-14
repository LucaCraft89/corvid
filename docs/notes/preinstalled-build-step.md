# Preinstalled extension build step (spec for 0320, 2026-10-13)

Goal: uBlock Origin 1.75.0 (MV2, GPL-3.0, user-removable) is installed and enabled on a fresh profile, removal sticks, nothing is fetched from the network at first run.

## Pipeline (all steps are build-host steps, none touches the Chromium tree except 0320)
1. `scripts/pin-ubo.sh` (exists): downloads the GitHub release asset `uBlock0_1.75.0.chromium.zip` and pins its sha256 in `extensions/preinstalled.toml` (trust on first use; re-verify from another network before release).
2. Verify + unpack: `sha256sum` the zip against the toml, unzip into `out/preinstalled/ublock-origin/` (no modification: `modify_source = false`).
3. Signing key: generate once, outside the repo, never commit: `openssl genrsa -out $CORVID_KEYS/preinstalled.pem 2048`. The extension id derives from it (`scripts/gen-preinstalled.py --id-from-key KEY.pem`; the id for the tested throwaway key matched the Chromium nibble mapping a..p of SHA-256(SPKI)[:16], but compare once against `chrome://extensions` after the first install). Keep the same key for every release so the id is stable. Key custody (Luca, 2026-10-14): the build host holds it for now; Luca moves it to GitHub secrets later. Create it with `scripts/make-preinstalled-key.sh` on the machine that packs the CRX (writes `$CORVID_KEYS/preinstalled.pem`, 0600, never printed or committed). One key for all builds; if two machines pack CRXs, copy the file between them out of band, never through the repo or chat. If the key is lost the extension id changes and existing profiles see a different extension.
4. Pack the CRX with the built browser: `out/GnDebug/chrome --pack-extension=out/preinstalled/ublock-origin --pack-extension-key=$CORVID_KEYS/preinstalled.pem` (needs a built `chrome`; output `<dir>.crx` next to the dir). Verify the manifest in the zip is MV2 and the version is 1.75.0.
5. Generate loader JSON: `python3 scripts/gen-preinstalled.py --slug ublock-origin --crx out/preinstalled/ublock-origin.crx --key $CORVID_KEYS/preinstalled.pem --out out/GnDebug/corvid-preinstalled` (tested here with a throwaway key and a dummy CRX; emits `<id>.json` = `{"external_crx": ..., "external_version": ...}` plus `preinstalled.manifest.json`).
6. Packaging copies `corvid-preinstalled/` and the CRX into the install dir (`/opt/corvid/preinstalled/`); `scripts/package.sh` needs that copy step added (not done).

## 0320 in the browser (decision)
Two ways to make `ExternalProviderImpl` read the generated JSON; pick on the tree:
- A (preferred, smallest): in `CreateExternalProviders` (external_provider_impl.cc:~703, 927-934 pattern) add one `ExternalProviderImpl` whose loader is an `ExternalPrefLoader` pointed at the Corvid dir (needs a `base::DIR_*` key or a constructor taking an absolute path: grep `ExternalPrefLoader::ExternalPrefLoader` and `DIR_EXTERNAL_EXTENSIONS`). Patch `debrand/0180` (no external extension dirs on Linux) must keep this one dir allowed: check 0180's current text so the two do not cancel.
- B: the `corvid::PreinstalledExtensionsLoader` in the overlay (as in the 0320 spec) that reads the same JSON.
Location `kExternalPref`, flags `WAS_INSTALLED_BY_DEFAULT` (+ `FROM_WEBSTORE` only if the update path needs it). Removal sticks through the existing `extensions.external_uninstalls` pref.

## Verification (acceptance 07)
Fresh profile: uBO listed and enabled; removing it and restarting leaves it removed; blocking works on the test page; no network connection at first run (idle capture).

## Open
Incognito default (`ask-at-first-run` in the toml). CRX update path for a non-store extension is not traced (extension_management update URL handling); until traced, updates are a release-time re-pin, not in-browser.
