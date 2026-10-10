---
description: Run the 15-minute idle network capture on a clean profile and attribute every host
---
Run `tests/acceptance/phase-1/01-no-phone-home.mjs` (and `01b-binary-host-grep.sh`) against the current build with a clean profile. List every host contacted, the feature that caused it, and whether it is allowed by `docs/network-allowlist.md`. Never edit the allow-list without asking me. Report PASS only if there are zero unlisted hosts.
