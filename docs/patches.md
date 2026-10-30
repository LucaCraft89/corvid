# Patches

Corvid is Helium plus a short series of our own. Order (`build/patch.sh`):

1. Helium's main patches, then Helium's Linux patches.
2. Helium's domain substitution, name substitution, translations, version, icons.
3. `brand`: `build/brand.py` turns "Helium" into the name in `build/branding.conf`
   (UI strings, BRANDING file, URL scheme, binary, profile folder, desktop file,
   placeholder icons). No patch hardcodes the product name.
4. `corvid-patches`: `patches/common/series`, then `patches/linux/series`
   (`build/apply-patches.sh`, strict: no fuzz).

Our patches apply to the finished, branded tree. So a patch that touches a line
with the product name in it breaks if the name changes; keep such lines out.

## Editing patches

`build/apply-patches.sh` keeps a small git repo (`$CORVID_WORK/srcgit`, work
tree `$SRC`) that tracks only the files our patches touch: commit `base` (tag `corvid-base`), then
one commit per patch whose message is its path, e.g. `common/privacy/foo.patch`.

```sh
build/srcgit.sh track chrome/foo.cc         # BEFORE editing a file no patch touches yet
$EDITOR /work/src/chrome/foo.cc
build/refresh-patches.sh --into common/privacy/foo.patch   # new patch, or folds into it
build/build.sh && test it
git add patches && git commit
```

- `build/srcgit.sh <git args>` is plain git on the tree: `status`, `diff`,
  `log --oneline corvid-base..HEAD`. Never `add -A` / `add .` without paths.
- `build/refresh-patches.sh` with no argument regenerates every patch from the
  commits and rewrites both series files in commit order; it refuses if there
  are uncommitted changes. Reorder or drop patches with
  `build/srcgit.sh rebase -i corvid-base`, then refresh.
- New files: `build/srcgit.sh add path/new_file` before refreshing.
- A file edited before `track` gets a wrong base. Fix: restore it, track, redo.

## Rules

- One patch per change, named for what it does. Keep the count low: every patch
  is rebased every Chromium release.
- Linux-only code goes to `patches/linux`, everything else to `patches/common`.
- A patch is done when the tree builds, the browser runs, and the check for it
  (for privacy patches: `build/privacy-gate.sh`) has been run.
