# Extension compatibility (task 1.12)

Status: **skeleton. No extension has been run.** The sweep needs a built browser; nothing here is a measured result.

## Target

Pass rate target: **TBD by the user (CR-6; proposed 85%)**. Recorded below after each sweep and after each Chromium rebase (`mv2-maintenance` step 6).

## Method (`tests/ext-compat/`)

1. `tests/ext-compat/top-100.json`: the list of extensions to test, with id, name, manifest version, source (GitHub release / package URL), and the smoke test. **The list itself is not curated yet** (needs a decision on source, see CR-2: the Chrome Web Store has terms-of-service implications for non-Chrome browsers). Do not scrape a store without that decision.
2. For each: install into a fresh profile, load a fixture page, run its smoke check (action button renders, content script marker present, options page loads, no errors in the background page), restart, re-check.
3. Result per extension: `pass`, `fail` (with the console/log excerpt), or `skip` (needs an account/payment).
4. `node tests/ext-compat/summarize.mjs results.json` prints the pass rate and updates the table below.

## Results

| Date | Chromium | Corvid | Tested | Pass | Fail | Skip | Pass rate |
|---|---|---|---|---|---|---|---|
| (none) | | | | | | | |

## Failures

| Extension | MV | Failure | Cause | Task |
|---|---|---|---|---|
| (none recorded) | | | | |

## Canaries (run on every rebase)

- uBlock Origin (full MV2): blocks on the local ad test page.
- `tests/fixtures/ext/mv2-blocking-webrequest/`: MV2 test extension (blocking webRequest, persistent background, content script).
- `tests/fixtures/ext/mv3-basic/`: MV3 test extension (service worker, declarativeNetRequest).
- `tests/fixtures/ext/newtab-override-a/`, `newtab-override-b/`: new tab override extensions.
