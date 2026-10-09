---
name: fetch-and-apply-patches
description: Fetch the pinned Chromium version and apply the Corvid patch series plus src-overlay to a clean tree. Use whenever a fresh or reset checkout is needed.
---

# fetch-and-apply-patches

## Inputs
- `scripts/CHROMIUM_VERSION` (exact tag), `patches/series` (ordered list), `src-overlay/`, `branding/config.toml`.

## Steps
1. `scripts/fetch.sh` checks out the pinned tag into `$CORVID_SRC` (default `~/chromium/src`) and runs `gclient sync -D --with_branch_heads`.
2. `scripts/apply-patches.sh` runs: reset tree to pinned tag, apply `patches/series` in order (quilt-style, `git apply --3way` fallback), then rsync `src-overlay/` into the tree, then render branding (names, ids, icons) from `branding/config.toml`.
3. Print a per-patch result table. Stop at the first failure and name the patch, file, and hunk.
4. `scripts/refresh-patches.sh` regenerates patch files from the working tree back into `patches/` after edits (see `add-patch`).

## Done when
- Applying onto a fresh checkout is idempotent and produces no `.rej` or `.orig` files.
- Result table shows all patches applied.

## Pitfalls
- Never hand-edit a patch file's hunk offsets; refresh instead.
- Overlay files must not collide with upstream paths; add new files only (use `add-patch` for changes to existing files).
