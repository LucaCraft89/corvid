# Patch and dependency provenance

Record every patch, snippet, or dependency not written fresh for Corvid. Confirm license compatibility with BSD-3-Clause before reuse; ask the user for anything outside BSD/MIT/Apache-2.0.

| Item | Source | License | Used how | Date | Decision |
|---|---|---|---|---|---|
| (candidates to review in Phase 0.6) Helium patch set | - | verify | - | - | pending |
| ungoogled-chromium patches | - | verify | - | - | pending |
| Brave (brave-core / chromium_src override approach) | - | verify (MPL-2.0 at time of writing; confirm) | pattern reference only unless approved | - | pending |
| material-color-utilities | Google (npm `@material/material-color-utilities` 0.4.0) | Apache-2.0 (confirmed from the package's license field and LICENSE file) | palette generation in `theme/engine/` | 2026-10-09 | used; note: 0.4.0 ships an extensionless relative import, handled for Node by `ui/tools/resolve-hooks.mjs` (bundlers are unaffected) |
| uBlock Origin | gorhill/uBlock | GPL-3.0 | bundled unmodified extension | - | approved 2026-10-09 (CR-1): bundle unmodified as a separate extension; ship GPL text + source link; pinned 1.75.0 sha256 393cf957... via scripts/pin-ubo.sh |
| lit 3.3.3 (+ @lit/reactive-element, lit-element, lit-html, @lit-labs/ssr-dom-shim) | Google/Lit project (npm) | BSD-3-Clause | WebUI components | 2026-10-09 | used |
| ajv 8.20.0 (+ fast-deep-equal, fast-uri, json-schema-traverse, require-from-string) | npm | MIT (fast-uri BSD-3-Clause) | JSON schema validation of layouts and module manifests | 2026-10-09 | used |
| typescript 7.0.2 (dev), @types/node 22 (dev) | Microsoft / DefinitelyTyped (npm) | Apache-2.0 / MIT | type checking only | 2026-10-09 | used |
| GN arg names (`proprietary_codecs`, `safe_browsing_mode`, `enable_nacl`, ...) | upstream Chromium; same names also appear in ungoogled-chromium flags.gn | n/a (build argument names) | `build/args/linux-*.gn` written fresh | 2026-10-09 | no third-party text copied; ungoogled-chromium's license was not reviewed here |
| vitest, jsdom | npm | MPL-2.0 / CC0 / BlueOak / MIT-0 transitive deps | NOT USED | 2026-10-09 | rejected: transitive licenses outside BSD/MIT/Apache (vite 8 pulls lightningcss MPL-2.0; jsdom pulls CC0, BlueOak and MIT-0 packages). Tests use Node's built-in test runner instead |
| Widevine CDM | Google (not open source; `third_party/widevine/LICENSE` requires a separate license agreement) | proprietary | NOT bundled; user-initiated component/reuse design only | 2026-10-09 | blocked on CR-11; see docs/notes/widevine.md |

