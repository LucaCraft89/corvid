---
name: add-patch
description: Create or modify a patch against upstream Chromium with correct series placement, header, and provenance. Use whenever a change to an existing Chromium file is unavoidable.
---

# add-patch

## Decide first
1. Can this live in `src-overlay/` as a new file (new WebUI page, new class, new GN target)? If yes, do that and use the smallest possible hook patch.
2. Can a build flag, Mojo interface, or existing delegate achieve it? Prefer that over editing logic.

## Steps
1. Apply the series to a clean tree, then edit the Chromium file(s).
2. One concern per patch; keep the diff minimal, no reformatting or unrelated cleanup.
3. Run `scripts/refresh-patches.sh <patch-name>`; it writes `patches/<area>/<NNNN>-<slug>.patch` and adds it to `patches/series` in the right position.
4. Add the header block:
   ```
   Purpose: <one line>
   Area: <debrand|ui|extensions|passkeys|diagnostics|build|android|...>
   Files: <list>
   Rebase risk: <low|medium|high> because <reason>
   Origin: <original|adapted from X (license)>
   ```
5. If adapted from Helium/Brave/ungoogled or another project: confirm license compatibility and add an entry to `docs/PATCH-PROVENANCE.md`. Ask the user if license is not BSD/MIT/Apache.
6. Verify: fresh checkout + apply series + build.

## Done when
- Patch applies on fresh checkout, header complete, provenance recorded.
