# Patch and dependency provenance

Record every patch, snippet, or dependency not written fresh for Corvid. Confirm license compatibility with BSD-3-Clause before reuse; ask the user for anything outside BSD/MIT/Apache-2.0.

No upstream code or patches have been copied into this repo. The rows below record the Phase 0.6 review only. All "Decision" values are recommendations awaiting the user, except where a license plainly blocks reuse.

| Item | Source | License | Used how | Date | Decision |
|---|---|---|---|---|---|
| Helium patch set | https://github.com/imputnet/helium | **GPL-3.0** for "all code, patches, modified portions of imported code or patches, and any other content that is unique to Helium"; imported content keeps its original license (README License section) | None. Idea/structure reference only | 2026-10-09 | Do not copy. GPL-3.0 patches cannot go into a BSD-3 tree without relicensing. Write fresh; if a specific patch is wanted, trace it to its original upstream author/license (Helium notes some come from Inox, Debian, Bromite, Iridium, Brave) or ask the user. Needs user approval for any reuse. |
| ungoogled-chromium patches | https://github.com/ungoogled-software/ungoogled-chromium | **BSD-3-Clause** ("Copyright (c) 2015-2026, The ungoogled-chromium Authors") | Candidate source for debrand/de-Google patch ideas (Phase 1.1) | 2026-10-09 | Compatible in principle. Caveats: patches are rebased per Chromium version (so useless verbatim for another pin), and the repo itself carries content derived from other projects whose per-file licenses were NOT individually checked. Before adapting any patch, read its header/origin, record it here per patch, and keep the copyright notice. Prefer rewriting. |
| Brave (brave-core, `chromium_src` override approach) | https://github.com/brave/brave-core | **MPL-2.0** (GitHub license metadata and repo LICENSE) | Pattern reference only: overriding Chromium files via a parallel source tree instead of patching in place | 2026-10-09 | Do not copy files. MPL-2.0 is file-level copyleft: modified/copied MPL files must stay MPL, which is outside the BSD/MIT/Apache default and needs user approval. Ideas and architecture are not copyrightable; Corvid's `src-overlay/` plus small hook patches is an independent design. |
| material-color-utilities | Google (npm `@material/material-color-utilities` 0.4.0) | Apache-2.0 (confirmed from the package's license field and LICENSE file) | palette generation in `theme/engine/` | 2026-10-09 | used; note: 0.4.0 ships an extensionless relative import, handled for Node by `ui/tools/resolve-hooks.mjs` (bundlers are unaffected) |
| uBlock Origin | gorhill/uBlock | GPL-3.0 | bundled unmodified extension | - | approved 2026-10-09 (CR-1): bundle unmodified as a separate extension; ship GPL text + source link; pinned 1.75.0 sha256 393cf957... via scripts/pin-ubo.sh |
| lit 3.3.3 (+ @lit/reactive-element, lit-element, lit-html, @lit-labs/ssr-dom-shim) | Google/Lit project (npm) | BSD-3-Clause | WebUI components | 2026-10-09 | used |
| ajv 8.20.0 (+ fast-deep-equal, fast-uri, json-schema-traverse, require-from-string) | npm | MIT (fast-uri BSD-3-Clause) | JSON schema validation of layouts and module manifests | 2026-10-09 | used |
| typescript 7.0.2 (dev), @types/node 22 (dev) | Microsoft / DefinitelyTyped (npm) | Apache-2.0 / MIT | type checking only | 2026-10-09 | used |
| GN arg names (`proprietary_codecs`, `safe_browsing_mode`, `enable_nacl`, ...) | upstream Chromium; same names also appear in ungoogled-chromium flags.gn | n/a (build argument names) | `build/args/linux-*.gn` written fresh | 2026-10-09 | no third-party text copied; ungoogled-chromium's license was not reviewed here |
| vitest, jsdom | npm | MPL-2.0 / CC0 / BlueOak / MIT-0 transitive deps | NOT USED | 2026-10-09 | rejected: transitive licenses outside BSD/MIT/Apache (vite 8 pulls lightningcss MPL-2.0; jsdom pulls CC0, BlueOak and MIT-0 packages). Tests use Node's built-in test runner instead |
| Widevine CDM | Google (not open source; `third_party/widevine/LICENSE` requires a separate license agreement) | proprietary | NOT bundled; user-initiated component/reuse design only | 2026-10-09 | blocked on CR-11; see docs/notes/widevine.md |

## Review notes and limits

- Licenses were read from each project's GitHub repository page (and the ungoogled-chromium LICENSE file) on 2026-10-09. Full license texts for Helium and brave-core were not read line by line; the Helium statement above is quoted from its README.
- Per-patch provenance inside ungoogled-chromium and Helium (which patches originate from Debian, Inox, Bromite, Iridium) was not audited. Each of those has its own license; audit at the time a specific patch is proposed.
- This is an engineering review, not legal advice. CR-1 to CR-6 remain open.

## Reuse policy (approved 2026-10-09)

1. Default: write fresh, informed by behaviour descriptions only.
2. BSD/MIT/Apache sources may be adapted with an entry per patch in this table and the original notice preserved.
3. GPL/MPL sources: no code, no patch text; ask the user first.

## Decisions recorded

| Date | Decision |
|---|---|
| 2026-10-09 | Reuse policy above APPROVED by the user as proposed. The user favors open source, but this is not a blanket approval to relicense: Corvid stays BSD-3-Clause (locked decision), and each GPL/MPL item (Helium, Brave, uBlock Origin) still needs its own explicit ask. |

## Vendored third-party code

| Component | Source | License used | Notes |
|---|---|---|---|
| Argon2 (reference implementation, portable ref.c, no threads) | https://github.com/P-H-C/phc-winner-argon2 tag 20190702, commit 62358ba2123abd17fccf2a108a301d4b52c01a7c | Apache-2.0 (the work is CC0-1.0 OR Apache-2.0) | `src-overlay/third_party/argon2/`, unmodified files plus our BUILD.gn and README.chromium. Used by `corvid/passkeys/vault_crypto_boringssl.cc` for vault key derivation. Vendoring approved by Luca 2026-10-10 (orchestrator-resume.md). Checked with the reference test vector (argon2id v19, t=2, m=65536, p=1, "password"/"somesalt") in `vault_crypto_boringssl_unittest.cc`. |
