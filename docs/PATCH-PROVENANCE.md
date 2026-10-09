# Patch and dependency provenance

Record every patch, snippet, or dependency not written fresh for Corvid. Confirm license compatibility with BSD-3-Clause before reuse; ask the user for anything outside BSD/MIT/Apache-2.0.

No upstream code or patches have been copied into this repo. The rows below record the Phase 0.6 review only. All "Decision" values are recommendations awaiting the user, except where a license plainly blocks reuse.

| Item | Source | License | Used how | Date | Decision |
|---|---|---|---|---|---|
| Helium patch set | https://github.com/imputnet/helium | **GPL-3.0** for "all code, patches, modified portions of imported code or patches, and any other content that is unique to Helium"; imported content keeps its original license (README License section) | None. Idea/structure reference only | 2026-10-09 | Do not copy. GPL-3.0 patches cannot go into a BSD-3 tree without relicensing. Write fresh; if a specific patch is wanted, trace it to its original upstream author/license (Helium notes some come from Inox, Debian, Bromite, Iridium, Brave) or ask the user. Needs user approval for any reuse. |
| ungoogled-chromium patches | https://github.com/ungoogled-software/ungoogled-chromium | **BSD-3-Clause** ("Copyright (c) 2015-2026, The ungoogled-chromium Authors") | Candidate source for debrand/de-Google patch ideas (Phase 1.1) | 2026-10-09 | Compatible in principle. Caveats: patches are rebased per Chromium version (so useless verbatim for another pin), and the repo itself carries content derived from other projects whose per-file licenses were NOT individually checked. Before adapting any patch, read its header/origin, record it here per patch, and keep the copyright notice. Prefer rewriting. |
| Brave (brave-core, `chromium_src` override approach) | https://github.com/brave/brave-core | **MPL-2.0** (GitHub license metadata and repo LICENSE) | Pattern reference only: overriding Chromium files via a parallel source tree instead of patching in place | 2026-10-09 | Do not copy files. MPL-2.0 is file-level copyleft: modified/copied MPL files must stay MPL, which is outside the BSD/MIT/Apache default and needs user approval. Ideas and architecture are not copyrightable; Corvid's `src-overlay/` plus small hook patches is an independent design. |
| material-color-utilities | Google | Apache-2.0 (confirm) | palette generation | - | pending (Phase 1.4; not reviewed in Phase 0) |
| uBlock Origin | gorhill/uBlock | GPL-3.0 | bundled unmodified extension | - | pending CR-1 (open; do not decide here) |

## Review notes and limits

- Licenses were read from each project's GitHub repository page (and the ungoogled-chromium LICENSE file) on 2026-10-09. Full license texts for Helium and brave-core were not read line by line; the Helium statement above is quoted from its README.
- Per-patch provenance inside ungoogled-chromium and Helium (which patches originate from Debian, Inox, Bromite, Iridium) was not audited. Each of those has its own license; audit at the time a specific patch is proposed.
- This is an engineering review, not legal advice. CR-1 to CR-6 remain open.

## Reuse policy (proposed, pending user confirmation)

1. Default: write fresh, informed by behaviour descriptions only.
2. BSD/MIT/Apache sources may be adapted with an entry per patch in this table and the original notice preserved.
3. GPL/MPL sources: no code, no patch text; ask the user first.
